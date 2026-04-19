"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/lib/supabase";

type Ticket = {
  id: string;
  created_at: string;
  updated_at: string;

  user_id: string;
  user_email: string | null;

  subject: string;
  category: string;
  priority: string;
  status: string;

  order_id: string | null;
  channel: string;

  message: string;
  attachments: any[];

  last_customer_message_at: string | null;
  last_support_message_at: string | null;
};

type Msg = {
  id: string;
  created_at: string;
  ticket_id: string;
  user_id: string | null; // ticket-owner id in our design
  sender_role: "customer" | "support" | "admin";
  message: string;
  attachments: any[];
};

type AttachmentMeta = {
  bucket: string;
  path: string;
  name: string;
  size: number;
  contentType: string;
};

type AttachmentUI = AttachmentMeta & { signedUrl?: string | null };
type AudienceFilter = "all" | "owner" | "driver" | "customer";

function safeLower(s: any) {
  return String(s || "").toLowerCase();
}

function fmtTime(iso?: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return String(iso);
  }
}

function clamp(s: any, max = 110) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}

function ticketTone(t: Ticket) {
  const p = safeLower(t.priority);
  const st = safeLower(t.status);
  if (st === "resolved" || st === "closed") return "good";
  if (p === "urgent" || p === "high") return "warn";
  return "neutral";
}

function ticketAudience(t: Ticket): Exclude<AudienceFilter, "all"> {
  const category = safeLower(t.category);
  const channel = safeLower(t.channel);

  if (category.includes("owner") || channel.includes("manager") || channel.includes("owner")) return "owner";
  if (channel.includes("driver")) return "driver";
  if (category.includes("dispatch") || category.includes("driver_support")) return "driver";
  if ((channel === "ios" || channel === "android") && (category === "dispatch" || category === "technical" || category === "payout")) {
    return "driver";
  }
  return "customer";
}

function audienceLabel(v: Exclude<AudienceFilter, "all">) {
  if (v === "owner") return "Owner";
  if (v === "driver") return "Driver";
  return "Customer";
}

/* =========================
   Attachments helpers
   ========================= */
const ATTACH_BUCKET = "support_attachments";
const MAX_FILES = 6;
const MAX_MB = 6;

function isImageFile(f: File) {
  return f?.type?.startsWith("image/");
}

function bytesToMb(n: number) {
  return n / (1024 * 1024);
}

function safeName(name: string) {
  return String(name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function uidShort() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

async function createSignedUrl(bucket: string, path: string, expiresSec = 60 * 60) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresSec);
  if (error) return null;
  return data?.signedUrl || null;
}

export default function AdminSupportPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  // tickets
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);

  // filters
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "pending" | "resolved" | "closed">("all");
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // thread
  const [threadLoading, setThreadLoading] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  // status updates
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [sending, setSending] = useState(false);

  // ✅ reply attachments
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [replyPreviews, setReplyPreviews] = useState<string[]>([]);
  const replyFileRef = useRef<HTMLInputElement | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 1700);
  }

  function clearReplyAttachments() {
    for (const u of replyPreviews) URL.revokeObjectURL(u);
    setReplyFiles([]);
    setReplyPreviews([]);
    if (replyFileRef.current) replyFileRef.current.value = "";
  }

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const incoming = Array.from(files);
    const nextFiles: File[] = [...replyFiles];
    const nextPreviews: string[] = [...replyPreviews];

    for (const f of incoming) {
      if (nextFiles.length >= MAX_FILES) break;
      if (!isImageFile(f)) continue;
      if (bytesToMb(f.size) > MAX_MB) continue;

      nextFiles.push(f);
      nextPreviews.push(URL.createObjectURL(f));
    }

    setReplyFiles(nextFiles);
    setReplyPreviews(nextPreviews);
  }

  function removeFileAt(idx: number) {
    const nextFiles = [...replyFiles];
    const nextPreviews = [...replyPreviews];
    const [removedUrl] = nextPreviews.splice(idx, 1);
    nextFiles.splice(idx, 1);
    if (removedUrl) URL.revokeObjectURL(removedUrl);
    setReplyFiles(nextFiles);
    setReplyPreviews(nextPreviews);
  }

  async function uploadAttachments(ownerUserId: string, ticketId: string, files: File[]): Promise<AttachmentMeta[]> {
    if (!files || files.length === 0) return [];

    const metas: AttachmentMeta[] = [];
    for (const f of files) {
      const clean = safeName(f.name);
      const path = `${ownerUserId}/${ticketId}/${uidShort()}-${clean}`;

      const { error } = await supabase.storage.from(ATTACH_BUCKET).upload(path, f, {
        cacheControl: "3600",
        upsert: false,
        contentType: f.type || "application/octet-stream",
      });
      if (error) throw error;

      metas.push({
        bucket: ATTACH_BUCKET,
        path,
        name: f.name,
        size: f.size,
        contentType: f.type || "application/octet-stream",
      });
    }

    return metas;
  }

  async function hydrateSignedUrlsForMessages(list: Msg[]): Promise<Msg[]> {
    const pairs: { bucket: string; path: string }[] = [];
    const seen = new Set<string>();

    for (const m of list) {
      const atts = Array.isArray(m.attachments) ? (m.attachments as AttachmentUI[]) : [];
      for (const a of atts) {
        const bucket = (a as any)?.bucket || ATTACH_BUCKET;
        const path = (a as any)?.path;
        if (!path) continue;
        const key = `${bucket}::${path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ bucket, path });
      }
    }

    const urlMap = new Map<string, string | null>();
    await Promise.all(
      pairs.map(async (p) => {
        const url = await createSignedUrl(p.bucket, p.path, 60 * 60);
        urlMap.set(`${p.bucket}::${p.path}`, url);
      })
    );

    return list.map((m) => {
      const atts = Array.isArray(m.attachments) ? (m.attachments as AttachmentUI[]) : [];
      const nextAtts = atts.map((a) => {
        const bucket = (a as any)?.bucket || ATTACH_BUCKET;
        const path = (a as any)?.path;
        if (!path) return a;
        const signedUrl = urlMap.get(`${bucket}::${path}`) ?? null;
        return { ...(a as any), bucket, signedUrl };
      });
      return { ...m, attachments: nextAtts as any[] };
    });
  }

  async function loadTickets() {
    setErr("");
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .select(
          "id, created_at, updated_at, user_id, user_email, subject, category, priority, status, order_id, channel, message, attachments, last_customer_message_at, last_support_message_at"
        )
        .order("updated_at", { ascending: false });

      if (error) throw error;

      setTickets((data || []) as Ticket[]);

      // keep active ticket fresh if already open
      if (activeTicket?.id) {
        const fresh = (data || []).find((x: any) => x.id === activeTicket.id) as Ticket | undefined;
        if (fresh) setActiveTicket(fresh);
      }
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function openTicket(t: Ticket) {
    setActiveTicket(t);
    setThreadLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase
        .from("support_ticket_messages")
        .select("id, created_at, ticket_id, user_id, sender_role, message, attachments")
        .eq("ticket_id", t.id)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const list = (data || []) as Msg[];

      let displayList: Msg[] = list;
      if (list.length === 0) {
        displayList = [
          {
            id: "seed",
            created_at: t.created_at,
            ticket_id: t.id,
            user_id: t.user_id,
            sender_role: "customer",
            message: t.message,
            attachments: t.attachments || [],
          },
        ];
      }

      const hydrated = await hydrateSignedUrlsForMessages(displayList);
      setMsgs(hydrated);

      setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: "smooth" }), 120);
    } catch (e: any) {
      setErr(e?.message || String(e));
      setMsgs([]);
    } finally {
      setThreadLoading(false);
    }
  }

  async function setTicketStatus(nextStatus: "open" | "pending" | "resolved" | "closed") {
    if (!activeTicket) return;
    setErr("");
    setStatusUpdating(true);
    try {
      const { error } = await supabase.from("support_tickets").update({ status: nextStatus }).eq("id", activeTicket.id);

      if (error) throw error;

      showToast(`Status updated: ${nextStatus} ✅`);
      await loadTickets();

      // refresh active ticket from list
      const fresh = tickets.find((x) => x.id === activeTicket.id);
      if (fresh) setActiveTicket({ ...fresh, status: nextStatus });
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setStatusUpdating(false);
    }
  }

  async function sendReply() {
    if (!activeTicket) return;
    const m = reply.trim();
    if (m.length < 2 && replyFiles.length === 0) return;

    setErr("");
    setSending(true);
    try {
      const nowIso = new Date().toISOString();

      // ✅ upload attachments first (owner folder = ticket owner)
      const metas = await uploadAttachments(activeTicket.user_id, activeTicket.id, replyFiles);

      // ✅ IMPORTANT FIX:
      // support_ticket_messages.user_id is NOT NULL.
      // We store the TICKET OWNER (customer) id here for ALL messages.
      const { error: msgErr } = await supabase.from("support_ticket_messages").insert({
        ticket_id: activeTicket.id,
        user_id: activeTicket.user_id, // ✅ NOT NULL (ticket owner)
        sender_role: "admin",
        message: m,
        attachments: metas,
      });

      if (msgErr) throw msgErr;

      // update ticket timestamps + status
      const nextStatus =
        safeLower(activeTicket.status) === "resolved" || safeLower(activeTicket.status) === "closed"
          ? "open"
          : safeLower(activeTicket.status) === "open"
          ? "open"
          : "pending";

      const { error: upErr } = await supabase
        .from("support_tickets")
        .update({
          last_support_message_at: nowIso,
          status: nextStatus,
        })
        .eq("id", activeTicket.id);

      if (upErr) throw upErr;

      setReply("");
      clearReplyAttachments();
      showToast("Reply sent ✅");

      await loadTickets();
      await openTicket({ ...activeTicket, status: nextStatus });
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    loadTickets();

    // refresh inbox when tickets change
    const chan = supabase
      .channel("admin-support-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => {
        loadTickets();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(chan);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ When an admin has a ticket open, auto-refresh thread if new messages arrive
  useEffect(() => {
    if (!activeTicket?.id) return;

    const c = supabase
      .channel(`admin-support-thread-${activeTicket.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${activeTicket.id}` },
        async () => {
          await openTicket(activeTicket);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(c);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicket?.id]);

  useEffect(() => {
    return () => {
      for (const u of replyPreviews) URL.revokeObjectURL(u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const c = { open: 0, pending: 0, resolved: 0, closed: 0 };
    for (const t of tickets) {
      const k = safeLower(t.status) as keyof typeof c;
      if (c[k] !== undefined) c[k] += 1;
    }
    return c;
  }, [tickets]);

  const audienceCounts = useMemo(() => {
    const c = { owner: 0, driver: 0, customer: 0 };
    for (const t of tickets) {
      const key = ticketAudience(t);
      c[key] += 1;
    }
    return c;
  }, [tickets]);

  const categoryOptions = useMemo(
    () => [
      { v: "all", label: "All categories" },
      { v: "general", label: "General" },
      { v: "order", label: "Order" },
      { v: "payment", label: "Payment" },
      { v: "account", label: "Account" },
      { v: "restaurant", label: "Restaurant" },
      { v: "groceries", label: "Groceries" },
      { v: "delivery", label: "Delivery" },
      { v: "other", label: "Other" },
    ],
    []
  );

  const filteredTickets = useMemo(() => {
    let base = tickets;

    if (audienceFilter !== "all") base = base.filter((t) => ticketAudience(t) === audienceFilter);
    if (statusFilter !== "all") base = base.filter((t) => safeLower(t.status) === statusFilter);
    if (catFilter !== "all") base = base.filter((t) => safeLower(t.category) === catFilter);

    const s = search.trim().toLowerCase();
    if (s) {
      base = base.filter((t) => {
        return (
          safeLower(t.subject).includes(s) ||
          safeLower(t.message).includes(s) ||
          safeLower(t.user_email || "").includes(s) ||
          safeLower(t.order_id || "").includes(s) ||
          safeLower(t.category).includes(s) ||
          safeLower(t.channel || "").includes(s) ||
          safeLower(t.priority).includes(s) ||
          safeLower(t.status).includes(s)
        );
      });
    }

    return base;
  }, [tickets, audienceFilter, statusFilter, catFilter, search]);

  return (
    <main style={pageBg}>
      {toast ? <div style={toastBox}>{toast}</div> : null}

      <div style={wrap}>
        <div style={topRow}>
          <div>
            <div style={kicker}>ADMIN - SUPPORT</div>
            <h1 style={title}>Support Inbox</h1>
            <div style={subTitle}>Clean support inbox with separate Owner, Driver, and Customer ticket lanes.</div>
          </div>

          <div style={statCard}>
            <div style={statRow}>
              <div style={statPill}>Open</div>
              <div style={statNum}>{counts.open}</div>
            </div>
            <div style={statRow}>
              <div style={statPill}>Pending</div>
              <div style={statNum}>{counts.pending}</div>
            </div>
            <div style={statRow}>
              <div style={statPill}>Resolved</div>
              <div style={statNum}>{counts.resolved}</div>
            </div>
            <div style={statRow}>
              <div style={statPill}>Closed</div>
              <div style={statNum}>{counts.closed}</div>
            </div>

            <button onClick={loadTickets} style={btnGhostSmall}>
              Refresh
            </button>
          </div>
        </div>

        {err ? <div style={alertErr}>{err}</div> : null}
        {loading ? <div style={loadingHint}>Loading tickets...</div> : null}

        <div style={twoCol}>
          {/* Left: Ticket List */}
          <div style={panel}>
            <div style={panelHeader}>
              <div style={panelHeaderBlock}>
                <div style={panelTitle}>{audienceFilter === "all" ? "All Tickets" : `${audienceFilter[0].toUpperCase()}${audienceFilter.slice(1)} Tickets`}</div>
                <div style={panelSub}>Separate lanes for Owner, Driver, and Customer. Open any ticket to manage the thread.</div>
                <div style={laneRow}>
                  <button type="button" onClick={() => setAudienceFilter("all")} style={{ ...laneBtn, ...(audienceFilter === "all" ? laneBtnActive : {}) }}>
                    All ({tickets.length})
                  </button>
                  <button type="button" onClick={() => setAudienceFilter("owner")} style={{ ...laneBtn, ...(audienceFilter === "owner" ? laneBtnActive : {}) }}>
                    Owner ({audienceCounts.owner})
                  </button>
                  <button type="button" onClick={() => setAudienceFilter("driver")} style={{ ...laneBtn, ...(audienceFilter === "driver" ? laneBtnActive : {}) }}>
                    Driver ({audienceCounts.driver})
                  </button>
                  <button type="button" onClick={() => setAudienceFilter("customer")} style={{ ...laneBtn, ...(audienceFilter === "customer" ? laneBtnActive : {}) }}>
                    Customer ({audienceCounts.customer})
                  </button>
                </div>
              </div>

              <div style={filtersRow}>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} style={select}>
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="pending">Pending</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>

                <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={select}>
                  {categoryOptions.map((c) => (
                    <option key={c.v} value={c.v}>
                      {c.label}
                    </option>
                  ))}
                </select>

                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search email / order id / subject..." style={searchMini} />
              </div>
            </div>

            {filteredTickets.length === 0 ? (
              <div style={emptyBox}>No tickets match your filters.</div>
            ) : (
              <div style={ticketList}>
                {filteredTickets.map((t) => {
                  const tone = ticketTone(t);
                  const audience = ticketAudience(t);
                  const active = activeTicket?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        clearReplyAttachments();
                        setReply("");
                        openTicket(t);
                      }}
                      style={{
                        ...ticketRow,
                        border: active ? "1px solid rgba(17,24,39,0.45)" : "1px solid rgba(0,0,0,0.08)",
                        background: active ? "rgba(2,6,23,0.04)" : "rgba(255,255,255,0.82)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={ticketSubject}>{t.subject}</div>
                          <div style={ticketMeta}>
                            <span style={pillSoft}>{audienceLabel(audience)}</span>
                            <span style={pill}>{t.category}</span>
                            <span style={pillSoft}>{t.priority}</span>
                            {t.order_id ? <span style={pillSoft}>Order: {t.order_id}</span> : null}
                            {t.channel ? <span style={pillSoft}>{t.channel}</span> : null}
                          </div>
                          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 900, color: "rgba(17,24,39,0.62)" }}>{t.user_email || t.user_id}</div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                          <span style={{ ...statusPill, ...(tone === "good" ? statusGood : tone === "warn" ? statusWarn : statusNeutral) }}>{t.status}</span>
                          <div style={ticketTime}>{fmtTime(t.updated_at)}</div>
                        </div>
                      </div>

                      <div style={ticketPreview}>{clamp(t.message, 140)}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Conversation */}
          <div style={panel}>
            <div style={panelHeader}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={panelTitle}>Conversation</div>
                <div style={panelSub}>
                  {activeTicket ? (
                    <>
                      <b>{activeTicket.subject}</b> | {audienceLabel(ticketAudience(activeTicket))} | {activeTicket.user_email || "customer"} | Status: <b>{activeTicket.status}</b>
                    </>
                  ) : (
                    "Open a ticket to view the chat thread."
                  )}
                </div>
              </div>

              {activeTicket ? (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <select value={safeLower(activeTicket.status) || "open"} onChange={(e) => setTicketStatus(e.target.value as any)} style={select} disabled={statusUpdating}>
                    <option value="open">Open</option>
                    <option value="pending">Pending</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>

                  <button
                    onClick={() => {
                      setActiveTicket(null);
                      clearReplyAttachments();
                      setReply("");
                    }}
                    style={btnTiny}
                  >
                    Close
                  </button>
                </div>
              ) : null}
            </div>

            {!activeTicket ? (
              <div style={emptyBox}>
                Select a ticket on the left.
                <div style={{ marginTop: 10, color: "rgba(17,24,39,0.65)", fontWeight: 900 }}>
                  Tip: Reply clearly and update status to resolved once done.
                </div>
              </div>
            ) : threadLoading ? (
              <div style={emptyBox}>Loading conversation…</div>
            ) : (
              <>
                <div style={threadWrap}>
                  {msgs.map((m) => {
                    const mine = m.sender_role === "admin" || m.sender_role === "support";
                    const atts = Array.isArray(m.attachments) ? (m.attachments as AttachmentUI[]) : [];
                    return (
                      <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                        <div style={{ ...bubble, ...(mine ? bubbleMine : bubbleOther) }}>
                          <div style={bubbleTop}>
                            <span style={bubbleRole}>{mine ? "Admin" : "Customer"}</span>
                            <span style={bubbleTime}>{fmtTime(m.created_at)}</span>
                          </div>

                          <div style={bubbleText}>{m.message}</div>

                          {atts.length > 0 ? (
                            <div style={attGrid}>
                              {atts.map((a, idx) => {
                                const url = (a as any)?.signedUrl;
                                if (!url) return null;
                                return (
                                  <a key={`${a.path}-${idx}`} href={url} target="_blank" rel="noreferrer" style={attItem}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={url} alt={a.name || "attachment"} style={attImg} />
                                  </a>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={threadEndRef} />
                </div>

                <div style={replyBar}>
                  <input
                    ref={replyFileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => addFiles(e.target.files)}
                  />

                  <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                    {replyPreviews.length > 0 ? (
                      <div style={previewRow}>
                        {replyPreviews.map((u, idx) => (
                          <div key={`${u}-${idx}`} style={previewBox}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={u} alt="preview" style={previewImg} />
                            <button type="button" onClick={() => removeFileAt(idx)} style={previewX} title="Remove">
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                      <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply as Admin…" style={replyInput} rows={2} />

                      <button type="button" onClick={() => replyFileRef.current?.click()} style={btnAttach}>
                        + Photo{replyFiles.length ? ` (${replyFiles.length})` : ""}
                      </button>

                      <button onClick={sendReply} style={btnPrimarySmall} disabled={(!reply.trim() && replyFiles.length === 0) || sending}>
                        {sending ? "Sending…" : "Send"}
                      </button>
                    </div>

                    <div style={attachHint}>
                      Attach up to {MAX_FILES} images • Max {MAX_MB}MB each • JPG/PNG/WebP
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/* =========================
   Styles (inline only)
   ========================= */

const pageBg: React.CSSProperties = {
  minHeight: "calc(100vh - 64px)",
  padding: 6,
};

const wrap: React.CSSProperties = {
  maxWidth: 1320,
  margin: "0 auto",
};

const kicker: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 1.6,
  fontWeight: 1000,
  color: "rgba(2,6,23,0.55)",
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 34,
  fontWeight: 1000,
  color: "#0b1220",
  letterSpacing: -0.4,
};

const subTitle: React.CSSProperties = {
  color: "rgba(17,24,39,0.70)",
  fontWeight: 800,
  lineHeight: 1.5,
  maxWidth: 820,
  marginTop: 6,
};

const topRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.2fr 0.8fr",
  gap: 14,
  alignItems: "stretch",
  marginBottom: 12,
};

const statCard: React.CSSProperties = {
  borderRadius: 20,
  padding: 14,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 14px 44px rgba(0,0,0,0.09)",
  backdropFilter: "blur(10px)",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const statRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  padding: "10px 10px",
  borderRadius: 14,
  background: "rgba(2,6,23,0.03)",
  border: "1px solid rgba(0,0,0,0.06)",
};

const statPill: React.CSSProperties = {
  fontWeight: 1000,
  fontSize: 12,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: "rgba(2,6,23,0.70)",
};

const statNum: React.CSSProperties = {
  fontWeight: 1000,
  fontSize: 18,
  color: "#0b1220",
};

const twoCol: React.CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const panel: React.CSSProperties = {
  borderRadius: 20,
  overflow: "hidden",
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 14px 44px rgba(0,0,0,0.09)",
  backdropFilter: "blur(10px)",
  display: "flex",
  flexDirection: "column",
  minHeight: 560,
};

const panelHeader: React.CSSProperties = {
  padding: 14,
  borderBottom: "1px solid rgba(0,0,0,0.06)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
};

const panelTitle: React.CSSProperties = {
  fontWeight: 1000,
  color: "#0b1220",
  fontSize: 16,
};

const panelSub: React.CSSProperties = {
  fontWeight: 800,
  color: "rgba(17,24,39,0.62)",
  fontSize: 12,
};

const panelHeaderBlock: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  flex: 1,
  minWidth: 260,
};

const laneRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const laneBtn: React.CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.82)",
  padding: "8px 12px",
  fontWeight: 900,
  fontSize: 12,
  color: "#0b1220",
  cursor: "pointer",
};

const laneBtnActive: React.CSSProperties = {
  background: "rgba(17,24,39,0.94)",
  color: "#fff",
  border: "1px solid rgba(17,24,39,0.94)",
};

const filtersRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const select: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  fontWeight: 900,
  fontSize: 12,
  outline: "none",
};

const searchMini: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  fontWeight: 900,
  fontSize: 12,
  outline: "none",
  minWidth: 240,
};

const emptyBox: React.CSSProperties = {
  margin: 14,
  padding: 14,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.75)",
  color: "rgba(17,24,39,0.72)",
  fontWeight: 800,
};

const ticketList: React.CSSProperties = {
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  overflow: "auto",
};

const ticketRow: React.CSSProperties = {
  textAlign: "left",
  padding: 12,
  borderRadius: 16,
  cursor: "pointer",
  boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
};

const ticketSubject: React.CSSProperties = {
  fontWeight: 1000,
  color: "#0b1220",
  fontSize: 14,
  lineHeight: 1.25,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 420,
};

const ticketMeta: React.CSSProperties = {
  marginTop: 8,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const pill: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(17,24,39,0.92)",
  color: "#fff",
  fontWeight: 950,
};

const pillSoft: React.CSSProperties = {
  ...pill,
  background: "rgba(255,255,255,0.75)",
  color: "rgba(2,6,23,0.70)",
  border: "1px solid rgba(0,0,0,0.10)",
};

const statusPill: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 999,
  fontWeight: 950,
  border: "1px solid rgba(0,0,0,0.10)",
};

const statusGood: React.CSSProperties = {
  background: "rgba(236,253,245,0.95)",
  border: "1px solid rgba(16,185,129,0.28)",
  color: "#065f46",
};

const statusWarn: React.CSSProperties = {
  background: "rgba(254,243,199,0.95)",
  border: "1px solid rgba(245,158,11,0.30)",
  color: "#92400e",
};

const statusNeutral: React.CSSProperties = {
  background: "rgba(239,246,255,0.95)",
  border: "1px solid rgba(59,130,246,0.25)",
  color: "#1d4ed8",
};

const ticketTime: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(17,24,39,0.55)",
};

const ticketPreview: React.CSSProperties = {
  marginTop: 10,
  fontSize: 13,
  fontWeight: 800,
  color: "rgba(17,24,39,0.70)",
  lineHeight: 1.45,
};

const threadWrap: React.CSSProperties = {
  padding: 12,
  flex: 1,
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const bubble: React.CSSProperties = {
  width: "min(560px, 100%)",
  borderRadius: 18,
  padding: 12,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
};

const bubbleMine: React.CSSProperties = {
  background: "rgba(17,24,39,0.92)",
  color: "#fff",
  border: "1px solid rgba(17,24,39,0.92)",
};

const bubbleOther: React.CSSProperties = {
  background: "rgba(255,255,255,0.90)",
  color: "#0b1220",
};

const bubbleTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  marginBottom: 8,
};

const bubbleRole: React.CSSProperties = {
  fontWeight: 1000,
  fontSize: 12,
  opacity: 0.95,
  textTransform: "uppercase",
  letterSpacing: 1.1,
};

const bubbleTime: React.CSSProperties = {
  fontWeight: 900,
  fontSize: 12,
  opacity: 0.7,
};

const bubbleText: React.CSSProperties = {
  fontWeight: 800,
  fontSize: 13,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
};

const replyBar: React.CSSProperties = {
  padding: 12,
  borderTop: "1px solid rgba(0,0,0,0.06)",
  display: "flex",
  gap: 10,
  alignItems: "stretch",
};

const replyInput: React.CSSProperties = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.88)",
  padding: "10px 12px",
  outline: "none",
  fontWeight: 800,
  fontSize: 13,
  resize: "vertical",
};

const btnPrimarySmall: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 950,
  boxShadow: "0 12px 30px rgba(17,24,39,0.18)",
  cursor: "pointer",
  fontSize: 13,
};

const btnGhostSmall: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.75)",
  color: "#111827",
  textDecoration: "none",
  fontWeight: 950,
  cursor: "pointer",
  fontSize: 13,
};

const btnTiny: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  fontWeight: 950,
  cursor: "pointer",
  fontSize: 12,
};

const btnAttach: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  fontWeight: 950,
  cursor: "pointer",
  fontSize: 13,
  whiteSpace: "nowrap",
};

const attachHint: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "rgba(17,24,39,0.60)",
  marginTop: 4,
};

const previewRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const previewBox: React.CSSProperties = {
  width: 74,
  height: 74,
  borderRadius: 14,
  overflow: "hidden",
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.7)",
  position: "relative",
};

const previewImg: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const previewX: React.CSSProperties = {
  position: "absolute",
  top: 6,
  right: 6,
  width: 22,
  height: 22,
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  fontWeight: 1000,
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  padding: 0,
};

const attGrid: React.CSSProperties = {
  marginTop: 10,
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

const attItem: React.CSSProperties = {
  width: 110,
  height: 110,
  borderRadius: 16,
  overflow: "hidden",
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.7)",
  display: "block",
};

const attImg: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const alertErr: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  border: "1px solid #fecaca",
  background: "rgba(254,242,242,0.9)",
  borderRadius: 14,
  color: "#7f1d1d",
  fontWeight: 900,
};

const loadingHint: React.CSSProperties = {
  marginTop: 12,
  color: "rgba(17,24,39,0.70)",
  fontWeight: 900,
};

const toastBox: React.CSSProperties = {
  position: "fixed",
  top: 16,
  left: "50%",
  transform: "translateX(-50%)",
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  fontWeight: 1000,
  zIndex: 9999,
  boxShadow: "0 12px 32px rgba(0,0,0,0.10)",
};




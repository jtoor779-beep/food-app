"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  user_id: string;
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

function normalizeRole(r: unknown) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
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

function clamp(s: any, max = 80) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "â€¦";
}

function safeLower(s: any) {
  return String(s || "").toLowerCase();
}

function ticketTone(t: Ticket) {
  const p = safeLower(t.priority);
  const st = safeLower(t.status);
  if (st === "resolved" || st === "closed") return "good";
  if (p === "urgent" || p === "high") return "warn";
  return "neutral";
}

/** Detect common Supabase errors when a column or table is missing */
function isMissingColumnOrTableError(msg: string) {
  const m = safeLower(msg);
  return (
    m.includes("does not exist") ||
    m.includes("column") ||
    m.includes("relation") ||
    m.includes("table") ||
    m.includes("schema cache")
  );
}

/** Friendly DB hint shown on UI when something is missing */
function buildDbHint(errMsg: string) {
  const msg = String(errMsg || "");
  return (
    "DB mismatch detected. " +
    "Your Help page expects tables/columns for support tickets + messages. " +
    "Error: " +
    msg
  );
}

/* =========================
   Attachments helpers
   ========================= */
const ATTACH_BUCKET = "support_attachments";
const MAX_FILES = 6;
const MAX_MB = 6; // per image

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

export default function HelpSupportPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [userId, setUserId] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");

  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [dbWarn, setDbWarn] = useState(""); // âœ… added: warns if DB columns/tables missing

  // FAQ
  const [faqQ, setFaqQ] = useState("");
  const faqs = useMemo(
    () => [
      {
        q: "I placed an order but itâ€™s not showing in My Orders.",
        a: "Try refreshing the page, then logout/login. If it still doesnâ€™t show, create a ticket with your order id (if any) and weâ€™ll check the order table + payment status.",
        tag: "orders",
      },
      {
        q: "Payment deducted but order failed.",
        a: "Create a ticket under Payment with the approximate time and amount. Weâ€™ll verify the Stripe session / payment logs and update you.",
        tag: "payment",
      },
      {
        q: "My cart keeps clearing or not updating.",
        a: "This can happen if your browser blocks localStorage or youâ€™re switching accounts. Try another browser/device. If it continues, create a ticket and mention Food vs Groceries cart.",
        tag: "cart",
      },
      {
        q: "How do I change my delivery address or phone number?",
        a: "Open Profile/Settings and update your details. If you canâ€™t find a field, create a ticket under Account and weâ€™ll help.",
        tag: "account",
      },
      {
        q: "Restaurant/Grocery store is missing items or closed.",
        a: "Create a ticket under Restaurant or Groceries with the store name. Weâ€™ll check enabled/approval status and stock flags.",
        tag: "store",
      },
    ],
    []
  );

  const filteredFaqs = useMemo(() => {
    const s = faqQ.trim().toLowerCase();
    if (!s) return faqs;
    return faqs.filter((x) => x.q.toLowerCase().includes(s) || x.a.toLowerCase().includes(s) || x.tag.includes(s));
  }, [faqQ, faqs]);

  // Tickets
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketFilter, setTicketFilter] = useState<"all" | "open" | "pending" | "resolved" | "closed">("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Create ticket modal
  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("normal");
  const [orderId, setOrderId] = useState("");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<"web" | "pwa" | "ios" | "android">("web");
  const [creating, setCreating] = useState(false);

  // âœ… Create ticket attachments
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [createPreviews, setCreatePreviews] = useState<string[]>([]);
  const createFileRef = useRef<HTMLInputElement | null>(null);

  // Ticket thread
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  // âœ… Reply attachments
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [replyPreviews, setReplyPreviews] = useState<string[]>([]);
  const replyFileRef = useRef<HTMLInputElement | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 1700);
  }

  function clearCreateAttachments() {
    for (const u of createPreviews) URL.revokeObjectURL(u);
    setCreateFiles([]);
    setCreatePreviews([]);
    if (createFileRef.current) createFileRef.current.value = "";
  }

  function clearReplyAttachments() {
    for (const u of replyPreviews) URL.revokeObjectURL(u);
    setReplyFiles([]);
    setReplyPreviews([]);
    if (replyFileRef.current) replyFileRef.current.value = "";
  }

  function addFiles(
    files: FileList | null,
    currentFiles: File[],
    setFiles: (x: File[]) => void,
    currentPreviews: string[],
    setPreviews: (x: string[]) => void
  ) {
    if (!files || files.length === 0) return;

    const incoming = Array.from(files);
    const nextFiles: File[] = [...currentFiles];
    const nextPreviews: string[] = [...currentPreviews];

    for (const f of incoming) {
      if (nextFiles.length >= MAX_FILES) break;
      if (!isImageFile(f)) continue;
      if (bytesToMb(f.size) > MAX_MB) continue;

      nextFiles.push(f);
      nextPreviews.push(URL.createObjectURL(f));
    }

    setFiles(nextFiles);
    setPreviews(nextPreviews);
  }

  function removeFileAt(
    idx: number,
    currentFiles: File[],
    setFiles: (x: File[]) => void,
    currentPreviews: string[],
    setPreviews: (x: string[]) => void
  ) {
    const nextFiles = [...currentFiles];
    const nextPreviews = [...currentPreviews];
    const [removedUrl] = nextPreviews.splice(idx, 1);
    nextFiles.splice(idx, 1);
    if (removedUrl) URL.revokeObjectURL(removedUrl);
    setFiles(nextFiles);
    setPreviews(nextPreviews);
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
    // Build unique paths
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

  /** Apply defaults so UI stays stable even if some DB columns are missing */
  function normalizeTicketRow(row: any): Ticket {
    return {
      id: String(row?.id || ""),
      created_at: String(row?.created_at || ""),
      updated_at: String(row?.updated_at || row?.created_at || ""),
      user_id: String(row?.user_id || ""),
      user_email: row?.user_email ?? null,

      subject: String(row?.subject || ""),
      category: String(row?.category || "general"),
      priority: String(row?.priority || "normal"),
      status: String(row?.status || "open"),

      order_id: row?.order_id ?? null,
      channel: String(row?.channel || "web"),

      message: String(row?.message || ""),
      attachments: Array.isArray(row?.attachments) ? row.attachments : row?.attachments ? row.attachments : [],

      last_customer_message_at: row?.last_customer_message_at ?? null,
      last_support_message_at: row?.last_support_message_at ?? null,
    };
  }

  async function loadMeAndTickets() {
    setErr("");
    setDbWarn("");
    setLoading(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr && !String(userErr?.message || "").toLowerCase().includes("auth session missing")) {
        throw userErr;
      }

      const user = userData?.user;
      if (!user?.id) {
        setUserId("");
        setUserEmail("");
        setRole("");
        setTickets([]);
        setActiveTicket(null);
        setMsgs([]);
        return;
      }

      setUserId(user.id);
      setUserEmail(user.email || "");

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profErr) throw profErr;
      setRole(normalizeRole((prof as any)?.role));

      // âœ… Try full select first (best UX)
      const fullSelect =
        "id, created_at, updated_at, user_id, user_email, subject, category, priority, status, order_id, channel, message, attachments, last_customer_message_at, last_support_message_at";

      let tData: any[] | null = null;

      const fullRes = await supabase
        .from("support_tickets")
        .select(fullSelect)
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (fullRes.error) {
        // âœ… fallback if missing columns/table so page still loads
        if (isMissingColumnOrTableError(fullRes.error.message)) {
          setDbWarn(buildDbHint(fullRes.error.message));

          const minimalSelect = "id, created_at, updated_at, user_id, user_email, subject, category";
          const minimalRes = await supabase
            .from("support_tickets")
            .select(minimalSelect)
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false });

          if (minimalRes.error) throw minimalRes.error;
          tData = minimalRes.data || [];
        } else {
          throw fullRes.error;
        }
      } else {
        tData = fullRes.data || [];
      }

      const normalized = (tData || []).map(normalizeTicketRow);
      setTickets(normalized);
    } catch (e: any) {
      const msg = e?.message || String(e);
      setErr(msg);
      if (isMissingColumnOrTableError(msg)) setDbWarn(buildDbHint(msg));
    } finally {
      setLoading(false);
    }
  }

  async function openTicket(t: Ticket) {
    setActiveTicket(t);
    setThreadLoading(true);
    setErr("");
    setDbWarn("");
    try {
      const { data, error } = await supabase
        .from("support_ticket_messages")
        .select("id, created_at, ticket_id, user_id, sender_role, message, attachments")
        .eq("ticket_id", t.id)
        .order("created_at", { ascending: true });

      if (error) {
        if (isMissingColumnOrTableError(error.message)) {
          setDbWarn(buildDbHint(error.message));
          // Fallback: still show ticket message as a "seed"
          const seeded: Msg[] = [
            {
              id: "seed",
              created_at: t.created_at,
              ticket_id: t.id,
              user_id: t.user_id,
              sender_role: "customer",
              message: t.message || "(No message column found in DB yet)",
              attachments: t.attachments || [],
            },
          ];
          const hydrated = await hydrateSignedUrlsForMessages(seeded);
          setMsgs(hydrated);
          return;
        }
        throw error;
      }

      const list = (data || []) as Msg[];

      // If no messages exist yet, show the original ticket message as first bubble (premium UX)
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
      const msg = e?.message || String(e);
      setErr(msg);
      if (isMissingColumnOrTableError(msg)) setDbWarn(buildDbHint(msg));
      setMsgs([]);
    } finally {
      setThreadLoading(false);
    }
  }

  async function createTicket() {
    if (!userId) {
      showToast("Please login first");
      router.push("/login");
      return;
    }

    const s = subject.trim();
    const m = message.trim();
    if (s.length < 4) {
      showToast("Subject is too short");
      return;
    }
    if (m.length < 10) {
      showToast("Please write a bit more detail");
      return;
    }

    setCreating(true);
    setErr("");
    setDbWarn("");
    try {
      // Insert ticket first so we have ticket_id for storage path
      const payload = {
        user_id: userId,
        user_email: userEmail || null,
        subject: s,
        category,
        priority,
        status: "open",
        order_id: orderId.trim() ? orderId.trim() : null,
        channel,
        message: m,
        attachments: [],
        last_customer_message_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("support_tickets")
        .insert(payload)
        .select(
          "id, created_at, updated_at, user_id, user_email, subject, category, priority, status, order_id, channel, message, attachments, last_customer_message_at, last_support_message_at"
        )
        .maybeSingle();

      if (error) {
        if (isMissingColumnOrTableError(error.message)) {
          setDbWarn(buildDbHint(error.message));
        }
        throw error;
      }

      // âœ… upload attachments (if any)
      let ticketAtts: AttachmentMeta[] = [];
      if (data?.id && createFiles.length > 0) {
        ticketAtts = await uploadAttachments(userId, data.id, createFiles);

        // store on ticket row too (nice to have)
        const { error: upTicketErr } = await supabase
          .from("support_tickets")
          .update({ attachments: ticketAtts })
          .eq("id", data.id);

        if (upTicketErr) {
          // don't block (but show error)
          setErr(upTicketErr?.message || String(upTicketErr));
        }
      }

      // Also insert a first message into thread (chat UX)
      if (data?.id) {
        const ins = await supabase.from("support_ticket_messages").insert({
          ticket_id: data.id,
          user_id: userId,
          sender_role: "customer",
          message: m,
          attachments: ticketAtts,
        });

        if (ins.error && isMissingColumnOrTableError(ins.error.message)) {
          setDbWarn(buildDbHint(ins.error.message));
          // Don't block ticket creation if thread table missing
        } else if (ins.error) {
          throw ins.error;
        }
      }

      showToast("Ticket created âœ…");
      setCreateOpen(false);
      setSubject("");
      setOrderId("");
      setMessage("");
      setCategory("general");
      setPriority("normal");
      setChannel("web");
      clearCreateAttachments();

      // refresh list and open the ticket
      await loadMeAndTickets();
      if (data) openTicket(normalizeTicketRow({ ...data, attachments: ticketAtts }));
    } catch (e: any) {
      const msg = e?.message || String(e);
      setErr(msg);
      if (isMissingColumnOrTableError(msg)) setDbWarn(buildDbHint(msg));
    } finally {
      setCreating(false);
    }
  }

  async function sendReply() {
    if (!activeTicket) return;
    const m = reply.trim();
    if (m.length < 2 && replyFiles.length === 0) return;

    setErr("");
    setDbWarn("");
    try {
      const nowIso = new Date().toISOString();

      // âœ… upload attachments first
      const metas = await uploadAttachments(userId, activeTicket.id, replyFiles);

      const { error: msgErr } = await supabase.from("support_ticket_messages").insert({
        ticket_id: activeTicket.id,
        user_id: userId,
        sender_role: "customer",
        message: m,
        attachments: metas,
      });

      if (msgErr) {
        if (isMissingColumnOrTableError(msgErr.message)) setDbWarn(buildDbHint(msgErr.message));
        throw msgErr;
      }

      // Update ticket "updated_at" + last_customer_message_at + status pending
      const { error: upErr } = await supabase
        .from("support_tickets")
        .update({
          last_customer_message_at: nowIso,
          status: activeTicket.status === "resolved" || activeTicket.status === "closed" ? "open" : "pending",
        })
        .eq("id", activeTicket.id);

      if (upErr) {
        if (isMissingColumnOrTableError(upErr.message)) setDbWarn(buildDbHint(upErr.message));
        throw upErr;
      }

      setReply("");
      clearReplyAttachments();
      await loadMeAndTickets();

      // reload thread
      const fresh = tickets.find((x) => x.id === activeTicket.id) || activeTicket;
      setActiveTicket({ ...fresh });
      await openTicket({ ...fresh });
      showToast("Sent âœ…");
    } catch (e: any) {
      const msg = e?.message || String(e);
      setErr(msg);
      if (isMissingColumnOrTableError(msg)) setDbWarn(buildDbHint(msg));
    }
  }

  async function markResolved() {
    if (!activeTicket) return;
    setErr("");
    setDbWarn("");
    try {
      const { error } = await supabase.from("support_tickets").update({ status: "resolved" }).eq("id", activeTicket.id);
      if (error) {
        if (isMissingColumnOrTableError(error.message)) setDbWarn(buildDbHint(error.message));
        throw error;
      }
      showToast("Marked resolved âœ…");
      await loadMeAndTickets();
      const updated = tickets.find((x) => x.id === activeTicket.id);
      if (updated) setActiveTicket(updated);
    } catch (e: any) {
      const msg = e?.message || String(e);
      setErr(msg);
      if (isMissingColumnOrTableError(msg)) setDbWarn(buildDbHint(msg));
    }
  }

  useEffect(() => {
    loadMeAndTickets();

    const { data } = supabase.auth.onAuthStateChange(() => {
      loadMeAndTickets();
    });

    return () => data?.subscription?.unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      // cleanup previews if user navigates away
      for (const u of createPreviews) URL.revokeObjectURL(u);
      for (const u of replyPreviews) URL.revokeObjectURL(u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ticketCounts = useMemo(() => {
    const c = { open: 0, pending: 0, resolved: 0, closed: 0 };
    for (const t of tickets) {
      const k = safeLower(t.status) as keyof typeof c;
      if (c[k] !== undefined) c[k] += 1;
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
    if (ticketFilter !== "all") base = base.filter((t) => safeLower(t.status) === ticketFilter);
    if (catFilter !== "all") base = base.filter((t) => safeLower(t.category) === catFilter);

    const s = search.trim().toLowerCase();
    if (s) {
      base = base.filter((t) => {
        return (
          safeLower(t.subject).includes(s) ||
          safeLower(t.message).includes(s) ||
          safeLower(t.order_id || "").includes(s) ||
          safeLower(t.category).includes(s) ||
          safeLower(t.priority).includes(s) ||
          safeLower(t.status).includes(s)
        );
      });
    }

    return base;
  }, [tickets, ticketFilter, catFilter, search]);

  const isLoggedIn = !!userId;

  return (
    <main style={pageBg}>
      {toast ? <div style={toastBox}>{toast}</div> : null}

      <div style={wrap}>
        <div style={topRow}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={kicker}>HELP & SUPPORT</div>
            <h1 style={title}>Weâ€™re here for you.</h1>
            <div style={subTitle}>
              Create a ticket, track updates, and get fast help for Food + Groceries (and Delivery if needed).
            </div>

            {!isLoggedIn ? (
              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link href="/login" style={btnPrimary}>
                  Login to create tickets
                </Link>
                <Link href="/home" style={btnGhost}>
                  Back to Home
                </Link>
              </div>
            ) : (
              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => {
                    clearCreateAttachments();
                    setCreateOpen(true);
                  }}
                  style={btnPrimary}
                  disabled={creating}
                >
                  + Create Support Ticket
                </button>
                <Link href="/home" style={btnGhost}>
                  Back to Home
                </Link>
              </div>
            )}
          </div>

          <div style={statCard}>
            <div style={statRow}>
              <div style={statPill}>Open</div>
              <div style={statNum}>{ticketCounts.open}</div>
            </div>
            <div style={statRow}>
              <div style={statPill}>Pending</div>
              <div style={statNum}>{ticketCounts.pending}</div>
            </div>
            <div style={statRow}>
              <div style={statPill}>Resolved</div>
              <div style={statNum}>{ticketCounts.resolved}</div>
            </div>
            <div style={statRow}>
              <div style={statPill}>Closed</div>
              <div style={statNum}>{ticketCounts.closed}</div>
            </div>

            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.06)" }}>
              <div style={miniLabel}>Signed in as</div>
              <div style={miniValue}>{isLoggedIn ? userEmail || "user" : "guest"}</div>
              <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={roleBadge}>{isLoggedIn ? role || "user" : "guest"}</span>
                <span style={roleBadgeSoft}>Food â€¢ Groceries</span>
              </div>
            </div>
          </div>
        </div>

        {dbWarn ? <div style={alertWarn}>{dbWarn}</div> : null}
        {err ? <div style={alertErr}>{err}</div> : null}
        {loading ? <div style={loadingHint}>Loading support centerâ€¦</div> : null}

        {/* FAQ */}
        <div style={sectionRow}>
          <div style={sectionTitle}>Quick Help (FAQ)</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input value={faqQ} onChange={(e) => setFaqQ(e.target.value)} placeholder="Search help topicsâ€¦" style={searchInput} />
          </div>
        </div>

        <div style={faqGrid}>
          {filteredFaqs.map((f) => (
            <div key={f.q} style={faqCard}>
              <div style={faqQStyle}>{f.q}</div>
              <div style={faqAStyle}>{f.a}</div>
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={tag}>{f.tag}</span>
                {isLoggedIn ? (
                  <button
                    onClick={() => {
                      setSubject(f.q);
                      setCategory(f.tag === "payment" ? "payment" : f.tag === "orders" ? "order" : "general");
                      clearCreateAttachments();
                      setCreateOpen(true);
                    }}
                    style={btnTiny}
                  >
                    Create ticket
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {/* Tickets + Thread */}
        <div style={twoCol}>
          <div style={panel}>
            <div style={panelHeader}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={panelTitle}>Your Tickets</div>
                <div style={panelSub}>Track status & updates. (Private to your account)</div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <select value={ticketFilter} onChange={(e) => setTicketFilter(e.target.value as any)} style={select}>
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

                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ticketsâ€¦" style={searchMini} />
              </div>
            </div>

            {!isLoggedIn ? (
              <div style={emptyBox}>Login to view and create support tickets.</div>
            ) : filteredTickets.length === 0 ? (
              <div style={emptyBox}>
                No tickets yet. Create one and youâ€™ll see it here.
                <div style={{ marginTop: 10 }}>
                  <button
                    onClick={() => {
                      clearCreateAttachments();
                      setCreateOpen(true);
                    }}
                    style={btnPrimarySmall}
                  >
                    + Create Ticket
                  </button>
                </div>
              </div>
            ) : (
              <div style={ticketList}>
                {filteredTickets.map((t) => {
                  const tone = ticketTone(t);
                  return (
                    <button
                      key={t.id}
                      onClick={() => openTicket(t)}
                      style={{
                        ...ticketRow,
                        border: activeTicket?.id === t.id ? "1px solid rgba(17,24,39,0.45)" : "1px solid rgba(0,0,0,0.08)",
                        background: activeTicket?.id === t.id ? "rgba(2,6,23,0.04)" : "rgba(255,255,255,0.82)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={ticketSubject}>{t.subject}</div>
                          <div style={ticketMeta}>
                            <span style={pill}>{t.category}</span>
                            <span style={pillSoft}>{t.priority}</span>
                            {t.order_id ? <span style={pillSoft}>Order: {t.order_id}</span> : null}
                          </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                          <span style={{ ...statusPill, ...(tone === "good" ? statusGood : tone === "warn" ? statusWarn : statusNeutral) }}>
                            {t.status}
                          </span>
                          <div style={ticketTime}>{fmtTime(t.updated_at)}</div>
                        </div>
                      </div>

                      <div style={ticketPreview}>{clamp(t.message, 120)}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={panel}>
            <div style={panelHeader}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={panelTitle}>Conversation</div>
                <div style={panelSub}>
                  {activeTicket ? (
                    <>
                      Ticket: <b>{activeTicket.subject}</b> â€¢ Status: <b>{activeTicket.status}</b>
                    </>
                  ) : (
                    "Open a ticket to view the chat thread."
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {activeTicket ? (
                  <>
                    <button onClick={markResolved} style={btnGhostSmall}>
                      Mark Resolved
                    </button>
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
                  </>
                ) : null}
              </div>
            </div>

            {!activeTicket ? (
              <div style={emptyBox}>
                Select a ticket from the left panel.
                <div style={{ marginTop: 10, color: "rgba(17,24,39,0.65)", fontWeight: 800 }}>
                  Tip: For fastest response, include order id, screenshots, and exact issue steps.
                </div>
              </div>
            ) : threadLoading ? (
              <div style={emptyBox}>Loading conversationâ€¦</div>
            ) : (
              <>
                <div style={threadWrap}>
                  {msgs.map((m) => {
                    const mine = m.sender_role === "customer";
                    const atts = Array.isArray(m.attachments) ? (m.attachments as AttachmentUI[]) : [];
                    return (
                      <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                        <div style={{ ...bubble, ...(mine ? bubbleMine : bubbleOther) }}>
                          <div style={bubbleTop}>
                            <span style={bubbleRole}>{mine ? "You" : m.sender_role}</span>
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
                    onChange={(e) => addFiles(e.target.files, replyFiles, setReplyFiles, replyPreviews, setReplyPreviews)}
                  />

                  <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                    {replyPreviews.length > 0 ? (
                      <div style={previewRow}>
                        {replyPreviews.map((u, idx) => (
                          <div key={`${u}-${idx}`} style={previewBox}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={u} alt="preview" style={previewImg} />
                            <button
                              type="button"
                              onClick={() => removeFileAt(idx, replyFiles, setReplyFiles, replyPreviews, setReplyPreviews)}
                              style={previewX}
                              title="Remove"
                            >
                              âœ•
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                      <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a replyâ€¦" style={replyInput} rows={2} />

                      <button type="button" onClick={() => replyFileRef.current?.click()} style={btnAttach}>
                        + Photo{replyFiles.length ? ` (${replyFiles.length})` : ""}
                      </button>

                      <button onClick={sendReply} style={btnPrimarySmall} disabled={(!reply.trim() && replyFiles.length === 0) || !isLoggedIn}>
                        Send
                      </button>
                    </div>

                    <div style={attachHint}>
                      Attach up to {MAX_FILES} images â€¢ Max {MAX_MB}MB each â€¢ JPG/PNG/WebP
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Create Ticket Modal */}
      {createOpen ? (
        <div
          style={modalOverlay}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCreateOpen(false);
          }}
        >
          <div style={modalCard}>
            <div style={modalTop}>
              <div>
                <div style={modalTitle}>Create Support Ticket</div>
                <div style={modalSub}>Tell us what happened â€” weâ€™ll respond inside this ticket.</div>
              </div>

              <button
                onClick={() => {
                  setCreateOpen(false);
                }}
                style={btnTiny}
              >
                âœ• Close
              </button>
            </div>

            <div style={formGrid}>
              <div style={field}>
                <div style={label}>Subject</div>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} style={input} placeholder="Short titleâ€¦" />
              </div>

              <div style={field}>
                <div style={label}>Category</div>
                <select value={category} onChange={(e) => setCategory(e.target.value)} style={input}>
                  <option value="general">General</option>
                  <option value="order">Order</option>
                  <option value="payment">Payment</option>
                  <option value="account">Account</option>
                  <option value="restaurant">Restaurant</option>
                  <option value="groceries">Groceries</option>
                  <option value="delivery">Delivery</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div style={field}>
                <div style={label}>Priority</div>
                <select value={priority} onChange={(e) => setPriority(e.target.value)} style={input}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div style={field}>
                <div style={label}>Channel</div>
                <select value={channel} onChange={(e) => setChannel(e.target.value as any)} style={input}>
                  <option value="web">Web</option>
                  <option value="pwa">PWA</option>
                  <option value="ios">iOS</option>
                  <option value="android">Android</option>
                </select>
              </div>

              <div style={fieldWide}>
                <div style={label}>Order ID (optional)</div>
                <input value={orderId} onChange={(e) => setOrderId(e.target.value)} style={input} placeholder="If order relatedâ€¦" />
              </div>

              <div style={fieldWide}>
                <div style={label}>Message</div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  style={textarea}
                  rows={6}
                  placeholder="Explain the issue. Include steps, time, amount, screenshots detailsâ€¦"
                />
              </div>

              {/* âœ… Attach pictures in create ticket */}
              <div style={fieldWide}>
                <div style={label}>Pictures (optional)</div>

                <input
                  ref={createFileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => addFiles(e.target.files, createFiles, setCreateFiles, createPreviews, setCreatePreviews)}
                />

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <button type="button" onClick={() => createFileRef.current?.click()} style={btnAttach}>
                    + Add Photos{createFiles.length ? ` (${createFiles.length})` : ""}
                  </button>

                  {createFiles.length ? (
                    <button type="button" onClick={clearCreateAttachments} style={btnGhostSmall}>
                      Clear
                    </button>
                  ) : null}

                  <span style={attachHint}>
                    Up to {MAX_FILES} images â€¢ Max {MAX_MB}MB each
                  </span>
                </div>

                {createPreviews.length > 0 ? (
                  <div style={{ ...previewRow, marginTop: 10 }}>
                    {createPreviews.map((u, idx) => (
                      <div key={`${u}-${idx}`} style={previewBox}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="preview" style={previewImg} />
                        <button
                          type="button"
                          onClick={() => removeFileAt(idx, createFiles, setCreateFiles, createPreviews, setCreatePreviews)}
                          style={previewX}
                          title="Remove"
                        >
                          âœ•
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div style={modalActions}>
                <button
                  onClick={() => {
                    setCreateOpen(false);
                  }}
                  style={btnGhostSmall}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button onClick={createTicket} style={btnPrimarySmall} disabled={creating}>
                  {creating ? "Creatingâ€¦" : "Create Ticket"}
                </button>
              </div>

              <div style={hint}>
                Pro tips: include <b>order id</b>, exact time, amount, and what you expected vs what happened.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

/* =========================
   Styles (inline only)
   ========================= */

const pageBg: React.CSSProperties = {
  minHeight: "calc(100vh - 64px)",
  padding: 20,
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.22), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.20), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
};

const wrap: React.CSSProperties = {
  maxWidth: 1240,
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
  fontSize: 38,
  fontWeight: 1000,
  color: "#0b1220",
  letterSpacing: -0.4,
};

const subTitle: React.CSSProperties = {
  color: "rgba(17,24,39,0.70)",
  fontWeight: 800,
  lineHeight: 1.5,
  maxWidth: 680,
};

const topRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.2fr 0.8fr",
  gap: 14,
  alignItems: "stretch",
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
  marginBottom: 8,
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

const miniLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 950,
  color: "rgba(17,24,39,0.55)",
};

const miniValue: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 1000,
  color: "#0b1220",
  marginTop: 4,
};

const roleBadge: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(17,24,39,0.92)",
  color: "#fff",
  fontWeight: 950,
  whiteSpace: "nowrap",
};

const roleBadgeSoft: React.CSSProperties = {
  ...roleBadge,
  background: "rgba(255,255,255,0.70)",
  color: "rgba(2,6,23,0.70)",
  border: "1px solid rgba(0,0,0,0.10)",
};

const btnPrimary: React.CSSProperties = {
  padding: "11px 14px",
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 950,
  boxShadow: "0 12px 30px rgba(17,24,39,0.18)",
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  padding: "11px 14px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.75)",
  color: "#111827",
  textDecoration: "none",
  fontWeight: 950,
};

const btnPrimarySmall: React.CSSProperties = {
  ...btnPrimary,
  padding: "10px 12px",
  borderRadius: 12,
  fontSize: 13,
};

const btnGhostSmall: React.CSSProperties = {
  ...btnGhost,
  padding: "10px 12px",
  borderRadius: 12,
  fontSize: 13,
  cursor: "pointer",
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

const sectionRow: React.CSSProperties = {
  marginTop: 16,
  marginBottom: 10,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 1000,
  color: "#0b1220",
};

const searchInput: React.CSSProperties = {
  width: "min(520px, 100%)",
  padding: "12px 14px",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  outline: "none",
  background: "rgba(255,255,255,0.85)",
  fontSize: 14,
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  fontWeight: 800,
};

const faqGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
};

const faqCard: React.CSSProperties = {
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.08)",
  backdropFilter: "blur(10px)",
};

const faqQStyle: React.CSSProperties = {
  fontWeight: 1000,
  color: "#0b1220",
  fontSize: 14,
  lineHeight: 1.35,
};

const faqAStyle: React.CSSProperties = {
  marginTop: 8,
  color: "rgba(17,24,39,0.72)",
  fontWeight: 800,
  fontSize: 13,
  lineHeight: 1.5,
};

const tag: React.CSSProperties = {
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.7)",
  color: "rgba(17,24,39,0.8)",
  fontWeight: 900,
};

const twoCol: React.CSSProperties = {
  marginTop: 14,
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
  minHeight: 520,
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
  minWidth: 220,
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
  width: "min(520px, 100%)",
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

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17,24,39,0.55)",
  zIndex: 10000,
  display: "grid",
  placeItems: "center",
  padding: 16,
};

const modalCard: React.CSSProperties = {
  width: "min(920px, 100%)",
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(0,0,0,0.10)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.28)",
  backdropFilter: "blur(10px)",
};

const modalTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const modalTitle: React.CSSProperties = {
  fontWeight: 1000,
  fontSize: 16,
  color: "#0b1220",
};

const modalSub: React.CSSProperties = {
  marginTop: 6,
  fontWeight: 800,
  color: "rgba(17,24,39,0.65)",
  fontSize: 13,
};

const formGrid: React.CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const field: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const fieldWide: React.CSSProperties = {
  gridColumn: "1 / -1",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const label: React.CSSProperties = {
  fontWeight: 950,
  color: "rgba(2,6,23,0.75)",
  fontSize: 12,
  letterSpacing: 0.6,
  textTransform: "uppercase",
};

const input: React.CSSProperties = {
  padding: "11px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  outline: "none",
  background: "rgba(255,255,255,0.95)",
  fontSize: 13,
  fontWeight: 850,
};

const textarea: React.CSSProperties = {
  ...input,
  resize: "vertical",
  lineHeight: 1.5,
};

const modalActions: React.CSSProperties = {
  gridColumn: "1 / -1",
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 4,
};

const hint: React.CSSProperties = {
  gridColumn: "1 / -1",
  marginTop: 6,
  fontSize: 12,
  fontWeight: 800,
  color: "rgba(17,24,39,0.65)",
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

const alertWarn: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  border: "1px solid rgba(245,158,11,0.35)",
  background: "rgba(255,251,235,0.95)",
  borderRadius: 14,
  color: "#92400e",
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

// keeping your old empty style constants (no logic changes)
const ticketRowShadowFix: React.CSSProperties = {};
const ticketRowBtnReset: React.CSSProperties = {};
const ticketRowFix: React.CSSProperties = {};
const ticketRowNo: React.CSSProperties = {};
const ticketRowOk: React.CSSProperties = {};
const ticketRowCss: React.CSSProperties = {};
const ticketRowExtra: React.CSSProperties = {};
const ticketRowA: React.CSSProperties = {};
const ticketRowB: React.CSSProperties = {};
const ticketRowC: React.CSSProperties = {};
const ticketRowD: React.CSSProperties = {};
const ticketRowE: React.CSSProperties = {};
const ticketRowF: React.CSSProperties = {};
const ticketRowG: React.CSSProperties = {};
const ticketRowH: React.CSSProperties = {};
const ticketRowI: React.CSSProperties = {};
const ticketRowJ: React.CSSProperties = {};

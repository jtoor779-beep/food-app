"use client";

import React, { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabase";

type AnyRow = Record<string, any>;
type ReqStatus = "requested" | "processing" | "paid" | "failed";

type ReceiptOrder = {
  id: string;
  source: "restaurant" | "grocery";
  status: string;
  total: number;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  address: string;
  instructions: string;
  paymentMethod: string;
  items: Array<{ id: string; name: string; qty: number; price: number; image: string }>;
};

const PAYOUT_TABLE = "delivery_payout_requests";
const BANK_TABLE = "delivery_payout_bank_accounts";

const nnum = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const money = (v: unknown) => nnum(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusNorm = (v: unknown): ReqStatus => {
  const s = String(v || "").trim().toLowerCase();
  if (s === "processing") return "processing";
  if (s === "paid") return "paid";
  if (s === "failed") return "failed";
  return "requested";
};
const prettyStatus = (v: unknown) => String(v || "requested").trim().toLowerCase() || "requested";
const fmtWhen = (v: unknown) => {
  try {
    if (!v) return "-";
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  } catch {
    return String(v || "-");
  }
};
const chunk = <T,>(arr: T[], size = 100) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};
const pickStr = (row: AnyRow, keys: string[], fallback = "-") => {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return fallback;
};
const driverIdFromOrder = (o: AnyRow) => String(o?.delivery_user_id || o?.delivery_partner_id || o?.driver_id || o?.rider_id || o?.assigned_delivery_user_id || "").trim();
const payoutFromOrder = (o: AnyRow) => {
  const p = nnum(o?.delivery_payout);
  if (p > 0) return p;
  const fee = nnum(o?.delivery_fee);
  const tip = nnum(o?.tip_amount);
  return fee + tip > 0 ? fee + tip : fee;
};
const orderTotalForDisplay = (o: AnyRow) => {
  const total = nnum(o?.total_amount ?? o?.grand_total ?? o?.amount ?? o?.order_total ?? o?.total_price);
  if (total > 0) return total;
  const sub = nnum(o?.subtotal_amount ?? o?.subtotal ?? o?.sub_total);
  if (sub > 0) return sub;
  return payoutFromOrder(o);
};const completedStatus = (s: unknown) => {
  const v = String(s || "").trim().toLowerCase();
  return v === "delivered" || v === "completed";
};

const earningPendingStatus = (s: unknown) => {
  const v = String(s || "").trim().toLowerCase();
  return v === "requested" || v === "processing";
};
function statusBadgeStyle(s: string): React.CSSProperties {
  if (s === "processing") return { padding: "4px 9px", borderRadius: 999, fontSize: 12, fontWeight: 900, background: "rgba(254,243,199,0.8)", border: "1px solid rgba(245,158,11,0.35)", color: "#92400e" };
  if (s === "paid") return { padding: "4px 9px", borderRadius: 999, fontSize: 12, fontWeight: 900, background: "rgba(209,250,229,0.8)", border: "1px solid rgba(16,185,129,0.35)", color: "#065f46" };
  if (s === "failed") return { padding: "4px 9px", borderRadius: 999, fontSize: 12, fontWeight: 900, background: "rgba(254,226,226,0.8)", border: "1px solid rgba(239,68,68,0.35)", color: "#7f1d1d" };
  return { padding: "4px 9px", borderRadius: 999, fontSize: 12, fontWeight: 900, background: "rgba(219,234,254,0.8)", border: "1px solid rgba(59,130,246,0.35)", color: "#1e40af" };
}

function exportCsv(rows: AnyRow[], fileName: string) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r || {}))));
  const quote = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [cols.map(quote).join(",")];
  for (const r of rows) lines.push(cols.map((c) => quote(r?.[c])).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AdminPayoutsPage() {
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [rows, setRows] = useState<AnyRow[]>([]);
  const [driverMap, setDriverMap] = useState<Record<string, { name: string; email: string }>>({});
  const [bankMap, setBankMap] = useState<Record<string, AnyRow>>({});
  const [allOrders, setAllOrders] = useState<AnyRow[]>([]);
  const [allGroceryOrders, setAllGroceryOrders] = useState<AnyRow[]>([]);

  const [statusFilter, setStatusFilter] = useState<"all" | ReqStatus>("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [poolSourceFilter, setPoolSourceFilter] = useState<"all" | "restaurant" | "grocery">("all");
  const [batchSection, setBatchSection] = useState<"all" | "active" | "paid" | "failed">("all");

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptRow, setReceiptRow] = useState<AnyRow | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptErr, setReceiptErr] = useState("");
  const [receiptOrders, setReceiptOrders] = useState<ReceiptOrder[]>([]);

  const [driverDetailOpen, setDriverDetailOpen] = useState(false);
  const [driverDetailId, setDriverDetailId] = useState("");

  const card: React.CSSProperties = { padding: 14, borderRadius: 16, background: "#fff", border: "1px solid rgba(15,23,42,0.12)", boxShadow: "0 12px 28px rgba(15,23,42,0.07)" };
  const input: React.CSSProperties = { padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(15,23,42,0.15)", background: "#fff", fontWeight: 700, fontSize: 13 };
  const btn: React.CSSProperties = { padding: "9px 12px", borderRadius: 12, border: "1px solid rgba(15,23,42,0.15)", background: "#fff", cursor: "pointer", fontWeight: 900, fontSize: 12 };
  const chipBtn = (active: boolean): React.CSSProperties => ({
    ...btn,
    borderRadius: 999,
    background: active ? "#0f172a" : "#fff",
    color: active ? "#fff" : "#0f172a",
    border: active ? "1px solid #0f172a" : "1px solid rgba(15,23,42,0.15)",
    boxShadow: active ? "0 4px 10px rgba(15,23,42,0.18)" : "none",
  });

  async function loadAll() {
    setErrMsg("");
    setOkMsg("");
    setLoading(true);
    try {
      const { data, error } = await supabase.from(PAYOUT_TABLE).select("*").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      const list = Array.isArray(data) ? data : [];
      setRows(list);

      const { data: ro } = await supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(3000);
      const { data: go } = await supabase.from("grocery_orders").select("*").order("created_at", { ascending: false }).limit(3000);
      const rest = Array.isArray(ro) ? ro : [];
      const groc = Array.isArray(go) ? go : [];
      setAllOrders(rest);
      setAllGroceryOrders(groc);

      const ids = new Set<string>();
      for (const r of list) ids.add(String(r?.delivery_user_id || "").trim());
      for (const o of rest) ids.add(driverIdFromOrder(o as AnyRow));
      for (const o of groc) ids.add(driverIdFromOrder(o as AnyRow));
      const uidList = Array.from(ids).filter(Boolean);

      const map: Record<string, { name: string; email: string }> = {};
      for (const r of list) {
        const uid = String(r?.delivery_user_id || "").trim();
        if (!uid || map[uid]) continue;
        const nm = String(r?.driver_name || r?.delivery_user_name || r?.full_name || "").trim();
        const em = String(r?.driver_email || r?.delivery_user_email || r?.email || "").trim();
        if (nm || em) map[uid] = { name: nm || `Driver ${uid.slice(0, 8)}`, email: em || "-" };
      }

      if (uidList.length) {
        const missing = uidList.filter((x) => !map[x]);
        if (missing.length) {
          const { data: p1 } = await supabase.from("profiles").select("id, user_id, full_name, name, email").in("user_id", missing);
          for (const p of p1 || []) {
            const uid = String((p as AnyRow)?.user_id || "");
            if (!uid) continue;
            map[uid] = { name: String((p as AnyRow)?.full_name || (p as AnyRow)?.name || (p as AnyRow)?.email || `Driver ${uid.slice(0, 8)}`), email: String((p as AnyRow)?.email || "-") };
          }
        }
        const still = uidList.filter((x) => !map[x]);
        if (still.length) {
          const { data: p2 } = await supabase.from("profiles").select("id, user_id, full_name, name, email").in("id", still);
          for (const p of p2 || []) {
            const uid = String((p as AnyRow)?.id || (p as AnyRow)?.user_id || "");
            if (!uid) continue;
            map[uid] = { name: String((p as AnyRow)?.full_name || (p as AnyRow)?.name || (p as AnyRow)?.email || `Driver ${uid.slice(0, 8)}`), email: String((p as AnyRow)?.email || "-") };
          }
        }
      }
      for (const uid of uidList) if (!map[uid]) map[uid] = { name: `Driver ${uid.slice(0, 8)}`, email: "-" };
      setDriverMap(map);

      const bMap: Record<string, AnyRow> = {};
      if (uidList.length) {
        const { data: banks } = await supabase.from(BANK_TABLE).select("*").in("delivery_user_id", uidList);
        for (const b of banks || []) {
          const uid = String((b as AnyRow)?.delivery_user_id || "").trim();
          if (uid) bMap[uid] = b as AnyRow;
        }
      }
      setBankMap(bMap);
    } catch (e: any) {
      setErrMsg(e?.message || String(e));
      setRows([]);
      setDriverMap({});
      setBankMap({});
      setAllOrders([]);
      setAllGroceryOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    const ch = supabase.channel("admin_payout_requests_live").on(
      "postgres_changes",
      { event: "*", schema: "public", table: PAYOUT_TABLE },
      () => loadAll(),
    ).subscribe();
    return () => {
      try { supabase.removeChannel(ch); } catch {}
    };
  }, []);

  useEffect(() => {
    if (receiptOpen && receiptRow) loadReceiptOrders(receiptRow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptOpen, receiptRow]);

  const payoutOrderStatusMap = useMemo(() => {
    const rank: Record<string, number> = { failed: 1, requested: 2, processing: 3, paid: 4 };
    const map: Record<string, string> = {};
    for (const req of rows) {
      const st = statusNorm(req?.status);
      for (const k0 of Array.isArray(req?.order_keys) ? req.order_keys : []) {
        const k = String(k0 || "");
        if (!k) continue;
        const prev = map[k];
        if (!prev || (rank[st] || 0) >= (rank[prev] || 0)) map[k] = st;
      }
    }
    return map;
  }, [rows]);

  const payoutPoolRows = useMemo(() => {
    const out: AnyRow[] = [];
    for (const raw of allOrders) {
      const row = raw as AnyRow;
      const uid = driverIdFromOrder(row);
      if (!uid || !completedStatus(row?.status)) continue;
      if (poolSourceFilter !== "all" && poolSourceFilter !== "restaurant") continue;
      const key = `restaurant:${String(row?.id || "")}`;
      const db = String(row?.delivery_earning_status || "").toLowerCase();
      const req = String(payoutOrderStatusMap[key] || "").toLowerCase();
      if (db === "paid" || req === "paid" || req === "requested" || req === "processing") continue;
      const payout = payoutFromOrder(row);
      if (payout <= 0) continue;
      out.push({ ...row, _source: "restaurant", _driverId: uid, _payout: payout, _key: key });
    }
    for (const raw of allGroceryOrders) {
      const row = raw as AnyRow;
      const uid = driverIdFromOrder(row);
      if (!uid || !completedStatus(row?.status)) continue;
      if (poolSourceFilter !== "all" && poolSourceFilter !== "grocery") continue;
      const key = `grocery:${String(row?.id || "")}`;
      const db = String(row?.delivery_earning_status || "").toLowerCase();
      const req = String(payoutOrderStatusMap[key] || "").toLowerCase();
      if (db === "paid" || req === "paid" || req === "requested" || req === "processing") continue;
      const payout = payoutFromOrder(row);
      if (payout <= 0) continue;
      out.push({ ...row, _source: "grocery", _driverId: uid, _payout: payout, _key: key });
    }
    return out.sort((a, b) => String(b?.created_at || "").localeCompare(String(a?.created_at || "")));
  }, [allOrders, allGroceryOrders, payoutOrderStatusMap, poolSourceFilter]);

  const orderPayoutByKey = useMemo(() => {
    const map: Record<string, number> = {};
    for (const raw of allOrders) {
      const row = raw as AnyRow;
      const id = String(row?.id || "").trim();
      if (!id) continue;
      map[`restaurant:${id}`] = payoutFromOrder(row);
    }
    for (const raw of allGroceryOrders) {
      const row = raw as AnyRow;
      const id = String(row?.id || "").trim();
      if (!id) continue;
      map[`grocery:${id}`] = payoutFromOrder(row);
    }
    return map;
  }, [allOrders, allGroceryOrders]);

  const payoutAmountForRequest = (r: AnyRow) => {
    const base = nnum(r?.total_amount);
    if (base > 0) return base;

    const keys = Array.isArray(r?.order_keys) ? r.order_keys : [];
    if (keys.length) {
      const byKeys = keys.reduce((sum: number, k0: unknown) => sum + nnum(orderPayoutByKey[String(k0 || "")]), 0);
      if (byKeys > 0) return byKeys;
    }

    const ids = Array.isArray(r?.order_ids) ? r.order_ids : [];
    if (ids.length) {
      const src = String(r?.source || "").toLowerCase();
      let byIds = 0;
      for (const id0 of ids) {
        const id = String(id0 || "");
        if (!id) continue;
        if (src === "restaurant") byIds += nnum(orderPayoutByKey[`restaurant:${id}`]);
        else if (src === "grocery") byIds += nnum(orderPayoutByKey[`grocery:${id}`]);
        else byIds += nnum(orderPayoutByKey[`restaurant:${id}`]) + nnum(orderPayoutByKey[`grocery:${id}`]);
      }
      if (byIds > 0) return byIds;
    }

    return base;
  };

  const driverLedger = useMemo(() => {
    const map: Record<string, AnyRow> = {};
    const ensure = (uid: string) => {
      if (!uid) return null;
      if (!map[uid]) {
        map[uid] = {
          driverId: uid,
          driverName: driverMap[uid]?.name || `Driver ${uid.slice(0, 8)}`,
          driverEmail: driverMap[uid]?.email || "-",
          availableNow: 0,
          availableCount: 0,
          requested: 0,
          processing: 0,
          paid: 0,
          failed: 0,
        };
      }
      return map[uid];
    };

    for (const o of payoutPoolRows) {
      const e = ensure(String(o?._driverId || ""));
      if (!e) continue;
      e.availableNow += nnum(o?._payout);
      e.availableCount += 1;
    }
    for (const r of rows) {
      const e = ensure(String(r?.delivery_user_id || ""));
      if (!e) continue;
      const amt = payoutAmountForRequest(r);
      const st = statusNorm(r?.status);
      if (st === "requested") e.requested += amt;
      if (st === "processing") e.processing += amt;
      if (st === "paid") e.paid += amt;
      if (st === "failed") e.failed += amt;
    }

    const list = Object.values(map);
    list.sort((a, b) => (nnum(b.availableNow) + nnum(b.requested) + nnum(b.processing)) - (nnum(a.availableNow) + nnum(a.requested) + nnum(a.processing)));
    return list;
  }, [payoutPoolRows, rows, driverMap, orderPayoutByKey]);
  const poolStats = useMemo(() => {
    const total = payoutPoolRows.reduce((s, o) => s + nnum(o?._payout), 0);
    const drivers = new Set(payoutPoolRows.map((o) => String(o?._driverId || "")).filter(Boolean)).size;
    return { total, orders: payoutPoolRows.length, drivers };
  }, [payoutPoolRows]);

  const existingOrderKeySet = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const keys = Array.isArray(r?.order_keys) ? r.order_keys : [];
      const ids = Array.isArray(r?.order_ids) ? r.order_ids : [];
      const src = String(r?.source || "").toLowerCase();
      for (const k of keys) {
        const ks = String(k || "").trim();
        if (ks) set.add(ks);
      }
      if (keys.length === 0) {
        for (const id of ids) {
          const sid = String(id || "").trim();
          if (!sid) continue;
          if (src === "grocery") set.add(`grocery:${sid}`);
          else if (src === "restaurant") set.add(`restaurant:${sid}`);
          else {
            set.add(`restaurant:${sid}`);
            set.add(`grocery:${sid}`);
          }
        }
      }
    }
    return set;
  }, [rows]);

  const fallbackRows = useMemo(() => {
    const groups: Record<string, AnyRow> = {};
    const add = (row: AnyRow, source: "restaurant" | "grocery") => {
      const uid = driverIdFromOrder(row);
      if (!uid) return;
      const id = String(row?.id || "").trim();
      if (!id) return;
      const earning = String(row?.delivery_earning_status || "").toLowerCase();
      if (!earningPendingStatus(earning)) return;
      const key = `${source}:${id}`;
      if (existingOrderKeySet.has(key)) return;
      const amount = payoutFromOrder(row);
      if (amount <= 0) return;
      const gk = `${uid}:${earning}:${source}`;
      if (!groups[gk]) {
        groups[gk] = {
          id: `fallback:${uid}:${earning}:${source}`,
          delivery_user_id: uid,
          status: earning,
          source,
          range: "order_fallback",
          order_ids: [],
          order_keys: [],
          total_amount: 0,
          count: 0,
          created_at: row?.created_at || new Date().toISOString(),
          transaction_ref: "",
        };
      }
      groups[gk].order_ids.push(id);
      groups[gk].order_keys.push(key);
      groups[gk].total_amount += amount;
      groups[gk].count += 1;
      const cur = new Date(String(groups[gk].created_at || 0)).getTime();
      const nxt = new Date(String(row?.created_at || 0)).getTime();
      if (Number.isFinite(nxt) && nxt > cur) groups[gk].created_at = row?.created_at;
    };

    for (const o of allOrders) add(o as AnyRow, "restaurant");
    for (const o of allGroceryOrders) add(o as AnyRow, "grocery");
    return Object.values(groups);
  }, [allOrders, allGroceryOrders, existingOrderKeySet]);

  const displayRows = useMemo(() => [...rows, ...fallbackRows], [rows, fallbackRows]);

  const sortedRows = useMemo(() => {
    const list = [...displayRows];
    list.sort((a, b) => {
      const ad = new Date(String(a?.created_at || 0)).getTime();
      const bd = new Date(String(b?.created_at || 0)).getTime();
      if (bd !== ad) return bd - ad;
      return String(b?.id || "").localeCompare(String(a?.id || ""));
    });
    return list;
  }, [displayRows]);

  const filtered = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    return sortedRows.filter((r) => {
      const st = statusNorm(r?.status);
      if (statusFilter !== "all" && st !== statusFilter) return false;
      const uid = String(r?.delivery_user_id || "");
      if (driverFilter !== "all" && uid !== driverFilter) return false;
      if (!q) return true;
      const bank = bankMap[uid] || {};
      return [r?.id, uid, driverMap[uid]?.name || "", driverMap[uid]?.email || "", r?.status, r?.source, r?.range, r?.transaction_ref, bank?.bank_name, bank?.account_holder_name, bank?.account_number_last4, bank?.routing_code_last4].join(" ").toLowerCase().includes(q);
    });
  }, [sortedRows, search, statusFilter, driverFilter, driverMap, bankMap]);

  const paidCsvRows = useMemo(() => (
    filtered
      .filter((r) => statusNorm(r?.status) === "paid")
      .map((r) => {
        const uid = String(r?.delivery_user_id || "");
        const prof = driverMap[uid] || { name: `Driver ${uid.slice(0, 8)}`, email: "-" };
        const bank = bankMap[uid] || {};
        return {
          payout_id: String(r?.id || ""), driver_user_id: uid, driver_name: prof.name, driver_email: prof.email,
          amount: payoutAmountForRequest(r), source: String(r?.source || "all"), orders_count: nnum(r?.count),
          transaction_ref: String(r?.transaction_ref || ""), paid_at: String(r?.paid_at || ""), paid_by_name: String(r?.paid_by_name || ""), paid_by_user_id: String(r?.paid_by_user_id || ""),
          bank_name: String(r?.payout_bank_name || bank?.bank_name || ""), account_holder_name: String(r?.payout_account_holder_name || bank?.account_holder_name || ""),
          account_last4: String(r?.payout_account_last4 || bank?.account_number_last4 || ""), routing_last4: String(r?.payout_routing_last4 || bank?.routing_code_last4 || ""),
          account_full: String(r?.payout_account_full || bank?.account_number_full || ""), routing_full: String(r?.payout_routing_full || bank?.routing_code_full || ""),
        };
      })
  ), [filtered, driverMap, bankMap]);

  const summary = useMemo(() => {
    let requested = 0;
    let processing = 0;
    let paid = 0;
    let failed = 0;
    let total = 0;
    for (const r of filtered) {
      const amt = payoutAmountForRequest(r);
      total += amt;
      const st = statusNorm(r?.status);
      if (st === "requested") requested += amt;
      if (st === "processing") processing += amt;
      if (st === "paid") paid += amt;
      if (st === "failed") failed += amt;
    }
    return { requested, processing, paid, failed, total, pending: requested + processing };
  }, [filtered]);

  const batchBuckets = useMemo(() => ({
    all: filtered,
    active: filtered.filter((r) => { const st = statusNorm(r?.status); return st === "requested" || st === "processing"; }),
    paid: filtered.filter((r) => statusNorm(r?.status) === "paid"),
    failed: filtered.filter((r) => statusNorm(r?.status) === "failed"),
  }), [filtered]);

  const visibleBatches = useMemo(
    () => batchSection === "active" ? batchBuckets.active : batchSection === "paid" ? batchBuckets.paid : batchSection === "failed" ? batchBuckets.failed : batchBuckets.all,
    [batchSection, batchBuckets],
  );

  const driverViewLabel = useMemo(() => driverFilter === "all" ? "All drivers" : (driverMap[driverFilter]?.name || `Driver ${driverFilter.slice(0, 8)}`), [driverFilter, driverMap]);

  const driverDetail = useMemo(() => {
    if (!driverDetailId) return null;
    const ledger = driverLedger.find((d) => String(d?.driverId || "") === driverDetailId) || null;
    const batches = sortedRows.filter((r) => String(r?.delivery_user_id || "") === driverDetailId);
    const unpaidOrders = payoutPoolRows.filter((o) => String(o?._driverId || "") === driverDetailId);
    return { ledger, batches, unpaidOrders };
  }, [driverDetailId, driverLedger, sortedRows, payoutPoolRows]);

  function orderIdsFromRequest(req: AnyRow) {
    const restaurant = new Set<string>();
    const grocery = new Set<string>();
    const keys = Array.isArray(req?.order_keys) ? req.order_keys : [];
    for (const k0 of keys) {
      const [src, id] = String(k0 || "").split(":");
      if (!src || !id) continue;
      if (src.toLowerCase() === "grocery") grocery.add(id);
      else restaurant.add(id);
    }

    const ids = Array.isArray(req?.order_ids) ? req.order_ids : [];
    if (keys.length === 0 && ids.length) {
      const src = String(req?.source || "").toLowerCase();
      if (src === "grocery") {
        for (const id of ids) grocery.add(String(id || ""));
      } else if (src === "restaurant") {
        for (const id of ids) restaurant.add(String(id || ""));
      } else {
        for (const id of ids) {
          const sid = String(id || "");
          if (!sid) continue;
          restaurant.add(sid);
          grocery.add(sid);
        }
      }
    }

    return {
      restaurantIds: Array.from(restaurant).filter(Boolean),
      groceryIds: Array.from(grocery).filter(Boolean),
    };
  }

  function mapInlineItems(row: AnyRow) {
    const arr = row?.items ?? row?.order_items ?? row?.cart_items;
    const list = Array.isArray(arr) ? arr : [];
    return list.map((it: AnyRow, idx: number) => ({
      id: String(it?.id || idx), name: String(it?.item_name || it?.name || it?.product_name || "Item"), qty: nnum(it?.qty ?? it?.quantity ?? 1), price: nnum(it?.price ?? it?.unit_price ?? it?.item_price ?? 0), image: String(it?.image || it?.image_url || it?.photo || it?.item_image || ""),
    }));
  }
  function mapItemRows(rows0: AnyRow[]) {
    return (rows0 || []).map((it: AnyRow, idx: number) => ({
      id: String(it?.id || idx), name: String(it?.item_name || it?.name || it?.product_name || "Item"), qty: nnum(it?.qty ?? it?.quantity ?? 1), price: nnum(it?.price ?? it?.unit_price ?? it?.item_price ?? 0), image: String(it?.image || it?.image_url || it?.photo || it?.item_image || ""),
    }));
  }

  async function loadReceiptOrders(req: AnyRow) {
    setReceiptLoading(true);
    setReceiptErr("");
    setReceiptOrders([]);
    try {
      const { restaurantIds, groceryIds } = orderIdsFromRequest(req);
      const orderMap: Record<string, AnyRow> = {};
      const groceryMap: Record<string, AnyRow> = {};
      const orderItemsMap: Record<string, AnyRow[]> = {};
      const groceryItemsMap: Record<string, AnyRow[]> = {};

      for (const ids of chunk(restaurantIds, 100)) {
        if (!ids.length) continue;
        const { data, error } = await supabase.from("orders").select("*").in("id", ids);
        if (error) throw error;
        for (const r of data || []) orderMap[String((r as AnyRow)?.id || "")] = r as AnyRow;
      }
      for (const ids of chunk(groceryIds, 100)) {
        if (!ids.length) continue;
        const { data, error } = await supabase.from("grocery_orders").select("*").in("id", ids);
        if (error) throw error;
        for (const r of data || []) groceryMap[String((r as AnyRow)?.id || "")] = r as AnyRow;
      }

      for (const ids of chunk(restaurantIds, 100)) {
        if (!ids.length) continue;
        const { data } = await supabase.from("order_items").select("*").in("order_id", ids);
        for (const it of data || []) {
          const oid = String((it as AnyRow)?.order_id || "");
          if (!oid) continue;
          if (!orderItemsMap[oid]) orderItemsMap[oid] = [];
          orderItemsMap[oid].push(it as AnyRow);
        }
      }
      for (const ids of chunk(groceryIds, 100)) {
        if (!ids.length) continue;
        const joined = ids.map((x) => `'${String(x).replace(/'/g, "''")}'`).join(",");
        const { data } = await supabase.from("grocery_order_items").select("*").or(`order_id.in.(${joined}),grocery_order_id.in.(${joined})`);
        for (const it of data || []) {
          const oid = String((it as AnyRow)?.order_id || (it as AnyRow)?.grocery_order_id || "");
          if (!oid) continue;
          if (!groceryItemsMap[oid]) groceryItemsMap[oid] = [];
          groceryItemsMap[oid].push(it as AnyRow);
        }
      }

      const out: ReceiptOrder[] = [];
      for (const id of restaurantIds) {
        const row = orderMap[id];
        if (!row) continue;
        const inline = mapInlineItems(row);
        const itemRows = mapItemRows(orderItemsMap[id] || []);
        out.push({ id, source: "restaurant", status: String(row?.status || "-"), total: orderTotalForDisplay(row), createdAt: String(row?.created_at || ""), customerName: pickStr(row, ["customer_name", "name", "user_name", "full_name"]), customerPhone: pickStr(row, ["customer_phone", "phone", "phone_number", "mobile"]), customerEmail: pickStr(row, ["customer_email", "email", "user_email"]), address: pickStr(row, ["delivery_address", "address", "drop_address", "location"]), instructions: pickStr(row, ["instructions", "delivery_instructions", "note"], "-"), paymentMethod: pickStr(row, ["payment_method", "payment", "payment_type"], "Unknown"), items: itemRows.length ? itemRows : inline });
      }
      for (const id of groceryIds) {
        const row = groceryMap[id];
        if (!row) continue;
        const inline = mapInlineItems(row);
        const itemRows = mapItemRows(groceryItemsMap[id] || []);
        out.push({ id, source: "grocery", status: String(row?.status || "-"), total: orderTotalForDisplay(row), createdAt: String(row?.created_at || ""), customerName: pickStr(row, ["customer_name", "name", "user_name", "full_name"]), customerPhone: pickStr(row, ["customer_phone", "phone", "phone_number", "mobile"]), customerEmail: pickStr(row, ["customer_email", "email", "user_email"]), address: pickStr(row, ["delivery_address", "address", "drop_address", "location"]), instructions: pickStr(row, ["instructions", "delivery_instructions", "note"], "-"), paymentMethod: pickStr(row, ["payment_method", "payment", "payment_type"], "Unknown"), items: itemRows.length ? itemRows : inline });
      }

      out.sort((a, b) => String(a.createdAt) < String(b.createdAt) ? 1 : -1);
      setReceiptOrders(out);
    } catch (e: any) {
      setReceiptErr(e?.message || String(e));
    } finally {
      setReceiptLoading(false);
    }
  }

  async function updateRequestStatus(id: string, next: ReqStatus) {
    if (!id) return;
    if (id.startsWith("fallback:")) {
      setErrMsg("This is a derived pending batch from order earning status. Use Create Payout to create a DB payout batch.");
      return;
    }
    setBusyId(id);
    setErrMsg("");
    setOkMsg("");
    try {
      const { error } = await supabase.from(PAYOUT_TABLE).update({ status: next }).eq("id", id);
      if (error) throw error;
      setRows((prev) => prev.map((r) => String(r?.id || "") === String(id) ? { ...r, status: next } : r));
      setOkMsg(`Updated ${id} to ${next.toUpperCase()}`);
    } catch (e: any) {
      setErrMsg(e?.message || String(e));
    } finally {
      setBusyId("");
    }
  }

  async function createPayoutForDriver(uid: string) {
    const id = String(uid || "").trim();
    if (!id) return;
    if (id.startsWith("fallback:")) {
      setErrMsg("This is a derived pending batch from order earning status. Use Create Payout to create a DB payout batch.");
      return;
    }
    setBusyId(`create:${id}`);
    setErrMsg("");
    setOkMsg("");
    try {
      const selected = payoutPoolRows.filter((o) => String(o?._driverId || "") === id);
      if (!selected.length) throw new Error("No payout-ready orders for this driver.");
      const total = selected.reduce((sum, o) => sum + nnum(o?._payout), 0);
      const orderKeys = selected.map((o) => `${String(o?._source || "restaurant")}:${String(o?.id || "")}`);
      const orderIds = selected.map((o) => String(o?.id || "")).filter(Boolean);
      const uniqueSrc = new Set(selected.map((o) => String(o?._source || "restaurant")));
      const requestRow: AnyRow = { id: String(Date.now()), delivery_user_id: id, status: "requested", source: uniqueSrc.size === 1 ? Array.from(uniqueSrc)[0] : "all", range: "admin_manual", order_ids: orderIds, order_keys: orderKeys, total_amount: total, count: selected.length, created_at: new Date().toISOString() };
      const { error } = await supabase.from(PAYOUT_TABLE).insert([requestRow]);
      if (error) {
        const msg = String((error as AnyRow)?.message || "").toLowerCase();
        if (msg.includes("row-level security")) throw new Error("DB policy blocked admin payout insert. Driver app reads only DB payout rows. Please allow admin INSERT on delivery_payout_requests.");
        throw error;
      }
      setOkMsg(`Created payout request for ${driverMap[id]?.name || id}: $${money(total)} (${selected.length} orders)`);
      setSearch("");
      setStatusFilter("all");
      setDriverFilter("all");
      setBatchSection("all");
      await loadAll();
    } catch (e: any) {
      setErrMsg(e?.message || String(e));
    } finally {
      setBusyId("");
    }
  }

  async function markPaidAndSettle(req: AnyRow) {
    const id = String(req?.id || "");
    if (!id) return;
    if (id.startsWith("fallback:")) {
      setErrMsg("This is a derived pending batch from order earning status. Use Create Payout to create a DB payout batch.");
      return;
    }
    setBusyId(id);
    setErrMsg("");
    setOkMsg("");
    try {
      const uid = String(req?.delivery_user_id || "");
      const bank = bankMap[uid] || {};
      if (String(bank?.status || "").trim().toLowerCase() !== "approved") throw new Error("Driver bank account is not approved yet.");
      const txnRef = String(window.prompt("Enter transaction reference / UTR for this payout:", "") || "").trim();
      if (!txnRef) return;
      const { restaurantIds, groceryIds } = orderIdsFromRequest(req);
      for (const ids of chunk(restaurantIds, 100)) {
        if (!ids.length) continue;
        const { error } = await supabase.from("orders").update({ delivery_earning_status: "paid" }).in("id", ids);
        if (error) throw error;
      }
      for (const ids of chunk(groceryIds, 100)) {
        if (!ids.length) continue;
        const { error } = await supabase.from("grocery_orders").update({ delivery_earning_status: "paid" }).in("id", ids);
        if (error) throw error;
      }
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      let paidByName = String(user?.email || "");
      if (user?.id) {
        const { data: prof } = await supabase.from("profiles").select("full_name, name, email").eq("user_id", user.id).maybeSingle();
        paidByName = String((prof as AnyRow)?.full_name || (prof as AnyRow)?.name || (prof as AnyRow)?.email || user.email || "");
      }
      const paidAt = new Date().toISOString();
      const richUpdate: AnyRow = {
        status: "paid", paid_at: paidAt, transaction_ref: txnRef, paid_by_user_id: String(user?.id || ""), paid_by_name: paidByName,
        payout_bank_name: String(bank?.bank_name || ""), payout_account_holder_name: String(bank?.account_holder_name || ""), payout_account_last4: String(bank?.account_number_last4 || ""), payout_routing_last4: String(bank?.routing_code_last4 || ""), payout_account_full: String(bank?.account_number_full || bank?.account_number || ""), payout_routing_full: String(bank?.routing_code_full || bank?.routing_code || ""),
      };
      let updateErr = (await supabase.from(PAYOUT_TABLE).update(richUpdate).eq("id", id)).error;
      if (updateErr) updateErr = (await supabase.from(PAYOUT_TABLE).update({ status: "paid", paid_at: paidAt, transaction_ref: txnRef, paid_by_user_id: String(user?.id || ""), paid_by_name: paidByName }).eq("id", id)).error;
      if (updateErr) updateErr = (await supabase.from(PAYOUT_TABLE).update({ status: "paid" }).eq("id", id)).error;
      if (updateErr) throw updateErr;
      setRows((prev) => prev.map((r) => String(r?.id || "") === id ? { ...r, ...richUpdate } : r));
      setOkMsg(`Marked ${id} as PAID and settled linked orders. Ref: ${txnRef}`);
      await loadAll();
    } catch (e: any) {
      setErrMsg(e?.message || String(e));
    } finally {
      setBusyId("");
    }
  }

  const driverOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const r of sortedRows) ids.add(String(r?.delivery_user_id || ""));
    for (const o of allOrders) ids.add(driverIdFromOrder(o as AnyRow));
    for (const o of allGroceryOrders) ids.add(driverIdFromOrder(o as AnyRow));
    return Array.from(ids).filter(Boolean).map((id) => ({ id, name: driverMap[id]?.name || `Driver ${id.slice(0, 8)}` })).sort((a, b) => a.name.localeCompare(b.name));
  }, [sortedRows, allOrders, allGroceryOrders, driverMap]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={card}><div style={{ fontSize: 20, fontWeight: 950 }}>Payout Management</div><div style={{ marginTop: 4, fontSize: 13, color: "rgba(15,23,42,0.7)", fontWeight: 700 }}>Pro payout console with driver filters, pending/paid visibility, and payout receipt order drilldown.</div></div>

      <div style={{ ...card, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div><div style={{ fontWeight: 950, fontSize: 15 }}>Payable Pool (Unpaid Delivery Fees)</div><div style={{ fontSize: 12, fontWeight: 700, color: "rgba(15,23,42,0.68)" }}>How much is still owed to drivers from completed unpaid deliveries.</div></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 12, fontWeight: 800 }}>Source</span><select style={input} value={poolSourceFilter} onChange={(e) => setPoolSourceFilter(e.target.value as any)}><option value="all">All sources</option><option value="restaurant">Restaurant</option><option value="grocery">Grocery</option></select></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(160px,1fr))", gap: 10 }}>
          <div style={card}><div style={{ fontSize: 12, fontWeight: 800, opacity: 0.7 }}>Payable Now</div><div style={{ fontSize: 24, fontWeight: 950 }}>${money(poolStats.total)}</div></div>
          <div style={card}><div style={{ fontSize: 12, fontWeight: 800, opacity: 0.7 }}>Eligible Orders</div><div style={{ fontSize: 24, fontWeight: 950 }}>{poolStats.orders}</div></div>
          <div style={card}><div style={{ fontSize: 12, fontWeight: 800, opacity: 0.7 }}>Drivers With Pending</div><div style={{ fontSize: 24, fontWeight: 950 }}>{poolStats.drivers}</div></div>
        </div>
      </div>

      <div style={{ ...card, display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 950, fontSize: 15 }}>Driver Payout Ledger</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead><tr style={{ textAlign: "left", borderBottom: "1px solid rgba(15,23,42,0.12)" }}><th style={{ padding: 8 }}>Driver</th><th style={{ padding: 8 }}>Available Now</th><th style={{ padding: 8 }}>Requested</th><th style={{ padding: 8 }}>Processing</th><th style={{ padding: 8 }}>Paid</th><th style={{ padding: 8 }}>Failed</th><th style={{ padding: 8 }}>Remaining</th><th style={{ padding: 8 }}>Action</th></tr></thead>
            <tbody>
              {driverLedger.map((d) => {
                const uid = String(d?.driverId || "");
                const remaining = nnum(d?.availableNow) + nnum(d?.requested) + nnum(d?.processing);
                const createBusy = busyId === `create:${uid}`;
                return <tr key={uid} style={{ borderBottom: "1px solid rgba(15,23,42,0.08)" }}><td style={{ padding: 8 }}><div style={{ fontWeight: 900 }}>{String(d?.driverName || "-")}</div><div style={{ fontSize: 12, opacity: 0.7 }}>{String(d?.driverEmail || "-")}</div></td><td style={{ padding: 8, fontWeight: 900 }}>${money(d?.availableNow)}</td><td style={{ padding: 8, fontWeight: 800 }}>${money(d?.requested)}</td><td style={{ padding: 8, fontWeight: 800 }}>${money(d?.processing)}</td><td style={{ padding: 8, fontWeight: 800 }}>${money(d?.paid)}</td><td style={{ padding: 8, fontWeight: 800 }}>${money(d?.failed)}</td><td style={{ padding: 8, fontWeight: 900 }}>${money(remaining)}</td><td style={{ padding: 8, display: "flex", gap: 8, flexWrap: "wrap" }}><button style={btn} onClick={() => { setDriverFilter(uid); setDriverDetailId(uid); setDriverDetailOpen(true); }}>View</button><button style={{ ...btn, background: "#0f172a", color: "#fff", opacity: nnum(d?.availableNow) > 0 ? 1 : 0.6 }} disabled={createBusy || nnum(d?.availableNow) <= 0} onClick={() => createPayoutForDriver(uid)}>{createBusy ? "Creating..." : `Create Payout (${nnum(d?.availableCount)})`}</button></td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ ...card, display: "grid", gap: 10 }}><div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(120px, 1fr))", gap: 10 }}><div style={card}><div style={{ fontSize: 12, fontWeight: 800, opacity: 0.7 }}>Requested</div><div style={{ fontSize: 24, fontWeight: 950 }}>${money(summary.requested)}</div></div><div style={card}><div style={{ fontSize: 12, fontWeight: 800, opacity: 0.7 }}>Processing</div><div style={{ fontSize: 24, fontWeight: 950 }}>${money(summary.processing)}</div></div><div style={card}><div style={{ fontSize: 12, fontWeight: 800, opacity: 0.7 }}>Pending (Total)</div><div style={{ fontSize: 24, fontWeight: 950 }}>${money(summary.pending)}</div></div><div style={card}><div style={{ fontSize: 12, fontWeight: 800, opacity: 0.7 }}>Paid</div><div style={{ fontSize: 24, fontWeight: 950 }}>${money(summary.paid)}</div></div><div style={card}><div style={{ fontSize: 12, fontWeight: 800, opacity: 0.7 }}>Failed</div><div style={{ fontSize: 24, fontWeight: 950 }}>${money(summary.failed)}</div></div><div style={card}><div style={{ fontSize: 12, fontWeight: 800, opacity: 0.7 }}>Visible Total</div><div style={{ fontSize: 24, fontWeight: 950 }}>${money(summary.total)}</div></div></div></div>

      <div style={{ ...card, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><input style={{ ...input, minWidth: 220 }} placeholder="Search id / driver / source" value={search} onChange={(e) => setSearch(e.target.value)} /><select style={input} value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}><option value="all">All drivers</option>{driverOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select><select style={input} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}><option value="all">All statuses</option><option value="requested">Requested</option><option value="processing">Processing</option><option value="paid">Paid</option><option value="failed">Failed</option></select><button style={btn} onClick={loadAll}>Refresh</button><button style={{ ...btn, opacity: paidCsvRows.length ? 1 : 0.6 }} disabled={paidCsvRows.length === 0} onClick={() => exportCsv(paidCsvRows, "admin_paid_payouts.csv")}>Export Paid CSV</button><button style={btn} onClick={() => { setDriverFilter("all"); setStatusFilter("all"); setSearch(""); }}>Clear filters</button></div>

      <div style={{ ...card, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}><span style={{ fontWeight: 900 }}>Driver View:</span><span style={{ padding: "5px 10px", borderRadius: 999, border: "1px solid rgba(15,23,42,0.2)", fontSize: 12, fontWeight: 800 }}>{driverViewLabel}</span><span style={{ fontSize: 12, fontWeight: 800, color: "rgba(15,23,42,0.7)" }}>Paid: ${money(summary.paid)}</span><span style={{ fontSize: 12, fontWeight: 800, color: "rgba(15,23,42,0.7)" }}>Pending: ${money(summary.pending)}</span><span style={{ fontSize: 12, fontWeight: 800, color: "rgba(15,23,42,0.7)" }}>Visible payouts: {filtered.length}</span></div>

      {errMsg ? <div style={{ ...card, borderColor: "rgba(239,68,68,0.35)", color: "#7f1d1d", fontWeight: 800 }}>{errMsg}</div> : null}
      {okMsg ? <div style={{ ...card, borderColor: "rgba(16,185,129,0.35)", color: "#065f46", fontWeight: 800 }}>{okMsg}</div> : null}

      <div style={{ ...card, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontWeight: 900 }}>Batch Sections:</span>
          <button style={chipBtn(batchSection === "all")} onClick={() => setBatchSection("all")}>All ({batchBuckets.all.length})</button>
          <button style={chipBtn(batchSection === "active")} onClick={() => setBatchSection("active")}>Pending + Processing ({batchBuckets.active.length})</button>
          <button style={chipBtn(batchSection === "paid")} onClick={() => setBatchSection("paid")}>Paid ({batchBuckets.paid.length})</button>
          <button style={chipBtn(batchSection === "failed")} onClick={() => setBatchSection("failed")}>Failed ({batchBuckets.failed.length})</button>
        </div>
        {loading ? <div style={{ fontWeight: 800, color: "rgba(15,23,42,0.65)" }}>Loading payout requests...</div> : null}
        {!loading && visibleBatches.length === 0 ? <div style={{ fontWeight: 800, color: "rgba(15,23,42,0.65)" }}>No payout requests found in this section.</div> : null}
        {!loading && visibleBatches.map((r) => {
          const id = String(r?.id || "");
          const st = statusNorm(r?.status);
          const uid = String(r?.delivery_user_id || "");
          const driverName = driverMap[uid]?.name || `Driver ${uid.slice(0, 8)}`;
          const driverEmail = driverMap[uid]?.email || "-";
          const bank = bankMap[uid] || {};
          const bankStatus = String(bank?.status || "pending_verification").toUpperCase();
          const isBusy = busyId === id;
          const computedAmt = payoutAmountForRequest(r);
          const isBackfilledAmount = nnum(r?.total_amount) <= 0 && computedAmt > 0;
          return <div key={id} style={{ border: "1px solid rgba(15,23,42,0.12)", borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.9)", display: "grid", gap: 8 }}><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span style={{ fontWeight: 950 }}>#{id.slice(-6)}</span><span style={{ fontSize: 11, fontWeight: 700, color: "rgba(15,23,42,0.55)" }}>{id}</span><span style={statusBadgeStyle(st)}>{st.toUpperCase()}</span><span style={{ padding: "4px 9px", borderRadius: 999, fontSize: 12, fontWeight: 800, border: "1px solid rgba(15,23,42,0.14)" }}>{String(r?.source || "all").toUpperCase()}</span>{isBackfilledAmount ? <span style={{ padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 900, border: "1px solid rgba(245,158,11,0.35)", background: "rgba(254,243,199,0.8)", color: "#92400e" }}>Backfilled Amount</span> : null}<span style={{ marginLeft: "auto", fontWeight: 950 }}>${money(payoutAmountForRequest(r))}</span></div><div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "rgba(15,23,42,0.72)", fontWeight: 800 }}><span>Driver: {driverName}</span><span>Email: {driverEmail}</span><span>Orders: {nnum(r?.count)}</span><span>Created: {fmtWhen(r?.created_at)}</span><span>Bank: {String(bank?.bank_name || "-")} ({String(bank?.account_number_last4 || "-")})</span><span>Bank Status: {bankStatus}</span>{String(r?.transaction_ref || "").trim() ? <span>Txn Ref: {String(r?.transaction_ref || "")}</span> : null}{r?.paid_at ? <span>Paid At: {fmtWhen(r?.paid_at)}</span> : null}</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{st !== "paid" ? <button style={btn} disabled={isBusy || st === "processing"} onClick={() => updateRequestStatus(id, "processing")}>{isBusy ? "Updating..." : "Mark Processing"}</button> : null}{st !== "paid" ? <button style={btn} disabled={isBusy || st === "failed"} onClick={() => updateRequestStatus(id, "failed")}>{isBusy ? "Updating..." : "Mark Failed"}</button> : null}{st !== "paid" ? <button style={{ ...btn, background: "#0f172a", color: "#fff" }} disabled={isBusy} onClick={() => markPaidAndSettle(r)}>{isBusy ? "Settling..." : "Mark Paid + Settle Orders"}</button> : null}{st === "paid" ? <button style={btn} onClick={() => { setReceiptRow(r); setReceiptOpen(true); }}>View Receipt</button> : null}</div></div>;
        })}
      </div>

            {driverDetailOpen && driverDetail ? (
        <div onClick={() => setDriverDetailOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.45)", zIndex: 3000, display: "flex", justifyContent: "center", alignItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(1100px, 96vw)", maxHeight: "90vh", overflow: "auto", borderRadius: 16, background: "#fff", border: "1px solid rgba(15,23,42,0.15)", boxShadow: "0 20px 50px rgba(2,6,23,0.25)", padding: 14, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 950 }}>Driver Earnings Detail</div>
              <button style={btn} onClick={() => setDriverDetailOpen(false)}>Close</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(220px,1fr))", gap: 10 }}>
              <div style={card}><div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Driver</div><div style={{ fontWeight: 900 }}>{driverDetail?.ledger?.driverName || "-"}</div><div style={{ fontSize: 12, opacity: 0.75 }}>{driverDetail?.ledger?.driverEmail || "-"}</div></div>
              <div style={card}><div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Available Now</div><div style={{ fontWeight: 900 }}>${money(driverDetail?.ledger?.availableNow || 0)}</div><div style={{ fontSize: 12, opacity: 0.75 }}>Orders: {nnum(driverDetail?.ledger?.availableCount || 0)}</div></div>
              <div style={card}><div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Paid So Far</div><div style={{ fontWeight: 900 }}>${money(driverDetail?.ledger?.paid || 0)}</div><div style={{ fontSize: 12, opacity: 0.75 }}>Pending: ${money(nnum(driverDetail?.ledger?.requested || 0) + nnum(driverDetail?.ledger?.processing || 0))}</div></div>
            </div>

            <div style={{ ...card, display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 900, fontSize: 15 }}>Unpaid Eligible Orders ({driverDetail.unpaidOrders.length})</div>
              {driverDetail.unpaidOrders.length === 0 ? <div style={{ fontWeight: 700, color: "rgba(15,23,42,0.7)" }}>No unpaid eligible orders for this driver.</div> : null}
              {driverDetail.unpaidOrders.slice(0, 80).map((o) => (
                <div key={`${String(o?._source)}:${String(o?.id)}`} style={{ border: "1px solid rgba(15,23,42,0.1)", borderRadius: 10, padding: 8, display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
                  <div style={{ fontWeight: 800 }}>{String(o?._source || "restaurant").toUpperCase()} #{String(o?.id || "-")}</div>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{fmtWhen(o?.created_at)}</div>
                  <div style={{ fontSize: 13, fontWeight: 900 }}>${money(o?._payout)}</div>
                </div>
              ))}
            </div>

            <div style={{ ...card, display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 900, fontSize: 15 }}>Payout Batches ({driverDetail.batches.length})</div>
              {driverDetail.batches.length === 0 ? <div style={{ fontWeight: 700, color: "rgba(15,23,42,0.7)" }}>No payout batches found for this driver.</div> : null}
              {driverDetail.batches.map((r) => {
                const st = statusNorm(r?.status);
                return (
                  <div key={String(r?.id || "")} style={{ border: "1px solid rgba(15,23,42,0.12)", borderRadius: 10, padding: 8, display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, alignItems: "center" }}>
                    <div style={{ fontWeight: 900 }}>#{String(r?.id || "")}</div>
                    <span style={statusBadgeStyle(st)}>{st.toUpperCase()}</span>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>{fmtWhen(r?.created_at)}</div>
                    <div style={{ fontWeight: 900 }}>${money(payoutAmountForRequest(r))}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {receiptOpen && receiptRow ? (
        <div onClick={() => setReceiptOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.45)", zIndex: 3000, display: "flex", justifyContent: "center", alignItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(1020px, 96vw)", maxHeight: "90vh", overflow: "auto", borderRadius: 16, background: "#fff", border: "1px solid rgba(15,23,42,0.15)", boxShadow: "0 20px 50px rgba(2,6,23,0.25)", padding: 14, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 950 }}>Payout Receipt + Orders</div>
              <button style={btn} onClick={() => setReceiptOpen(false)}>Close</button>
            </div>

            {(() => {
              const uid = String(receiptRow?.delivery_user_id || "");
              const prof = driverMap[uid] || { name: `Driver ${uid.slice(0, 8)}`, email: "-" };
              const bank = bankMap[uid] || {};
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(260px,1fr))", gap: 10 }}>
                  <div style={card}><div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Payout ID</div><div style={{ fontWeight: 900 }}>{String(receiptRow?.id || "-")}</div></div>
                  <div style={card}><div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Amount</div><div style={{ fontWeight: 900 }}>${money(payoutAmountForRequest(receiptRow))}</div>{nnum(receiptRow?.total_amount) <= 0 && payoutAmountForRequest(receiptRow) > 0 ? <div style={{ marginTop: 4, fontSize: 11, fontWeight: 900, color: "#92400e" }}>Backfilled from linked order payouts</div> : null}</div>
                  <div style={card}><div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Driver</div><div style={{ fontWeight: 900 }}>{prof.name}</div><div style={{ fontSize: 12, opacity: 0.75 }}>{prof.email}</div></div>
                  <div style={card}><div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Orders</div><div style={{ fontWeight: 900 }}>{nnum(receiptRow?.count)}</div></div>
                  <div style={card}><div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Transaction Ref</div><div style={{ fontWeight: 900 }}>{String(receiptRow?.transaction_ref || "-")}</div></div>
                  <div style={card}><div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Paid At</div><div style={{ fontWeight: 900 }}>{fmtWhen(receiptRow?.paid_at || receiptRow?.created_at)}</div></div>
                  <div style={card}><div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Bank</div><div style={{ fontWeight: 900 }}>{String(receiptRow?.payout_bank_name || bank?.bank_name || "-")}</div><div style={{ fontSize: 12, opacity: 0.75 }}>{String(receiptRow?.payout_account_holder_name || bank?.account_holder_name || "-")}</div></div>
                  <div style={card}><div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Account / Routing</div><div style={{ fontWeight: 900 }}>{String(receiptRow?.payout_account_full || bank?.account_number_full || receiptRow?.payout_account_last4 || bank?.account_number_last4 || "-")}</div><div style={{ fontSize: 12, opacity: 0.75 }}>{String(receiptRow?.payout_routing_full || bank?.routing_code_full || receiptRow?.payout_routing_last4 || bank?.routing_code_last4 || "-")}</div></div>
                </div>
              );
            })()}

            <div style={{ ...card, display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 900, fontSize: 15 }}>Orders In This Payout</div>
              <button style={{ ...btn, justifySelf: "start" }} onClick={() => loadReceiptOrders(receiptRow)}>Refresh Orders</button>
              {receiptLoading ? <div style={{ fontWeight: 700, color: "rgba(15,23,42,0.7)" }}>Loading order details...</div> : null}
              {receiptErr ? <div style={{ color: "#7f1d1d", fontWeight: 800 }}>{receiptErr}</div> : null}
              {!receiptLoading && !receiptErr && receiptOrders.length === 0 ? <div style={{ fontWeight: 700, color: "rgba(15,23,42,0.7)" }}>No linked order details found for this payout.</div> : null}

              {!receiptLoading && !receiptErr && receiptOrders.length > 0 ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {receiptOrders.map((o) => (
                    <div key={`${o.source}:${o.id}`} style={{ border: "1px solid rgba(15,23,42,0.12)", borderRadius: 12, padding: 10, background: "rgba(248,250,252,0.8)", display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 900 }}>{o.source === "grocery" ? "Grocery" : "Restaurant"} Order</span>
                        <span style={{ fontSize: 12, color: "rgba(15,23,42,0.6)", fontWeight: 700 }}>{o.id}</span>
                        <span style={statusBadgeStyle(prettyStatus(o.status))}>{prettyStatus(o.status).toUpperCase()}</span>
                        <span style={{ marginLeft: "auto", fontWeight: 900 }}>${money(o.total)}</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(220px,1fr))", gap: 8, fontSize: 12 }}>
                        <div><b>Customer:</b> {o.customerName}</div>
                        <div><b>Phone:</b> {o.customerPhone}</div>
                        <div><b>Email:</b> {o.customerEmail}</div>
                        <div><b>Payment:</b> {o.paymentMethod}</div>
                        <div><b>Created:</b> {fmtWhen(o.createdAt)}</div>
                        <div><b>Address:</b> {o.address}</div>
                        <div style={{ gridColumn: "1 / -1" }}><b>Instructions:</b> {o.instructions}</div>
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontWeight: 900, fontSize: 13 }}>Items ({Array.isArray(o.items) ? o.items.length : 0})</div>
                        {!Array.isArray(o.items) || o.items.length === 0 ? <div style={{ fontSize: 12, color: "rgba(15,23,42,0.65)", fontWeight: 700 }}>No item rows found.</div> : null}
                        {(Array.isArray(o.items) ? o.items : []).map((it, idx) => (
                          <div key={`${o.id}:${it.id}:${idx}`} style={{ display: "grid", gridTemplateColumns: "46px 1fr auto auto", gap: 8, alignItems: "center", border: "1px solid rgba(15,23,42,0.09)", background: "#fff", borderRadius: 10, padding: 6 }}>
                            {it.image ? <img src={it.image} alt={it.name} style={{ width: 46, height: 46, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(15,23,42,0.1)" }} /> : <div style={{ width: 46, height: 46, borderRadius: 8, border: "1px solid rgba(15,23,42,0.1)", background: "rgba(15,23,42,0.03)" }} />}
                            <div style={{ fontSize: 13, fontWeight: 800 }}>{String(it.name || "Item")}</div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(15,23,42,0.75)" }}>Qty: {nnum(it.qty)}</div>
                            <div style={{ fontSize: 12, fontWeight: 900 }}>${money(it.price)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}





















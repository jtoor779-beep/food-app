import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type OrderEmailEvent =
  | "customer_order_placed"
  | "owner_new_order_received"
  | "owner_order_confirmed"
  | "owner_order_rejected"
  | "customer_order_delivered";

type OrderType = "restaurant" | "grocery";

type EmailItem = {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl?: string;
  embeddedImageUrl?: string;
};

type OwnerInvoiceBreakdown = {
  subtotal: number;
  tax: number;
  earnings: number;
};

type EmailAttachment = {
  name: string;
  content: string;
};

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const brevoApiKey = process.env.BREVO_API_KEY || "";
const brevoSenderEmail = process.env.BREVO_SENDER_EMAIL || "";
const brevoSenderName = process.env.BREVO_SENDER_NAME || "Homyfod";

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

function shortId(id: string) {
  return String(id || "").slice(0, 8);
}

function toNumber(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function firstNonEmpty(...values: any[]) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return "";
}

function safeImg(url: any) {
  const str = String(url || "").trim();
  if (!str) return "";
  if (/^https?:\/\//i.test(str)) return str;
  if (str.startsWith("/")) return str;
  return str.startsWith("uploads/") ? `/${str}` : str;
}

function emailImgSrc(url: any, origin?: string) {
  const str = String(url || "").trim();
  if (!str) return "";
  if (/^https?:\/\//i.test(str)) return str;

  const base = String(origin || "").trim().replace(/\/$/, "");
  if (!base) return "";
  if (str.startsWith("/")) return `${base}${str}`;

  const cleaned = str.replace(/^\.\//, "").replace(/^\/+/, "");
  return cleaned ? `${base}/${cleaned}` : "";
}
async function inlineEmailImage(url: string) {
  const src = String(url || "").trim();
  if (!/^https?:\/\//i.test(src)) return "";

  try {
    const res = await fetch(src, { cache: "no-store" });
    if (!res.ok) return "";

    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) return "";

    const contentLength = Number(res.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > 750000) return "";

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > 750000) return "";

    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
}

async function inlineEmailItems(items: EmailItem[], origin?: string): Promise<EmailItem[]> {
  if (!Array.isArray(items) || !items.length) return [];

  const settled = await Promise.all(
    items.map(async (item) => {
      const resolvedImg = emailImgSrc(item?.imageUrl, origin);
      const embeddedImageUrl = resolvedImg ? await inlineEmailImage(resolvedImg) : "";
      return embeddedImageUrl ? { ...item, embeddedImageUrl } : item;
    })
  );

  return settled;
}

async function getUserEmail(userId: string) {
  if (!userId) return null;

  try {
    const authRes = await supabaseAdmin.auth.admin.getUserById(userId);
    const authEmail = authRes?.data?.user?.email || null;
    if (authEmail) return authEmail;
  } catch {
    // ignore auth lookup failures
  }

  try {
    const { data: profileRow } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("user_id", userId)
      .maybeSingle();

    return profileRow?.email || null;
  } catch {
    return null;
  }
}

async function getRestaurantItems(orderId: string): Promise<EmailItem[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("order_items")
      .select(`
        id,
        qty,
        quantity,
        price_each,
        price,
        menu_item_id,
        menu_items ( id, name, image_url, image, photo_url, photo, item_image, product_image, thumbnail_url, price )
      `)
      .eq("order_id", orderId);

    if (error) throw error;

    return (data || []).map((row: any) => {
      const qty = toNumber(firstNonEmpty(row?.qty, row?.quantity), 1);
      const unitPrice = toNumber(firstNonEmpty(row?.price_each, row?.price, row?.menu_items?.price), 0);
      return {
        name: firstNonEmpty(row?.menu_items?.name, row?.name, "Item") || "Item",
        qty,
        unitPrice,
        lineTotal: unitPrice * qty,
        imageUrl: safeImg(firstNonEmpty(row?.menu_items?.image_url, row?.menu_items?.image, row?.menu_items?.photo_url, row?.menu_items?.photo, row?.menu_items?.item_image, row?.menu_items?.product_image, row?.menu_items?.thumbnail_url, row?.image_url, row?.image, row?.photo_url, row?.photo, row?.item_image, row?.product_image, row?.thumbnail_url)),
      };
    });
  } catch {
    return [];
  }
}

async function getGroceryItems(orderId: string): Promise<EmailItem[]> {
  const itemsTableCandidates = ["grocery_order_items", "order_items_grocery", "grocery_items_order"];
  const orderIdCols = ["order_id", "grocery_order_id"];
  const itemIdCols = ["grocery_item_id", "item_id", "product_id"];
  const qtyCols = ["qty", "quantity", "count"];

  for (const itemsTable of itemsTableCandidates) {
    for (const orderIdCol of orderIdCols) {
      for (const itemIdCol of itemIdCols) {
        for (const qtyCol of qtyCols) {
          try {
            const { data, error } = await supabaseAdmin.from(itemsTable).select("*").eq(orderIdCol, orderId);
            if (error) throw error;
            const rows = data || [];
            const itemIds = rows.map((row: any) => row?.[itemIdCol]).filter(Boolean);

            let groceryItems = new Map<string, any>();
            if (itemIds.length) {
              const { data: itemRows } = await supabaseAdmin
                .from("grocery_items")
                .select("id, name, image_url, image, photo_url, photo, item_image, product_image, thumbnail_url, price")
                .in("id", itemIds);
              groceryItems = new Map((itemRows || []).map((r: any) => [String(r.id), r]));
            }

            return rows.map((row: any) => {
              const itemId = row?.[itemIdCol];
              const meta = itemId ? groceryItems.get(String(itemId)) : null;
              const qty = toNumber(row?.[qtyCol], 1);
              const unitPrice = toNumber(firstNonEmpty(row?.price_each, row?.price, meta?.price), 0);
              return {
                name: firstNonEmpty(row?.name, row?.item_name, meta?.name, "Item") || "Item",
                qty,
                unitPrice,
                lineTotal: unitPrice * qty,
                imageUrl: safeImg(firstNonEmpty(row?.image_url, row?.img, row?.photo_url, row?.image, row?.photo, row?.item_image, row?.product_image, row?.thumbnail_url, meta?.image_url, meta?.image, meta?.photo_url, meta?.photo, meta?.item_image, meta?.product_image, meta?.thumbnail_url)),
              };
            });
          } catch {
            // continue trying fallbacks
          }
        }
      }
    }
  }

  return [];
}

async function getRestaurantContext(orderId: string) {
  const { data: orderRow, error: orderErr } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) throw orderErr;
  if (!orderRow) return null;

  let restaurantRow: any = null;
  if (orderRow.restaurant_id) {
    const { data } = await supabaseAdmin
      .from("restaurants")
      .select("id, name, owner_user_id")
      .eq("id", orderRow.restaurant_id)
      .maybeSingle();
    restaurantRow = data || null;
  }

  const ownerUserId = restaurantRow?.owner_user_id || null;

  return {
    orderId: orderRow.id,
    customerUserId: orderRow.user_id || null,
    ownerUserId,
    customerName: orderRow.customer_name || "Customer",
    venueName: restaurantRow?.name || "Restaurant",
    totalAmount: Number(orderRow.total || 0),
    subtotalAmount: toNumber(firstNonEmpty(orderRow.subtotal_amount, orderRow.subtotal, orderRow.item_total), 0),
    taxAmount: toNumber(firstNonEmpty(orderRow.tax_amount, orderRow.gst_amount, orderRow.tax, orderRow.gst), 0),
    deliveredAt: orderRow.delivered_at || null,
    label: "order",
    items: await getRestaurantItems(orderId),
  };
}

async function getGroceryContext(orderId: string) {
  const { data: orderRow, error: orderErr } = await supabaseAdmin
    .from("grocery_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) throw orderErr;
  if (!orderRow) return null;

  let storeRow: any = null;
  if (orderRow.store_id) {
    const { data } = await supabaseAdmin
      .from("grocery_stores")
      .select("id, name, owner_user_id")
      .eq("id", orderRow.store_id)
      .maybeSingle();
    storeRow = data || null;
  }

  const ownerUserId = storeRow?.owner_user_id || null;

  return {
    orderId: orderRow.id,
    customerUserId: orderRow.customer_user_id || null,
    ownerUserId,
    customerName: orderRow.customer_name || "Customer",
    venueName: storeRow?.name || "Store",
    totalAmount: Number(orderRow.total_amount || 0),
    subtotalAmount: toNumber(firstNonEmpty(orderRow.subtotal_amount, orderRow.subtotal, orderRow.item_total), 0),
    taxAmount: toNumber(firstNonEmpty(orderRow.tax_amount, orderRow.gst_amount, orderRow.tax, orderRow.gst), 0),
    deliveredAt: orderRow.delivered_at || null,
    label: "grocery order",
    items: await getGroceryItems(orderId),
  };
}

function escapeHtml(value: any) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapePdfText(value: any) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function formatMoney(amount: any) {
  const n = Number(amount || 0);
  return Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
    : "$0.00";
}

function formatDeliveredAt(value: any) {
  if (!value) return "Just now";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Just now";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function ownerRejectReason(ctx: any) {
  return String(
    ctx?.reject_reason ||
      ctx?.rejection_reason ||
      ctx?.cancel_reason ||
      ctx?.owner_reject_reason ||
      ctx?.owner_rejection_reason ||
      ctx?.owner_cancel_reason ||
      ctx?.cancel_note ||
      ctx?.cancellation_note ||
      ctx?.rejected_reason ||
      ctx?.reject_note ||
      ctx?.rejection_note ||
      ctx?.status_note ||
      ctx?.status_notes ||
      ""
  ).trim();
}

function buildManagerAppBridgeUrl(origin: string, input?: { screen?: string; fallback?: string }) {
  const safeOrigin = String(origin || "").trim().replace(/\/$/, "");
  if (!safeOrigin) return "";
  const screen = String(input?.screen || "orders").trim().replace(/^\/+/, "");
  const fallback = String(input?.fallback || "").trim();
  const params = new URLSearchParams();
  if (screen) params.set("screen", screen);
  if (fallback) params.set("fallback", fallback);
  const query = params.toString();
  return `${safeOrigin}/manager-app${query ? `?${query}` : ""}`;
}

function ownerInvoiceBreakdown(ctx: any): OwnerInvoiceBreakdown {
  const items = Array.isArray(ctx?.items) ? ctx.items : [];
  const itemSubtotal = items.reduce((sum: number, item: EmailItem) => sum + toNumber(item?.lineTotal, 0), 0);
  const storedSubtotal = toNumber(
    firstNonEmpty(ctx?.subtotalAmount, ctx?.subtotal, ctx?.itemTotal, ctx?.itemsTotal),
    NaN
  );
  const subtotal = Number.isFinite(storedSubtotal) && storedSubtotal > 0 ? storedSubtotal : itemSubtotal;
  const tax = toNumber(firstNonEmpty(ctx?.taxAmount, ctx?.gstAmount, ctx?.tax, ctx?.gst), 0);
  return {
    subtotal,
    tax,
    earnings: subtotal + tax,
  };
}

function shouldUseLogo(url?: string) {
  if (!url) return false;
  return !/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(url);
}

function buildEmailShell(opts: {
  eyebrow: string;
  title: string;
  intro: string;
  detailRows: Array<{ label: string; value: string }>;
  items?: EmailItem[];
  highlightLabel?: string;
  highlightValue?: string;
  note?: string;
  logoUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  assetOrigin?: string;
}) {
  const rowsHtml = opts.detailRows
    .map(
      (row) =>
        "<tr>" +
        "<td style=\"padding:12px 0;border-bottom:1px solid #eef2f7;color:#64748b;font-size:14px;\">" + escapeHtml(row.label) + "</td>" +
        "<td align=\"right\" style=\"padding:12px 0;border-bottom:1px solid #eef2f7;color:#0f172a;font-size:14px;font-weight:700;\">" + escapeHtml(row.value) + "</td>" +
        "</tr>"
    )
    .join("");

  const itemsHtml = (opts.items || []).length
    ? "<div style=\"margin-top:24px;\">" +
        "<div style=\"font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#15803d;font-weight:800;margin-bottom:14px;\">Items</div>" +
        (opts.items || [])
          .map((item) => {
            const resolvedImg = item.embeddedImageUrl || emailImgSrc(item.imageUrl, opts.assetOrigin);
            const img = resolvedImg
              ? "<img src=\"" + escapeHtml(resolvedImg) + "\" alt=\"" + escapeHtml(item.name) + "\" style=\"width:56px;height:56px;border-radius:14px;object-fit:cover;border:1px solid #e2e8f0;background:#f8fafc;\" />"
              : "<div style=\"width:56px;height:56px;border-radius:14px;border:1px solid #e2e8f0;background:#f8fafc;color:#94a3b8;font-size:12px;font-weight:800;line-height:56px;text-align:center;\">Item</div>";
            return "<div style=\"display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid #eef2f7;\">" +
              img +
              "<div style=\"flex:1;min-width:0;\">" +
                "<div style=\"font-size:15px;font-weight:800;color:#0f172a;line-height:1.35;\">" + escapeHtml(item.name) + "</div>" +
                "<div style=\"margin-top:4px;font-size:13px;color:#64748b;\">Qty " + escapeHtml(item.qty) + " • " + escapeHtml(formatMoney(item.unitPrice)) + " each</div>" +
              "</div>" +
              "<div style=\"font-size:14px;font-weight:900;color:#0f172a;white-space:nowrap;\">" + escapeHtml(formatMoney(item.lineTotal)) + "</div>" +
            "</div>";
          })
          .join("") +
      "</div>"
    : "";

  const highlightHtml = opts.highlightValue
    ? "<div style=\"margin:24px 0 22px;padding:20px 22px;border-radius:18px;background:#f0fdf4;border:1px solid #bbf7d0;\">" +
        "<div style=\"font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#15803d;font-weight:800;\">" +
          escapeHtml(opts.highlightLabel || "Update") +
        "</div>" +
        "<div style=\"margin-top:8px;font-size:32px;line-height:1.1;font-weight:900;color:#052e16;\">" +
          escapeHtml(opts.highlightValue) +
        "</div>" +
      "</div>"
    : "";

  const noteHtml = opts.note
    ? "<div style=\"margin-top:20px;padding:16px 18px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;color:#334155;font-size:14px;line-height:1.75;\">" + escapeHtml(opts.note) + "</div>"
    : "";

  const logoHtml = shouldUseLogo(opts.logoUrl)
    ? "<img src=\"" + escapeHtml(opts.logoUrl) + "\" alt=\"HomyFod\" style=\"display:block;width:140px;max-width:100%;height:auto;\" />"
    : "<div style=\"font-size:28px;font-weight:900;color:#0f172a;letter-spacing:-0.03em;\">HomyFod</div>";

  const ctaHtml = opts.ctaLabel && opts.ctaUrl
    ? "<div style=\"margin-top:24px;\">" +
        "<a href=\"" + escapeHtml(opts.ctaUrl) + "\" style=\"display:inline-block;padding:14px 22px;border-radius:14px;background:#16a34a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:900;\">" +
          escapeHtml(opts.ctaLabel) +
        "</a>" +
      "</div>"
    : "";

  return "<!DOCTYPE html>" +
    "<html><body style=\"margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;\">" +
      "<div style=\"padding:28px 12px;\">" +
        "<div style=\"max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:28px;overflow:hidden;box-shadow:0 18px 50px rgba(15,23,42,0.08);\">" +
          "<div style=\"padding:28px 32px 18px;background:#ffffff;border-bottom:1px solid #eef2f7;\">" +
            logoHtml +
            "<div style=\"margin-top:18px;display:inline-block;padding:8px 14px;border-radius:999px;background:#ecfdf5;color:#15803d;font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;\">" + escapeHtml(opts.eyebrow) + "</div>" +
            "<div style=\"margin-top:16px;font-size:34px;line-height:1.1;font-weight:900;color:#0f172a;\">" + escapeHtml(opts.title) + "</div>" +
            "<div style=\"margin-top:12px;font-size:16px;line-height:1.75;color:#475569;\">" + escapeHtml(opts.intro) + "</div>" +
          "</div>" +
          "<div style=\"padding:28px 32px 34px;\">" +
            highlightHtml +
            "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse;\">" + rowsHtml + "</table>" +
            itemsHtml +
            noteHtml +
            ctaHtml +
            "<div style=\"margin-top:26px;padding-top:18px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.8;\">" +
              "Need help? Contact HomyFod customer care for support with orders, delivery, or account questions." +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>" +
    "</body></html>";
}

function buildEmailPayload(
  eventType: OrderEmailEvent,
  ctx: any,
  meta: { logoUrl?: string; ordersUrl?: string; ownerOrdersUrl?: string; origin?: string }
) {
  const idPart = shortId(ctx.orderId);
  const amount = formatMoney(ctx.totalAmount || 0);
  const customerName = ctx.customerName || "Customer";
  const venueName = ctx.venueName || (ctx.label === "grocery order" ? "Store" : "Restaurant");
  const items = Array.isArray(ctx.items) ? ctx.items.slice(0, 6) : [];

  if (eventType === "customer_order_placed") {
    const subject = `Order placed successfully #${idPart}`;
    return {
      toName: customerName,
      subject,
      text: `Hi ${customerName}, your ${ctx.label} #${idPart} for ${venueName} has been placed successfully. Total: ${amount}.`,
      html: buildEmailShell({
        eyebrow: "Order Confirmed",
        title: "Your order is in",
        intro: `Hi ${customerName}, thanks for ordering with HomyFod. Your ${ctx.label} has been received and sent straight to ${venueName}.`,
        highlightLabel: "Total charged",
        highlightValue: amount,
        detailRows: [
          { label: "Order ID", value: `#${idPart}` },
          { label: ctx.label === "grocery order" ? "Store" : "Restaurant", value: venueName },
          { label: "Customer", value: customerName },
          { label: "Status", value: "Placed successfully" },
        ],
        items,
        note: "We will keep you posted at every major step, from confirmation to delivery. If anything changes, you will hear from us right away.",
        logoUrl: meta.logoUrl,
        ctaLabel: "Track order",
        ctaUrl: meta.ordersUrl,
        assetOrigin: meta.origin,
      }),
    };
  }

  if (eventType === "owner_new_order_received" || eventType === "owner_order_confirmed") {
    const ownerBreakdown = ownerInvoiceBreakdown(ctx);
    const isConfirmed = eventType === "owner_order_confirmed";
    const subject = isConfirmed ? `Order confirmed #${idPart}` : `New order received #${idPart}`;
    return {
      toName: venueName,
      subject,
      text: isConfirmed
        ? `${venueName} confirmed ${ctx.label} #${idPart}. Owner earnings (items + tax): ${formatMoney(ownerBreakdown.earnings)}.`
        : `A new ${ctx.label} #${idPart} has been received for ${venueName}. Customer: ${customerName}. Owner earnings (items + tax): ${formatMoney(ownerBreakdown.earnings)}.`,
      html: buildEmailShell({
        eyebrow: isConfirmed ? "Order Confirmed" : "New Order Alert",
        title: isConfirmed ? "Order confirmed and moved ahead" : "A new order just came in",
        intro: isConfirmed
          ? `${venueName} confirmed this ${ctx.label}. Your owner copy includes only item subtotal plus tax for payout clarity.`
          : `A fresh ${ctx.label} is waiting for ${venueName}. Open your dashboard, review the details, and move it into prep quickly.`,
        highlightLabel: "Owner earnings",
        highlightValue: formatMoney(ownerBreakdown.earnings),
        detailRows: [
          { label: "Order ID", value: `#${idPart}` },
          { label: "Customer", value: customerName },
          { label: ctx.label === "grocery order" ? "Store" : "Restaurant", value: venueName },
          { label: "Items subtotal", value: formatMoney(ownerBreakdown.subtotal) },
          { label: "Tax", value: formatMoney(ownerBreakdown.tax) },
          { label: "Status", value: isConfirmed ? "Confirmed" : "New order received" },
        ],
        items,
        note: "Owner earnings shown here include item price plus tax only. Delivery fee, platform fee, commission, and other platform-side fees are not included.",
        logoUrl: meta.logoUrl,
        ctaLabel: "Open dashboard",
        ctaUrl: meta.ownerOrdersUrl,
        assetOrigin: meta.origin,
      }),
    };
  }

  if (eventType === "owner_order_rejected") {
    const ownerBreakdown = ownerInvoiceBreakdown(ctx);
    const reason = ownerRejectReason(ctx) || "No reason provided.";
    return {
      toName: venueName,
      subject: `Order rejected #${idPart}`,
      text: `${venueName} rejected ${ctx.label} #${idPart}. Reason: ${reason}. Owner breakdown: items ${formatMoney(ownerBreakdown.subtotal)} + tax ${formatMoney(ownerBreakdown.tax)}.`,
      html: buildEmailShell({
        eyebrow: "Order Rejected",
        title: "You rejected this order",
        intro: `This email confirms that ${venueName} rejected ${ctx.label} #${idPart}.`,
        detailRows: [
          { label: "Order", value: `#${idPart}` },
          { label: "Customer", value: customerName },
          { label: "Items subtotal", value: formatMoney(ownerBreakdown.subtotal) },
          { label: "Tax", value: formatMoney(ownerBreakdown.tax) },
          { label: "Owner amount", value: formatMoney(ownerBreakdown.earnings) },
          { label: "Rejected at", value: formatDeliveredAt(ctx.created_at || ctx.updated_at) },
          { label: "Reason", value: reason },
        ],
        items,
        highlightLabel: "Rejected amount snapshot",
        highlightValue: `${formatMoney(ownerBreakdown.earnings)} owner view`,
        note: "This message is for owner record-keeping and reflects item subtotal plus tax only.",
        logoUrl: meta.logoUrl,
        ctaLabel: "Open owner orders",
        ctaUrl: meta.ownerOrdersUrl,
        assetOrigin: meta.origin,
      }),
    };
  }

  const deliveredAt = formatDeliveredAt(ctx.deliveredAt);
  const subject = `Order delivered #${idPart}`;
  return {
    toName: customerName,
    subject,
    text: `Hi ${customerName}, your ${ctx.label} #${idPart} from ${venueName} has been delivered. Delivered at: ${deliveredAt}.`,
    html: buildEmailShell({
      eyebrow: "Delivered",
      title: "Your order was delivered",
      intro: `Hi ${customerName}, your ${ctx.label} from ${venueName} has been completed successfully and marked as delivered.`,
      highlightLabel: "Delivered at",
      highlightValue: deliveredAt,
      detailRows: [
        { label: "Order ID", value: `#${idPart}` },
        { label: ctx.label === "grocery order" ? "Store" : "Restaurant", value: venueName },
        { label: "Customer", value: customerName },
        { label: "Total", value: amount },
      ],
      items,
      note: "Thanks for choosing HomyFod. We hope everything arrived fresh, complete, and right on time.",
      logoUrl: meta.logoUrl,
      ctaLabel: "Open orders",
      ctaUrl: meta.ordersUrl,
      assetOrigin: meta.origin,
    }),
  };
}

function truncatePdfLabel(value: any, max = 42) {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function buildInvoicePdfAttachment(ctx: any) {
  const ownerBreakdown = ownerInvoiceBreakdown(ctx);
  const items: EmailItem[] = Array.isArray(ctx?.items) ? ctx.items.slice(0, 8) : [];
  const extraItemCount = Array.isArray(ctx?.items) && ctx.items.length > items.length ? ctx.items.length - items.length : 0;
  const venueLabel = ctx.label === "grocery order" ? "Grocery store" : "Restaurant";
  const typeLabel = ctx.label === "grocery order" ? "Grocery Order" : "Restaurant Order";
  const issueDate = formatDeliveredAt(ctx?.updated_at || ctx?.created_at || new Date().toISOString());
  const customer = truncatePdfLabel(ctx?.customerName || "-", 30);
  const venueName = truncatePdfLabel(ctx?.venueName || "-", 30);

  const commands: string[] = [];
  const push = (value: string) => commands.push(value);
  const rect = (x: number, y: number, w: number, h: number, fill: [number, number, number], stroke?: [number, number, number]) => {
    push(`${fill[0]} ${fill[1]} ${fill[2]} rg`);
    if (stroke) {
      push(`${stroke[0]} ${stroke[1]} ${stroke[2]} RG`);
      push(`${x} ${y} ${w} ${h} re B`);
      return;
    }
    push(`${x} ${y} ${w} ${h} re f`);
  };
  const text = (
    x: number,
    y: number,
    value: string,
    opts?: { size?: number; font?: "F1" | "F2"; color?: [number, number, number] }
  ) => {
    const size = opts?.size ?? 11;
    const font = opts?.font ?? "F1";
    const color = opts?.color ?? [0.07, 0.09, 0.13];
    push(`BT /${font} ${size} Tf ${color[0]} ${color[1]} ${color[2]} rg 1 0 0 1 ${x} ${y} Tm (${escapePdfText(value)}) Tj ET`);
  };
  const line = (x1: number, y1: number, x2: number, y2: number, color: [number, number, number], width = 1) => {
    push(`${width} w`);
    push(`${color[0]} ${color[1]} ${color[2]} RG`);
    push(`${x1} ${y1} m ${x2} ${y2} l S`);
  };

  rect(0, 0, 612, 792, [1, 1, 1]);
  rect(36, 712, 540, 56, [0.97, 0.45, 0.09]);
  text(52, 744, "HomyFod Invoice", { size: 24, font: "F2", color: [1, 1, 1] });
  text(52, 724, "Owner earnings copy", { size: 11, font: "F1", color: [1, 0.96, 0.92] });
  text(430, 744, `#${shortId(ctx.orderId)}`, { size: 18, font: "F2", color: [1, 1, 1] });
  text(432, 724, issueDate, { size: 10, font: "F1", color: [1, 0.96, 0.92] });

  rect(36, 628, 256, 64, [1, 0.98, 0.95], [0.98, 0.87, 0.76]);
  rect(306, 628, 270, 64, [0.98, 0.99, 1], [0.84, 0.9, 0.98]);
  text(52, 674, "Order summary", { size: 12, font: "F2", color: [0.07, 0.09, 0.13] });
  text(52, 654, `Type: ${typeLabel}`, { size: 11 });
  text(52, 638, `${venueLabel}: ${venueName}`, { size: 11 });
  text(322, 674, "Owner payout view", { size: 12, font: "F2", color: [0.07, 0.09, 0.13] });
  text(322, 654, `Items subtotal: ${formatMoney(ownerBreakdown.subtotal)}`, { size: 11 });
  text(322, 638, `Tax: ${formatMoney(ownerBreakdown.tax)}   Total owner amount: ${formatMoney(ownerBreakdown.earnings)}`, { size: 11 });

  rect(36, 544, 170, 62, [1, 1, 1], [0.9, 0.92, 0.95]);
  rect(221, 544, 170, 62, [1, 1, 1], [0.9, 0.92, 0.95]);
  rect(406, 544, 170, 62, [1, 1, 1], [0.9, 0.92, 0.95]);
  text(52, 586, "Customer", { size: 10, font: "F2", color: [0.39, 0.45, 0.54] });
  text(52, 562, customer, { size: 14, font: "F2" });
  text(237, 586, "Invoice date", { size: 10, font: "F2", color: [0.39, 0.45, 0.54] });
  text(237, 562, truncatePdfLabel(issueDate, 24), { size: 14, font: "F2" });
  text(422, 586, "Order type", { size: 10, font: "F2", color: [0.39, 0.45, 0.54] });
  text(422, 562, typeLabel, { size: 14, font: "F2" });

  text(36, 514, "Items", { size: 15, font: "F2" });
  line(36, 507, 576, 507, [0.9, 0.92, 0.95], 1);
  text(40, 488, "Item", { size: 10, font: "F2", color: [0.39, 0.45, 0.54] });
  text(315, 488, "Qty", { size: 10, font: "F2", color: [0.39, 0.45, 0.54] });
  text(385, 488, "Unit", { size: 10, font: "F2", color: [0.39, 0.45, 0.54] });
  text(492, 488, "Line total", { size: 10, font: "F2", color: [0.39, 0.45, 0.54] });
  line(36, 480, 576, 480, [0.9, 0.92, 0.95], 1);

  let currentY = 456;
  items.forEach((item, index) => {
    const fill = index % 2 === 0 ? [0.995, 0.997, 1] as [number, number, number] : [1, 1, 1] as [number, number, number];
    rect(36, currentY - 10, 540, 26, fill);
    text(40, currentY, truncatePdfLabel(item.name, 38), { size: 10 });
    text(320, currentY, String(item.qty || 0), { size: 10 });
    text(378, currentY, formatMoney(item.unitPrice || 0), { size: 10 });
    text(494, currentY, formatMoney(item.lineTotal || 0), { size: 10, font: "F2" });
    currentY -= 30;
  });

  if (extraItemCount > 0) {
    text(40, currentY, `+ ${extraItemCount} more item${extraItemCount === 1 ? "" : "s"} in this order`, {
      size: 10,
      font: "F1",
      color: [0.39, 0.45, 0.54],
    });
    currentY -= 24;
  }

  const summaryTop = Math.max(186, currentY - 18);
  rect(330, summaryTop, 246, 110, [1, 0.985, 0.965], [0.98, 0.87, 0.76]);
  text(348, summaryTop + 84, "Owner summary", { size: 13, font: "F2" });
  text(348, summaryTop + 58, "Items subtotal", { size: 10, font: "F2", color: [0.39, 0.45, 0.54] });
  text(478, summaryTop + 58, formatMoney(ownerBreakdown.subtotal), { size: 12, font: "F2" });
  text(348, summaryTop + 36, "Tax", { size: 10, font: "F2", color: [0.39, 0.45, 0.54] });
  text(478, summaryTop + 36, formatMoney(ownerBreakdown.tax), { size: 12, font: "F2" });
  line(348, summaryTop + 26, 558, summaryTop + 26, [0.98, 0.87, 0.76], 1);
  text(348, summaryTop + 10, "Owner amount", { size: 11, font: "F2" });
  text(468, summaryTop + 10, formatMoney(ownerBreakdown.earnings), { size: 15, font: "F2", color: [0.97, 0.45, 0.09] });

  text(36, 92, "This invoice is the HomyFod owner copy and shows item subtotal plus tax only.", {
    size: 10,
    font: "F1",
    color: [0.39, 0.45, 0.54],
  });

  const stream = commands.join("\n");
  const length = Buffer.byteLength(stream, "utf8");

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj",
    `6 0 obj << /Length ${length} >> stream\n${stream}\nendstream endobj`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((obj) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${obj}\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return {
    name: `invoice-${shortId(ctx.orderId)}.pdf`,
    content: Buffer.from(pdf, "binary").toString("base64"),
  } satisfies EmailAttachment;
}

async function sendBrevoEmail(
  toEmail: string,
  toName: string,
  subject: string,
  text: string,
  html: string,
  attachments?: EmailAttachment[]
) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": brevoApiKey,
    },
    body: JSON.stringify({
      sender: {
        email: brevoSenderEmail,
        name: brevoSenderName,
      },
      to: [{ email: toEmail, name: toName }],
      subject,
      textContent: text,
      htmlContent: html,
      attachment: Array.isArray(attachments) && attachments.length ? attachments : undefined,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.message || "Brevo request failed");
  }

  return json;
}

export async function POST(req: Request) {
  try {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json({ success: false, message: "Missing Supabase envs" }, { status: 500 });
    }

    if (!brevoApiKey || !brevoSenderEmail) {
      return NextResponse.json({ success: false, skipped: true, reason: "missing_brevo_env" });
    }

    const body = await req.json();
    const eventType = String(body?.eventType || "") as OrderEmailEvent;
    const orderType = String(body?.orderType || "") as OrderType;
    const orderId = String(body?.orderId || "").trim();

    if (!eventType || !orderType || !orderId) {
      return NextResponse.json({ success: false, message: "Missing eventType, orderType, or orderId" }, { status: 400 });
    }

    const ctx = orderType === "grocery"
      ? await getGroceryContext(orderId)
      : await getRestaurantContext(orderId);

    if (!ctx) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    const recipientUserId =
      eventType === "owner_new_order_received" || eventType === "owner_order_confirmed" || eventType === "owner_order_rejected"
        ? ctx.ownerUserId
        : ctx.customerUserId;

    if (!recipientUserId) {
      return NextResponse.json({ success: true, skipped: true, reason: "missing_recipient_user" });
    }

    const recipientEmail = await getUserEmail(recipientUserId);
    if (!recipientEmail) {
      return NextResponse.json({ success: true, skipped: true, reason: "missing_recipient_email" });
    }

    const reqUrl = new URL(req.url);
    const origin = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || reqUrl.origin).replace(/\/$/, "");
    ctx.items = await inlineEmailItems(Array.isArray(ctx.items) ? ctx.items : [], origin);
    const ownerWebOrdersUrl = `${origin}/${orderType === "grocery" ? "groceries/owner/orders" : "restaurants/orders"}`;
    const payload = buildEmailPayload(eventType, ctx, {
      origin,
      logoUrl: `${origin}/logo.png`,
      ordersUrl: `${origin}/${orderType === "grocery" ? "groceries/orders" : "orders"}`,
      ownerOrdersUrl: buildManagerAppBridgeUrl(origin, {
        screen: "orders",
        fallback: ownerWebOrdersUrl,
      }),
    });
    const attachments =
      eventType === "owner_new_order_received" || eventType === "owner_order_confirmed" || eventType === "owner_order_rejected"
        ? [buildInvoicePdfAttachment(ctx)]
        : [];

    const brevo = await sendBrevoEmail(
      recipientEmail,
      payload.toName,
      payload.subject,
      payload.text,
      payload.html,
      attachments
    );

    return NextResponse.json({ success: true, recipientEmail, brevo });
  } catch (error: any) {
    console.error("send-order-email error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to send order email" },
      { status: 500 }
    );
  }
}












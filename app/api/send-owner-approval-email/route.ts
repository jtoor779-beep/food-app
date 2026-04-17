import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const brevoApiKey = process.env.BREVO_API_KEY || "";
const brevoSenderEmail = process.env.BREVO_SENDER_EMAIL || "";
const brevoSenderName = process.env.BREVO_SENDER_NAME || "HomyFod";

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function escapeHtml(value: unknown) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function getOwnerIdentity(userId: string) {
  let authEmail = "";
  try {
    const authRes = await supabaseAdmin.auth.admin.getUserById(userId);
    authEmail = clean(authRes?.data?.user?.email);
  } catch {
    // ignore
  }

  let profileRow: any = null;
  try {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", userId)
      .maybeSingle();
    profileRow = data || null;
  } catch {
    profileRow = null;
  }

  return {
    email: authEmail || clean(profileRow?.email),
    fullName: clean(profileRow?.full_name) || "Store Owner",
  };
}

function buildOwnerApprovalEmail(opts: {
  name: string;
  storeName: string;
  ownerRole: string;
  dashboardUrl: string;
  logoUrl: string;
}) {
  const firstName = clean(opts.name).split(/\s+/)[0] || "Owner";
  const isGrocery = clean(opts.ownerRole) === "grocery_owner";
  const storeLabel = isGrocery ? "grocery store" : "restaurant";
  const actionLabel = isGrocery ? "add grocery items" : "add menu items";

  const subject = `Welcome to HomyFod ${isGrocery ? "Groceries" : "Restaurant"}. Your ${storeLabel} is approved.`;
  const text =
    `Hi ${firstName}, your ${storeLabel} ${clean(opts.storeName) || "store"} has been approved on HomyFod. ` +
    `You can now sign in, ${actionLabel}, update timings, accept live orders, manage notifications, and track owner earnings. ` +
    `Open your owner dashboard to get started.`;

  const html =
    "<!DOCTYPE html><html><body style=\"margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;\">" +
    "<div style=\"padding:28px 12px;\">" +
    "<div style=\"max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:28px;overflow:hidden;box-shadow:0 18px 50px rgba(15,23,42,0.08);\">" +
    "<div style=\"padding:28px 32px 18px;border-bottom:1px solid #eef2f7;\">" +
    `<img src="${escapeHtml(opts.logoUrl)}" alt="HomyFod" style="display:block;width:140px;max-width:100%;height:auto;" />` +
    "<div style=\"margin-top:18px;display:inline-block;padding:8px 14px;border-radius:999px;background:#ecfdf5;color:#15803d;font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;\">Store Approved</div>" +
    `<div style="margin-top:16px;font-size:34px;line-height:1.1;font-weight:900;color:#0f172a;">Welcome to HomyFod ${isGrocery ? "Groceries" : "Restaurant"}</div>` +
    `<div style="margin-top:12px;font-size:16px;line-height:1.75;color:#475569;">Hi ${escapeHtml(firstName)}, your ${escapeHtml(storeLabel)} <b>${escapeHtml(opts.storeName || "store")}</b> is now approved and ready to go live.</div>` +
    "</div>" +
    "<div style=\"padding:28px 32px 34px;\">" +
    "<div style=\"margin:0 0 22px;padding:20px 22px;border-radius:18px;background:#fff7ed;border:1px solid #fdba74;\">" +
    "<div style=\"font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#c2410c;font-weight:800;\">Next steps</div>" +
    `<div style="margin-top:8px;font-size:28px;line-height:1.15;font-weight:900;color:#7c2d12;">Open your dashboard and ${escapeHtml(actionLabel)}</div>` +
    "</div>" +
    "<div style=\"font-size:15px;line-height:1.85;color:#334155;\">" +
    "<p style=\"margin:0 0 14px;\">A strong launch usually starts with a complete profile and clear item photos.</p>" +
    "<ul style=\"margin:0 0 18px 18px;padding:0;color:#334155;\">" +
    `<li style="margin:0 0 10px;">Add your ${escapeHtml(isGrocery ? "store items and categories" : "menu items and cuisine sections")}.</li>` +
    "<li style=\"margin:0 0 10px;\">Check your timings, address, payout details, and notification settings.</li>" +
    "<li style=\"margin:0 0 10px;\">Keep order acceptance fast so customers get a smooth experience.</li>" +
    "<li style=\"margin:0;\">Watch owner earnings in app or desktop. HomyFod owner earnings show item subtotal plus tax only.</li>" +
    "</ul>" +
    "</div>" +
    `<a href="${escapeHtml(opts.dashboardUrl)}" style="display:inline-block;padding:14px 22px;border-radius:14px;background:#16a34a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:900;">Open HomyFod Owner Dashboard</a>` +
    "<div style=\"margin-top:24px;padding:16px 18px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;color:#475569;font-size:14px;line-height:1.75;\">" +
    "Need help? Use the support option inside your owner dashboard and our team will help you get your store ready." +
    "</div>" +
    "</div></div></div></body></html>";

  return { subject, text, html };
}

async function sendBrevoEmail(toEmail: string, toName: string, subject: string, text: string, html: string) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": brevoApiKey,
    },
    body: JSON.stringify({
      sender: { email: brevoSenderEmail, name: brevoSenderName },
      to: [{ email: toEmail, name: toName }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.message || "Brevo request failed");
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
    const userId = clean(body?.userId);
    const ownerRole = clean(body?.ownerRole);
    const storeName = clean(body?.storeName) || "Your store";
    if (!userId || !ownerRole) {
      return NextResponse.json({ success: false, message: "Missing userId or ownerRole" }, { status: 400 });
    }

    const owner = await getOwnerIdentity(userId);
    if (!owner.email) {
      return NextResponse.json({ success: true, skipped: true, reason: "missing_recipient_email" });
    }

    const reqUrl = new URL(req.url);
    const origin = clean(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || reqUrl.origin).replace(/\/$/, "");
    const dashboardUrl = ownerRole === "grocery_owner" ? `${origin}/groceries/owner/dashboard` : `${origin}/restaurants/dashboard`;
    const payload = buildOwnerApprovalEmail({
      name: owner.fullName,
      storeName,
      ownerRole,
      dashboardUrl,
      logoUrl: `${origin}/logo.png`,
    });

    const brevo = await sendBrevoEmail(owner.email, owner.fullName, payload.subject, payload.text, payload.html);
    return NextResponse.json({ success: true, recipientEmail: owner.email, brevo });
  } catch (error: any) {
    console.error("send-owner-approval-email error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to send owner approval email" },
      { status: 500 }
    );
  }
}

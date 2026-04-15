import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
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

async function getDriverIdentity(userId: string) {
  let authEmail = "";
  try {
    const authRes = await supabaseAdmin.auth.admin.getUserById(userId);
    authEmail = clean(authRes?.data?.user?.email);
  } catch {
    // ignore auth lookup failures
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
    fullName: clean(profileRow?.full_name) || "Driver",
  };
}

function buildDriverApprovalEmail(opts: { name: string; dashboardUrl: string; logoUrl: string }) {
  const firstName = clean(opts.name).split(/\s+/)[0] || "Driver";

  const subject = "Welcome to HomyFod Driver. You are approved to start delivering.";
  const text =
    `Hi ${firstName}, your HomyFod Driver profile has been approved by our support team. ` +
    `You can now sign in, go online, accept deliveries, and start earning. ` +
    `Keep your rating strong, communicate clearly, and complete pickup and drop-off steps carefully. ` +
    `Open the driver app to get started.`;

  const html =
    "<!DOCTYPE html><html><body style=\"margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;\">" +
    "<div style=\"padding:28px 12px;\">" +
    "<div style=\"max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:28px;overflow:hidden;box-shadow:0 18px 50px rgba(15,23,42,0.08);\">" +
    "<div style=\"padding:28px 32px 18px;border-bottom:1px solid #eef2f7;\">" +
    `<img src="${escapeHtml(opts.logoUrl)}" alt="HomyFod" style="display:block;width:140px;max-width:100%;height:auto;" />` +
    "<div style=\"margin-top:18px;display:inline-block;padding:8px 14px;border-radius:999px;background:#ecfdf5;color:#15803d;font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;\">Driver Approved</div>" +
    "<div style=\"margin-top:16px;font-size:34px;line-height:1.1;font-weight:900;color:#0f172a;\">Welcome to HomyFod Driver</div>" +
    `<div style="margin-top:12px;font-size:16px;line-height:1.75;color:#475569;">Hi ${escapeHtml(firstName)}, your profile has been approved by our support team. You are now ready to sign in, accept deliveries, and start earning with HomyFod.</div>` +
    "</div>" +
    "<div style=\"padding:28px 32px 34px;\">" +
    "<div style=\"margin:0 0 22px;padding:20px 22px;border-radius:18px;background:#f0fdf4;border:1px solid #bbf7d0;\">" +
    "<div style=\"font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#15803d;font-weight:800;\">Next step</div>" +
    "<div style=\"margin-top:8px;font-size:28px;line-height:1.15;font-weight:900;color:#052e16;\">Open the app and go online</div>" +
    "</div>" +
    "<div style=\"font-size:15px;line-height:1.85;color:#334155;\">" +
    "<p style=\"margin:0 0 14px;\">HomyFod is a great place to earn with flexible delivery hours and a smooth pickup-to-dropoff flow.</p>" +
    "<p style=\"margin:0 0 14px;\">A few things that help strong drivers stand out:</p>" +
    "<ul style=\"margin:0 0 18px 18px;padding:0;color:#334155;\">" +
    "<li style=\"margin:0 0 10px;\">Keep your rating high with clear communication and careful handoff.</li>" +
    "<li style=\"margin:0 0 10px;\">Stay on time for pickups and deliveries whenever possible.</li>" +
    "<li style=\"margin:0 0 10px;\">Double-check item details before leaving the store or restaurant.</li>" +
    "<li style=\"margin:0;\">Keep your payout and profile details updated for a smooth experience.</li>" +
    "</ul>" +
    "</div>" +
    `<a href="${escapeHtml(opts.dashboardUrl)}" style="display:inline-block;padding:14px 22px;border-radius:14px;background:#16a34a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:900;">Open HomyFod</a>` +
    "<div style=\"margin-top:24px;padding:16px 18px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;color:#475569;font-size:14px;line-height:1.75;\">" +
    "Need help? Our HomyFod support team is here to help you get set up and start delivering smoothly." +
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
      sender: {
        email: brevoSenderEmail,
        name: brevoSenderName,
      },
      to: [{ email: toEmail, name: toName }],
      subject,
      textContent: text,
      htmlContent: html,
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
    const userId = clean(body?.userId);
    if (!userId) {
      return NextResponse.json({ success: false, message: "Missing userId" }, { status: 400 });
    }

    const driver = await getDriverIdentity(userId);
    if (!driver.email) {
      return NextResponse.json({ success: true, skipped: true, reason: "missing_recipient_email" });
    }

    const reqUrl = new URL(req.url);
    const origin = clean(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || reqUrl.origin).replace(/\/$/, "");
    const payload = buildDriverApprovalEmail({
      name: driver.fullName,
      dashboardUrl: `${origin}/driver-signup`,
      logoUrl: `${origin}/logo.png`,
    });

    const brevo = await sendBrevoEmail(driver.email, driver.fullName, payload.subject, payload.text, payload.html);
    return NextResponse.json({ success: true, recipientEmail: driver.email, brevo });
  } catch (error: any) {
    console.error("send-driver-approval-email error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to send driver approval email" },
      { status: 500 }
    );
  }
}

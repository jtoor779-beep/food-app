import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import webpush from "web-push";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const brevoApiKey = process.env.BREVO_API_KEY || "";
const brevoSenderEmail = process.env.BREVO_SENDER_EMAIL || "";
const brevoSenderName = process.env.BREVO_SENDER_NAME || "Homyfod";

// Configure Web Push if keys are present
function setupWebPush() {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(
      "mailto:admin@homyfod.com",
      vapidPublicKey,
      vapidPrivateKey
    );
    return true;
  }
  return false;
}

async function getUserEmail(userId: string) {
  if (!userId) return null;
  try {
    const authRes = await supabaseAdmin.auth.admin.getUserById(userId);
    const authEmail = authRes?.data?.user?.email || null;
    if (authEmail) return authEmail;
  } catch {}
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

function isLikelyExpoPushToken(token: string) {
  return (
    token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[")
  );
}

async function getCustomerExpoTokens(userId: string) {
  const tables = [
    { table: "customer_push_tokens", roleFilter: null },
    { table: "push_tokens", roleFilter: "customer" },
  ];

  const tokens = new Set<string>();
  for (const entry of tables) {
    try {
      let query = supabaseAdmin
        .from(entry.table)
        .select("expo_push_token")
        .eq("user_id", userId);
      if (entry.roleFilter) query = query.eq("role", entry.roleFilter);
      const { data, error } = await query;
      if (error) continue;
      ((data as any[]) || []).forEach((row) => {
        const token = String(row?.expo_push_token || "").trim();
        if (token && isLikelyExpoPushToken(token)) tokens.add(token);
      });
    } catch {
      // ignore incompatible table shapes
    }
  }
  return Array.from(tokens);
}

async function sendBrevoEmail(toEmail: string, toName: string, subject: string, html: string) {
  if (!brevoApiKey || !brevoSenderEmail) return;
  await fetch("https://api.brevo.com/v3/smtp/email", {
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
      htmlContent: html,
    }),
  });
}

export async function POST(req: Request) {
  try {
    const {
      orderId,
      orderType,
      recipientRole,
      recipientUserId,
      senderRole,
      senderName,
      preview,
    } = await req.json();

    if (!recipientUserId || !recipientRole) {
      return NextResponse.json({ success: false, message: "Missing recipient info" }, { status: 400 });
    }

    const title = `New message from ${senderName || senderRole}`;
    const body = preview || "Sent an attachment";
    const url = orderId ? `/order/${orderType === "grocery" ? "grocery" : "restaurant"}/${orderId}` : orderType === "grocery" ? "/groceries/orders" : "/orders";

    // 1) Handle Driver Recipient (Expo Push)
    if (recipientRole === "driver" || recipientRole === "delivery_partner") {
      const { data: tokenRows } = await supabaseAdmin
        .from("driver_push_tokens")
        .select("expo_push_token")
        .eq("user_id", recipientUserId);

      const tokens = (tokenRows || []).map(r => r.expo_push_token).filter(t => t && (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken[")));

      if (tokens.length > 0) {
        const messages = tokens.map(token => ({
          to: token,
          sound: "default",
          title,
          body,
          data: { type: "chat_message", orderId, orderType, screen: "/order-details" },
        }));

        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(messages),
        });
      }
    }

    // 2) Handle Customer Recipient (Web Push + Email)
    if (recipientRole === "customer") {
      // A) Expo Push
      const expoTokens = await getCustomerExpoTokens(recipientUserId);
      if (expoTokens.length > 0) {
        const messages = expoTokens.map((token) => ({
          to: token,
          sound: "default",
          title,
          body,
          priority: "high",
          ttl: 3600,
          badge: 1,
          mutableContent: true,
          interruptionLevel: "time-sensitive",
          data: { type: "chat_message", orderId, orderType, link: url },
        }));

        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(messages),
        });
      }

      // B) Web Push
      const hasWebPush = setupWebPush();
      if (hasWebPush) {
        const { data: subs } = await supabaseAdmin
          .from("push_subscriptions")
          .select("endpoint,p256dh,auth")
          .eq("user_id", recipientUserId);

        if (subs && subs.length > 0) {
          const payload = JSON.stringify({ title, body, url });
          for (const s of subs) {
            try {
              await webpush.sendNotification({
                endpoint: s.endpoint,
                keys: { p256dh: s.p256dh, auth: s.auth }
              }, payload);
            } catch (e) {
              console.log("Web push delivery error:", e);
            }
          }
        }
      }

      // C) Email Fallback
      const recipientEmail = await getUserEmail(recipientUserId);
      if (recipientEmail) {
        const reqUrl = new URL(req.url);
        const origin = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || reqUrl.origin).replace(/\/$/, "");
        const ordersLink = `${origin}${url}`;
        
        const emailHtml = `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #16a34a;">New message from your driver</h2>
            <p>Hi there,</p>
            <p>Your driver just sent you a message regarding your ${orderType} order <strong>#${orderId.slice(0,8)}</strong>:</p>
            <blockquote style="background: #f3f4f6; padding: 15px; border-radius: 8px; border-left: 4px solid #16a34a;">
              ${body}
            </blockquote>
            <p style="margin-top: 20px;">
              <a href="${ordersLink}" style="background: #16a34a; color: white; padding: 12px 20px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                View Chat & Track Order
              </a>
            </p>
            <p style="font-size: 12px; color: #666; margin-top: 30px;">
              If you didn't expect this email, please ignore it.
            </p>
          </div>
        `;

        try {
          await sendBrevoEmail(recipientEmail, "Customer", title, emailHtml);
        } catch (err) {
          console.log("Email notification error:", err);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("send-chat-notification API error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

webpush.setVapidDetails(
  "mailto:admin@homyfod.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export async function POST(req) {
  try {
    const { user_id, title, body, url } = await req.json();

    if (!user_id) {
      return Response.json({ success: false, error: "Missing user_id" }, { status: 400 });
    }

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", user_id);

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!subs || subs.length === 0) {
      return Response.json({ success: true, sent: 0, note: "No subscriptions for user" });
    }

    let sent = 0;

    for (const s of subs) {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };

      const payload = JSON.stringify({
        title: title || "HomyFod",
        body: body || "New update",
        url: url || "/delivery",
      });

      try {
        await webpush.sendNotification(subscription, payload);
        sent += 1;
      } catch (e) {
        // Ignore single failures; user may have old/unsubscribed endpoints.
        console.log("webpush error:", e?.message || e);
      }
    }

    return Response.json({ success: true, sent });
  } catch (e) {
    return Response.json(
      { success: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
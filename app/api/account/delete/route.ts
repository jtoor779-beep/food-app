import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : null;

function clean(value: unknown) {
  return String(value || "").trim();
}

function cleanLower(value: unknown) {
  return clean(value).toLowerCase();
}

function isIgnorableDeleteError(error: any) {
  const msg = cleanLower(error?.message);
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find") ||
    msg.includes("column") ||
    msg.includes("relation")
  );
}

async function deleteRowsBestEffort(table: string, filters: Array<{ column: string; value: string }>) {
  for (const filter of filters) {
    try {
      const { error } = await supabaseAdmin!.from(table).delete().eq(filter.column, filter.value);
      if (!error) return true;
      if (!isIgnorableDeleteError(error)) throw error;
    } catch (error: any) {
      if (!isIgnorableDeleteError(error)) throw error;
    }
  }

  return false;
}

async function scrubCustomerData(userId: string) {
  await Promise.allSettled([
    deleteRowsBestEffort("profiles", [{ column: "user_id", value: userId }]),
    deleteRowsBestEffort("notifications", [{ column: "user_id", value: userId }]),
    deleteRowsBestEffort("customer_push_tokens", [{ column: "user_id", value: userId }]),
    deleteRowsBestEffort("owner_push_tokens", [{ column: "user_id", value: userId }]),
    deleteRowsBestEffort("push_tokens", [
      { column: "user_id", value: userId },
      { column: "owner_user_id", value: userId },
    ]),
    deleteRowsBestEffort("owner_payout_bank_accounts", [{ column: "owner_user_id", value: userId }]),
    deleteRowsBestEffort("owner_payout_requests", [{ column: "owner_user_id", value: userId }]),
    deleteRowsBestEffort("support_tickets", [{ column: "user_id", value: userId }]),
    deleteRowsBestEffort("support_ticket_messages", [{ column: "user_id", value: userId }]),
    deleteRowsBestEffort("menu_items", [{ column: "owner_user_id", value: userId }]),
    deleteRowsBestEffort("restaurants", [{ column: "owner_user_id", value: userId }]),
    deleteRowsBestEffort("grocery_items", [{ column: "owner_user_id", value: userId }]),
    deleteRowsBestEffort("grocery_stores", [{ column: "owner_user_id", value: userId }]),
  ]);
}

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Missing Supabase envs" }, { status: 500 });
    }

    const authHeader = clean(req.headers.get("authorization"));
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing access token." }, { status: 401 });
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user?.id) {
      return NextResponse.json({ ok: false, error: "Invalid session." }, { status: 401 });
    }

    await scrubCustomerData(user.id);

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id, true);
    if (deleteError) {
      return NextResponse.json(
        { ok: false, error: deleteError.message || "Unable to delete account." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unable to delete account." },
      { status: 500 }
    );
  }
}

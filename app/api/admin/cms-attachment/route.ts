import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ATTACH_BUCKET = "cms_page_attachments";

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

function safeFileName(value: string) {
  return clean(value || "attachment")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "attachment";
}

function isMissingBucketError(error: any) {
  const msg = cleanLower(error?.message);
  return (
    msg.includes("bucket not found") ||
    msg.includes("does not exist") ||
    msg.includes("not found")
  );
}

async function ensureAttachmentBucket() {
  const listRes = await supabaseAdmin!.storage.listBuckets();
  if (listRes.error) throw listRes.error;

  const exists = (listRes.data || []).some((bucket) => clean(bucket?.name) === ATTACH_BUCKET);
  if (exists) return;

  const created = await supabaseAdmin!.storage.createBucket(ATTACH_BUCKET, {
    public: false,
    fileSizeLimit: "25MB",
    allowedMimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "image/png",
      "image/jpeg",
      "image/webp",
    ],
  });
  if (created.error) throw created.error;
}

async function requireAdminUser(req: Request) {
  const authHeader = clean(req.headers.get("authorization"));
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Missing access token.");

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin!.auth.getUser(token);

  if (authError || !user?.id) throw new Error("Invalid session.");

  const { data: profile, error: profileError } = await supabaseAdmin!
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  const role = cleanLower(profile?.role);
  if (!["admin", "sub_admin"].includes(role)) {
    throw new Error("Admin access required.");
  }

  return user;
}

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Missing Supabase envs" }, { status: 500 });
    }

    await requireAdminUser(req);

    const formData = await req.formData();
    const slug = clean(formData.get("slug"));
    const file = formData.get("file");

    if (!slug || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Missing page slug or file." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const filePath = `cms/${slug}/${Date.now()}-${safeFileName(file.name)}`;

    const uploadOnce = async () =>
      supabaseAdmin!.storage
        .from(ATTACH_BUCKET)
        .upload(filePath, arrayBuffer, {
          upsert: false,
          contentType: clean(file.type) || "application/octet-stream",
        });

    let { error: uploadError } = await uploadOnce();
    if (uploadError && isMissingBucketError(uploadError)) {
      await ensureAttachmentBucket();
      ({ error: uploadError } = await uploadOnce());
    }

    if (uploadError) {
      throw uploadError;
    }

    return NextResponse.json({
      ok: true,
      attachment: {
        bucket: ATTACH_BUCKET,
        path: filePath,
        name: safeFileName(file.name),
        contentType: clean(file.type) || "application/octet-stream",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unable to upload attachment." },
      { status: 500 }
    );
  }
}

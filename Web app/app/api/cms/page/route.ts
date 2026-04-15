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

function normalizeSlug(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function loadCmsMeta(slug: string) {
  try {
    const { data, error } = await supabaseAdmin!
      .from("system_settings")
      .select("value_json")
      .eq("key", "cms_page_meta")
      .maybeSingle();

    if (error) return {};
    const valueJson = data?.value_json && typeof data.value_json === "object" ? data.value_json : {};
    return valueJson?.[slug] && typeof valueJson[slug] === "object" ? valueJson[slug] : {};
  } catch {
    return {};
  }
}

export async function GET(req: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Missing Supabase envs" }, { status: 500 });
    }

    const url = new URL(req.url);
    const slug = normalizeSlug(url.searchParams.get("slug"));
    if (!slug) {
      return NextResponse.json({ ok: false, error: "Missing page slug." }, { status: 400 });
    }

    const { data: page, error } = await supabaseAdmin!
      .from("cms_pages")
      .select("id, slug, title, content, is_enabled")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    if (!page) {
      return NextResponse.json({ ok: false, error: "Page not found." }, { status: 404 });
    }

    const meta = await loadCmsMeta(slug);
    let attachmentUrl = "";

    if (clean(meta?.attachmentBucket) && clean(meta?.attachmentPath)) {
      const { data: signed } = await supabaseAdmin!.storage
        .from(clean(meta.attachmentBucket))
        .createSignedUrl(clean(meta.attachmentPath), 60 * 60);
      attachmentUrl = clean(signed?.signedUrl);
    }

    return NextResponse.json({
      ok: true,
      page: {
        id: page.id,
        slug: clean(page.slug),
        title: clean(page.title),
        content: clean(page.content),
        isEnabled: page.is_enabled !== false,
        contractRequired: Boolean(meta?.contractRequired),
        contractCheckboxLabel: clean(meta?.contractCheckboxLabel) || "I agree to the driver contract.",
        attachmentName: clean(meta?.attachmentName),
        attachmentUrl,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unable to load CMS page." },
      { status: 500 }
    );
  }
}

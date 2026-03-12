"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";

function detectMediaKind(url: string) {
  const u = (url || "").trim().toLowerCase();
  if (!u) return "unknown";
  if (u.endsWith(".mp4") || u.endsWith(".webm") || u.includes(".mp4?") || u.includes(".webm?")) return "video";
  if (
    u.endsWith(".jpg") ||
    u.endsWith(".jpeg") ||
    u.endsWith(".png") ||
    u.endsWith(".webp") ||
    u.includes(".jpg?") ||
    u.includes(".png?") ||
    u.includes(".webp?")
  )
    return "image";
  return "unknown";
}

const HOME_BANNER_BUCKET = "home-banners";

function safeExtFromFile(file: File) {
  const name = file?.name || "";
  const idx = name.lastIndexOf(".");
  const ext = idx >= 0 ? name.slice(idx + 1).trim().toLowerCase() : "";
  const allowed = ["jpg", "jpeg", "png", "webp", "gif", "mp4", "webm", "mov", "m4v"];
  if (allowed.includes(ext)) return ext;
  const mime = (file?.type || "").toLowerCase();
  if (mime.includes("image/")) return "png";
  if (mime.includes("video/")) return "mp4";
  return "bin";
}

function makeStoragePath(kind: "media" | "poster", file: File) {
  const ext = safeExtFromFile(file);
  const stamp = Date.now();
  const rand = Math.random().toString(16).slice(2);
  return `home/${kind}/${stamp}-${rand}.${ext}`;
}

type HomeBannerRow = {
  id: string;
  media_url: string | null;
  media_type: "auto" | "video" | "image" | string | null;
  poster_url: string | null;
  is_enabled: boolean | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export default function AdminHomeBannerPage() {
  const [bannerLoading, setBannerLoading] = useState(false);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [bannerError, setBannerError] = useState<string>("");
  const [banners, setBanners] = useState<HomeBannerRow[]>([]);
  const [bannerId, setBannerId] = useState<string>("");
  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [mediaType, setMediaType] = useState<"auto" | "video" | "image">("auto");
  const [posterUrl, setPosterUrl] = useState<string>("");
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadingPoster, setUploadingPoster] = useState(false);

  const effectiveKind = useMemo(() => {
    if (mediaType === "video") return "video";
    if (mediaType === "image") return "image";
    return detectMediaKind(mediaUrl);
  }, [mediaType, mediaUrl]);

  function resetBannerFormForNew() {
    setBannerId("");
    setMediaUrl("");
    setMediaType("auto");
    setPosterUrl("");
    setIsEnabled(true);
  }

  function loadBannerIntoForm(row: HomeBannerRow) {
    setBannerId(String(row?.id || ""));
    setMediaUrl(String(row?.media_url || ""));
    const mt = row?.media_type;
    setMediaType(mt === "video" || mt === "image" || mt === "auto" ? mt : "auto");
    setPosterUrl(String(row?.poster_url || ""));
    setIsEnabled(Boolean(row?.is_enabled));
  }

  async function loadHomeBanners(selectId?: string) {
    setBannerLoading(true);
    setBannerError("");
    try {
      const { data, error } = await supabase
        .from("home_banners")
        .select("id, media_url, media_type, poster_url, is_enabled, updated_at, created_at")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        setBannerError(`Home banners load failed: ${error.message}`);
        return;
      }

      const rows: HomeBannerRow[] = Array.isArray(data) ? (data as any) : [];
      setBanners(rows);

      const desiredId = selectId || bannerId;
      const pick = (desiredId && rows.find((r) => String(r.id) === String(desiredId))) || (rows.length ? rows[0] : null);

      if (pick) loadBannerIntoForm(pick);
      else resetBannerFormForNew();
    } finally {
      setBannerLoading(false);
    }
  }

  async function saveHomeBanner() {
    setBannerSaving(true);
    setBannerError("");
    try {
      const payload: any = {
        media_url: (mediaUrl || "").trim() || null,
        media_type: mediaType || "auto",
        poster_url: (posterUrl || "").trim() || null,
        is_enabled: Boolean(isEnabled),
      };

      if (bannerId) {
        const { error } = await supabase.from("home_banners").update(payload).eq("id", bannerId);
        if (error) {
          setBannerError(`Save failed: ${error.message}`);
          return;
        }
        await loadHomeBanners(bannerId);
      } else {
        const { data, error } = await supabase.from("home_banners").insert(payload).select("id").limit(1);
        if (error) {
          setBannerError(`Insert failed: ${error.message}`);
          return;
        }
        const newId = Array.isArray(data) && data[0]?.id ? String(data[0].id) : "";
        await loadHomeBanners(newId || undefined);
      }
    } finally {
      setBannerSaving(false);
    }
  }

  async function deleteHomeBanner(id: string) {
    if (!id) return;
    const ok = window.confirm("Delete this banner item? This cannot be undone.");
    if (!ok) return;

    setBannerSaving(true);
    setBannerError("");
    try {
      const { error } = await supabase.from("home_banners").delete().eq("id", id);
      if (error) {
        setBannerError(`Delete failed: ${error.message}`);
        return;
      }
      const nextId = bannerId === id ? undefined : bannerId;
      await loadHomeBanners(nextId);
    } finally {
      setBannerSaving(false);
    }
  }

  async function uploadToBannerBucket(kind: "media" | "poster", file: File) {
    if (!file) return null;
    setBannerError("");
    const path = makeStoragePath(kind, file);
    const bucket = supabase.storage.from(HOME_BANNER_BUCKET);

    const { error: upErr } = await bucket.upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
      cacheControl: "3600",
    });

    if (upErr) {
      setBannerError(
        `Upload failed: ${upErr.message}. (Check Storage bucket "${HOME_BANNER_BUCKET}" exists and you have permission. If bucket is private, make it public OR we will do signed URLs in next task.)`
      );
      return null;
    }

    const { data } = bucket.getPublicUrl(path);
    const publicUrl = data?.publicUrl || "";

    if (!publicUrl) {
      setBannerError(
        `Upload succeeded, but couldn't generate public URL. Make bucket "${HOME_BANNER_BUCKET}" public, or we will switch to signed URLs (next task).`
      );
      return null;
    }

    return publicUrl;
  }

  async function handlePickMediaFile(file: File | null) {
    if (!file) return;
    setUploadingMedia(true);
    try {
      const url = await uploadToBannerBucket("media", file);
      if (!url) return;
      setMediaUrl(url);
      if (mediaType === "auto") {
        const mt = (file.type || "").toLowerCase();
        if (mt.startsWith("video/")) setMediaType("video");
        else if (mt.startsWith("image/")) setMediaType("image");
      }
    } finally {
      setUploadingMedia(false);
    }
  }

  async function handlePickPosterFile(file: File | null) {
    if (!file) return;
    setUploadingPoster(true);
    try {
      const url = await uploadToBannerBucket("poster", file);
      if (!url) return;
      setPosterUrl(url);
    } finally {
      setUploadingPoster(false);
    }
  }

  useEffect(() => {
    loadHomeBanners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const card: React.CSSProperties = {
    padding: 16,
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid rgba(15, 23, 42, 0.10)",
    boxShadow: "0 14px 36px rgba(15, 23, 42, 0.08)",
  };

  const btnPrimary: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 14,
    background: "linear-gradient(135deg, rgba(255,140,0,1), rgba(255,220,160,0.95))",
    border: "1px solid rgba(255,140,0,0.35)",
    color: "#0B1220",
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 14px 36px rgba(255,140,0,0.14)",
  };

  const btnGhost: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.85)",
    border: "1px solid rgba(15, 23, 42, 0.12)",
    color: "#0B1220",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 10px 26px rgba(15,23,42,0.06)",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  };

  const pill: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(15, 23, 42, 0.10)",
    fontSize: 12,
    fontWeight: 900,
    opacity: 0.9,
    height: "fit-content",
    boxShadow: "0 10px 26px rgba(15,23,42,0.06)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.12)",
    outline: "none",
    background: "rgba(255,255,255,0.95)",
    fontWeight: 700,
  };

  const select: React.CSSProperties = {
    ...input,
    cursor: "pointer",
  };

  const smallLabel: React.CSSProperties = { fontSize: 12, fontWeight: 900, opacity: 0.75, marginBottom: 6 };
  const selectedId = bannerId;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: -0.3 }}>Home Banner</div>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4, lineHeight: 1.5 }}>
            Controls the big homepage banner. Table: <b>public.home_banners</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link href="/admin" style={btnGhost}>
            ← Back to Dashboard
          </Link>

          <button onClick={() => loadHomeBanners()} style={btnGhost}>
            {bannerLoading ? "Loading..." : `Reload (${banners.length})`}
          </button>

          <button onClick={() => resetBannerFormForNew()} style={btnGhost} disabled={bannerSaving || bannerLoading}>
            ➕ Add New
          </button>

          <button onClick={saveHomeBanner} style={btnPrimary} disabled={bannerSaving}>
            {bannerSaving ? "Saving..." : bannerId ? "Save Changes" : "Save New Banner"}
          </button>

          <div
            style={{
              ...pill,
              background: isEnabled ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)",
            }}
          >
            {isEnabled ? "Enabled ✅" : "Disabled ❌"}
          </div>

          {bannerId ? (
            <button
              onClick={() => deleteHomeBanner(bannerId)}
              style={{ ...btnGhost, border: "1px solid rgba(239,68,68,0.22)", background: "rgba(239,68,68,0.08)" }}
              disabled={bannerSaving}
            >
              🗑️ Delete
            </button>
          ) : null}
        </div>
      </div>

      <div style={{ ...card, display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 14 }}>
        <div
          style={{
            borderRadius: 18,
            border: "1px solid rgba(15,23,42,0.10)",
            background: "rgba(255,255,255,0.70)",
            boxShadow: "0 14px 36px rgba(15, 23, 42, 0.06)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 12, borderBottom: "1px solid rgba(15,23,42,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.9 }}>Banner Items</div>
          </div>

          <div style={{ maxHeight: 340, overflow: "auto" }}>
            {banners.length === 0 ? (
              <div style={{ padding: 12, fontSize: 12, opacity: 0.75, fontWeight: 850 }}>No banner items yet.</div>
            ) : (
              banners.map((b) => {
                const id = String(b.id || "");
                const url = String(b.media_url || "");
                const kind = detectMediaKind(url);
                const enabled = Boolean(b.is_enabled);
                const isSel = selectedId && id === String(selectedId);

                return (
                  <button
                    key={id}
                    onClick={() => loadBannerIntoForm(b)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: 12,
                      border: "none",
                      borderBottom: "1px solid rgba(15,23,42,0.06)",
                      background: isSel ? "rgba(255,140,0,0.10)" : "transparent",
                      cursor: "pointer",
                    }}
                    title={id}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 950, color: "#0F172A" }}>
                        {kind === "video" ? "🎬 Video" : kind === "image" ? "🖼️ Image" : "📎 Media"} • {enabled ? "Enabled" : "Disabled"}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.65, fontWeight: 900 }}>{b.updated_at ? new Date(b.updated_at).toLocaleDateString() : ""}</div>
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6, wordBreak: "break-all", fontWeight: 800 }}>{url ? url : "(no media url)"}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.85 }}>Editing: {bannerId ? `Existing banner (${bannerId.slice(0, 8)}…)` : "New banner (not saved yet)"}</div>
              <button onClick={() => resetBannerFormForNew()} style={{ ...btnGhost, padding: "8px 10px" }} disabled={bannerSaving}>
                Clear Form
              </button>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={smallLabel}>Media URL (video or image)</div>
              <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://..." style={input} />
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={smallLabel}>Or Upload Media File (image/video)</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => handlePickMediaFile(e.target.files?.[0] || null)}
                  style={{ ...input, padding: "8px 10px", cursor: "pointer" }}
                  disabled={uploadingMedia || bannerSaving}
                />
                <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 850 }}>{uploadingMedia ? "Uploading media…" : "Tip: Keep videos ~10–15MB for fast load."}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <div>
                <div style={smallLabel}>Media Type</div>
                <select value={mediaType} onChange={(e) => setMediaType(e.target.value as any)} style={select}>
                  <option value="auto">Auto detect</option>
                  <option value="video">Video</option>
                  <option value="image">Image</option>
                </select>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                  Detected: <b>{effectiveKind}</b>
                </div>
              </div>

              <div>
                <div style={smallLabel}>Enabled</div>
                <button
                  onClick={() => setIsEnabled((v) => !v)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(15,23,42,0.12)",
                    background: isEnabled ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)",
                    fontWeight: 950,
                    cursor: "pointer",
                  }}
                >
                  {isEnabled ? "Enabled ✅" : "Disabled ❌"}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={smallLabel}>Poster URL (optional for video)</div>
              <input value={posterUrl} onChange={(e) => setPosterUrl(e.target.value)} placeholder="https://..." style={input} />
              <div style={{ marginTop: 10 }}>
                <div style={smallLabel}>Or Upload Poster Image (optional)</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handlePickPosterFile(e.target.files?.[0] || null)}
                    style={{ ...input, padding: "8px 10px", cursor: "pointer" }}
                    disabled={uploadingPoster || bannerSaving}
                  />
                  <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 850 }}>{uploadingPoster ? "Uploading poster…" : "Poster used only when banner is video."}</div>
                </div>
              </div>
            </div>

            {bannerError ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 14,
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.20)",
                  color: "#7F1D1D",
                  fontSize: 12,
                  fontWeight: 850,
                  lineHeight: 1.5,
                }}
              >
                {bannerError}
              </div>
            ) : null}
          </div>

          <div
            style={{
              borderRadius: 18,
              border: "1px solid rgba(15,23,42,0.10)",
              background: "rgba(255,255,255,0.70)",
              boxShadow: "0 14px 36px rgba(15, 23, 42, 0.06)",
              overflow: "hidden",
              minHeight: 240,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            {!mediaUrl ? (
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Paste a Media URL to preview</div>
            ) : effectiveKind === "video" ? (
              <video src={mediaUrl} poster={posterUrl || undefined} muted loop playsInline controls style={{ width: "100%", height: 260, objectFit: "cover" }} />
            ) : (
              <img src={mediaUrl} alt="banner preview" style={{ width: "100%", height: 260, objectFit: "cover" }} />
            )}

            <div style={{ position: "absolute", bottom: 10, left: 10, fontSize: 11, opacity: 0.75, fontWeight: 900 }}>Admin preview • Select item on left to edit</div>
          </div>
        </div>
      </div>
    </div>
  );
}

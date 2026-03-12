export const REVIEWABLE_STATUSES = ["delivered", "completed", "complete", "fulfilled"];

export function normalizeReviewText(value) {
  return String(value || "").trim();
}

export function normalizeReviewStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function isReviewableStatus(status) {
  return REVIEWABLE_STATUSES.includes(normalizeReviewStatus(status));
}

export function summarizeReviews(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const count = list.length;
  const avg = count ? list.reduce((sum, row) => sum + Number(row?.rating || 0), 0) / count : 0;
  return {
    count,
    average: avg,
    averageText: count ? avg.toFixed(1) : "0.0",
  };
}

async function loadProfiles(supabase, userIds) {
  const ids = Array.from(new Set((userIds || []).filter(Boolean)));
  if (!ids.length) return {};

  const profileSelect = "user_id, full_name, name, display_name, username, first_name, last_name, avatar_url, photo_url, profile_photo, image_url";

  try {
    const primary = await supabase.from("profiles").select(profileSelect).in("user_id", ids);

    if (!primary.error) {
      const map = {};
      for (const row of primary.data || []) {
        if (row?.user_id) map[row.user_id] = row;
      }
      return map;
    }

    // Fallback for schemas where profiles uses "id" as the auth user key.
    const fallback = await supabase.from("profiles").select(`id, ${profileSelect}`).in("id", ids);
    if (fallback.error) return {};

    const map = {};
    for (const row of fallback.data || []) {
      const key = row?.user_id || row?.id;
      if (key) map[key] = row;
    }
    return map;
  } catch {
    return {};
  }
}

function mergeReviewProfiles(rows, profileMap) {
  return (rows || []).map((row) => {
    const profile = profileMap?.[row.user_id] || {};
    return {
      ...row,
      reviewer_name:
        profile.full_name ||
        profile.display_name ||
        profile.name ||
        [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
        profile.username ||
        "Customer",
      reviewer_avatar:
        profile.avatar_url ||
        profile.photo_url ||
        profile.profile_photo ||
        profile.image_url ||
        "",
    };
  });
}

export async function fetchReviewsByTarget(supabase, { targetType, targetId }) {
  if (!targetType || !targetId) return [];

  const { data, error } = await supabase
    .from("reviews")
    .select("id, user_id, order_id, target_type, target_id, rating, title, comment, created_at, updated_at, is_visible")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("is_visible", true)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const profiles = await loadProfiles(supabase, rows.map((row) => row.user_id));
  return mergeReviewProfiles(rows, profiles);
}

export async function fetchReviewsByOrderIds(supabase, { userId, orderIds }) {
  const ids = Array.from(new Set((orderIds || []).filter(Boolean)));
  if (!userId || !ids.length) return [];

  const { data, error } = await supabase
    .from("reviews")
    .select("id, user_id, order_id, target_type, target_id, rating, title, comment, created_at, updated_at, is_visible")
    .eq("user_id", userId)
    .in("order_id", ids)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

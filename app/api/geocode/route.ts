import { NextResponse } from "next/server";

export const runtime = "nodejs"; // safest for server fetch

function clean(s: any) {
  return String(s ?? "").trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const q = clean(body?.q);

    if (!q) {
      return NextResponse.json({ ok: false, error: "Missing address query" }, { status: 400 });
    }

    // ✅ OpenStreetMap Nominatim (free)
    // IMPORTANT: Nominatim requires a valid User-Agent / Referer policy.
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        // Put your brand/app name here
        "User-Agent": "FoodApp-Geocoder/1.0 (support@yourdomain.com)",
        "Accept": "application/json",
      },
      // no-store so it always resolves fresh (you can cache later)
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Geocode failed (${res.status})` },
        { status: 500 }
      );
    }

    const data: any[] = await res.json();
    const first = Array.isArray(data) ? data[0] : null;

    if (!first?.lat || !first?.lon) {
      return NextResponse.json({ ok: false, error: "Address not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      lat: Number(first.lat),
      lng: Number(first.lon),
      display_name: first.display_name || "",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}

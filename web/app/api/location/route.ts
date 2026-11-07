import { NextRequest, NextResponse } from "next/server";
import { insideNetherlands, parseCoordinate } from "@/lib/geo";
import { rateAllowed } from "@/lib/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PDOK = "https://api.pdok.nl/bzk/locatieserver/search/v3_1";
type PdokDoc = { weergavenaam?: string; type?: string; centroide_ll?: string; postcode?: string; woonplaatsnaam?: string; provincienaam?: string };

function point(value: string | undefined): { lat: number; lon: number } | null {
  const match = String(value || "").match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
  return match ? { lat: Number(match[2]), lon: Number(match[1]) } : null;
}

/**
 * Dutch geocoding through PDOK Locatieserver (public Dutch government service, no key).
 * GET ?q=Utrecht | ?q=3511 | ?q=3511KE  -> suggestions
 * GET ?lat=52.09&lon=5.12               -> nearest postcode / place (reverse)
 */
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!rateAllowed("location:" + ip, 30)) return NextResponse.json({ error: "Слишком много запросов локации." }, { status: 429 });
  const params = request.nextUrl.searchParams;
  const lat = parseCoordinate(params.get("lat"), -90, 90);
  const lon = parseCoordinate(params.get("lon"), -180, 180);
  try {
    if (lat !== null && lon !== null) {
      if (!insideNetherlands(lat, lon)) {
        return NextResponse.json({ error: "Похоже, вы за пределами Нидерландов. Укажите город или индекс вручную." }, { status: 422 });
      }
      const url = PDOK + "/reverse?" + new URLSearchParams({ lat: String(lat), lon: String(lon), type: "postcode", rows: "1", fl: "weergavenaam,postcode,woonplaatsnaam,centroide_ll" });
      const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (!response.ok) throw new Error("PDOK HTTP " + response.status);
      const doc = ((await response.json()) as { response?: { docs?: PdokDoc[] } }).response?.docs?.[0];
      if (!doc) return NextResponse.json({ error: "Не удалось определить адрес по координатам." }, { status: 404 });
      // Keep the user's own coordinates; the postcode is used for Marktplaats radius search.
      return NextResponse.json({ location: { label: [doc.postcode, doc.woonplaatsnaam].filter(Boolean).join(" "), city: doc.woonplaatsnaam || "", postcode: doc.postcode || null, lat, lon, source: "gps" } });
    }
    const query = String(params.get("q") || "").trim().slice(0, 80);
    if (query.length < 2) return NextResponse.json({ error: "Введите город или почтовый индекс." }, { status: 400 });
    const isPostcode = /^\d{4}\s?[a-z]{0,2}$/i.test(query);
    const url = PDOK + "/free?" + new URLSearchParams({
      q: isPostcode ? query.replace(/\s/g, "").toUpperCase() : query,
      // A postcode query must only match postcodes ("3511" otherwise also matches place ids).
      fq: isPostcode ? "type:postcode" : "type:(woonplaats OR postcode)",
      rows: "6",
      fl: "weergavenaam,type,centroide_ll,postcode,woonplaatsnaam,provincienaam",
    });
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!response.ok) throw new Error("PDOK HTTP " + response.status);
    const docs = ((await response.json()) as { response?: { docs?: PdokDoc[] } }).response?.docs || [];
    const suggestions = docs.flatMap((doc) => {
      const coordinates = point(doc.centroide_ll);
      if (!coordinates) return [];
      return [{
        label: doc.weergavenaam || "",
        city: doc.woonplaatsnaam || (doc.type === "woonplaats" ? String(doc.weergavenaam || "").split(",")[0] : ""),
        postcode: doc.postcode || null,
        province: doc.provincienaam || null,
        type: doc.type || "",
        ...coordinates,
        source: "manual" as const,
      }];
    });
    return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  } catch (error) {
    console.error("location lookup failed:", error);
    return NextResponse.json({ error: "Сервис геокодирования PDOK временно недоступен." }, { status: 502 });
  }
}

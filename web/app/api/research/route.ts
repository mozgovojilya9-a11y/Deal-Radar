import { NextRequest, NextResponse } from "next/server";
import { resaleEconomics, PROFITABILITY } from "@/lib/economics";
import { researchMarket } from "@/lib/market-research";
import { rateAllowed, verifyInitData } from "@/lib/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

/**
 * Manual product research: real Marktplaats/2dehands listings (with the user's postcode and
 * radius), Dutch retail pages and refurbished shops, each kept in its own segment.
 */
export async function POST(request: NextRequest) {
  const token = process.env.TELEGRAM_TOKEN;
  if (!token) return NextResponse.json({ error: "TELEGRAM_TOKEN не настроен." }, { status: 503, headers: HEADERS });
  let body: {
    initData?: string; query?: string; maxPrice?: number | null; minPrice?: number | null;
    includeUsed?: boolean; includeNew?: boolean; includeRefurbished?: boolean;
    postcode?: string | null; radiusKm?: number | null;
  };
  try { body = await request.json() as typeof body; }
  catch { return NextResponse.json({ error: "Некорректный JSON." }, { status: 400, headers: HEADERS }); }
  const userId = verifyInitData(body.initData || "", token);
  if (!userId) return NextResponse.json({ error: "Откройте исследование внутри Telegram." }, { status: 401, headers: HEADERS });
  if (!rateAllowed("research:" + userId, 5)) return NextResponse.json({ error: "Лимит исследований: не более 5 запусков в минуту." }, { status: 429, headers: HEADERS });

  const query = String(body.query || "").trim().replace(/\s+/g, " ");
  if (query.length < 3 || query.length > 120) return NextResponse.json({ error: "Укажите модель (от 3 до 120 символов)." }, { status: 400, headers: HEADERS });
  const includeUsed = body.includeUsed !== false;
  const includeNew = body.includeNew !== false;
  const includeRefurbished = body.includeRefurbished !== false;
  if (!includeUsed && !includeNew && !includeRefurbished) {
    return NextResponse.json({ error: "Выбери хотя бы один источник: б/у, новые или восстановленные." }, { status: 400, headers: HEADERS });
  }
  const maxPrice = Number.isFinite(Number(body.maxPrice)) && Number(body.maxPrice) > 0 ? Number(body.maxPrice) : null;
  const minPrice = Number.isFinite(Number(body.minPrice)) && Number(body.minPrice) > 0 ? Number(body.minPrice) : null;
  const postcode = typeof body.postcode === "string" && /^\d{4}\s?[A-Z]{2}$/i.test(body.postcode.trim()) ? body.postcode.trim().toUpperCase().replace(/\s/g, "") : null;
  const radiusKm = Number.isFinite(Number(body.radiusKm)) && Number(body.radiusKm) > 0 ? Math.min(400, Number(body.radiusKm)) : null;

  try {
    const research = await researchMarket(query, {
      includeNew, includeUsed, includeRefurbished, maxPrice,
      location: postcode && radiusKm ? { postcode, distanceKm: radiusKm } : undefined,
      budgetMs: 45000,
    });
    const used = research.segments.used;
    const newSeg = research.segments.new;
    const basis = used.count >= 5 ? used.p25 : used.count >= 3 ? used.median : null;
    const basisIsNew = basis === null && newSeg.count >= 2;
    const resaleBasis = basis ?? (basisIsNew ? newSeg.median : null);
    // Listings the user could buy: Marktplaats offers inside the requested price range.
    const listings = research.offers
      .filter((offer) => offer.segment === "used" && offer.method === "api")
      .filter((offer) => (maxPrice === null || offer.price <= maxPrice) && (minPrice === null || offer.price >= minPrice))
      .map((offer) => {
        const economics = resaleBasis ? resaleEconomics(offer.price, resaleBasis, basisIsNew) : null;
        const status = economics && used.count >= 8 && economics.profit >= 50 && economics.roi >= PROFITABILITY.strong_min_roi ? "strong"
          : economics && used.count >= 3 && economics.profit >= PROFITABILITY.min_profit_eur && economics.roi >= PROFITABILITY.min_roi ? "good" : "candidate";
        return { ...offer, estimatedProfit: economics?.profit ?? null, profitRoi: economics?.roi ?? null, status };
      })
      .sort((a, b) => (b.estimatedProfit ?? -Infinity) - (a.estimatedProfit ?? -Infinity));
    const warnings = [
      ...(used.count < 3 && includeUsed ? ["Мало точных б/у предложений — прибыль не подтверждена."] : []),
      ...(research.providersUsed.length === 0 ? ["Все поисковые системы сейчас ограничили запросы; использованы Marktplaats, 2dehands и прямой поиск магазинов."] : []),
      ...(research.rejected.variants ? [research.rejected.variants + " предложений другой версии/комплектации не смешаны с этой моделью."] : []),
      "Цены объявлений — цены предложений, а не завершённых сделок.",
    ];
    return NextResponse.json({
      query, identity: { searchName: research.identity.searchName, aliases: research.identity.aliases, modelCodes: research.identity.modelCodes },
      checkedAt: research.checkedAt, durationMs: research.durationMs,
      location: postcode && radiusKm ? { postcode, radiusKm } : null,
      segments: research.segments,
      resale: resaleBasis ? { basis: resaleBasis, basisLabel: basis !== null ? (used.count >= 5 ? "нижний квартиль б/у" : "медиана б/у") : "новая цена × " + PROFITABILITY.new_resale_factor } : null,
      listings: listings.slice(0, 30),
      offers: research.offers.filter((offer) => offer.method !== "api").slice(0, 30),
      rejected: research.rejected, variantExamples: research.variantExamples,
      search: { queries: research.queries, providers: research.providersUsed, pagesFetched: research.pagesFetched, pagesWithPrices: research.pagesWithPrices,
        failedProviders: [...new Set(research.attempts.filter((attempt) => !attempt.ok).map((attempt) => attempt.provider))].filter((name) => !research.providersUsed.includes(name)) },
      warnings,
    }, { headers: HEADERS });
  } catch (error) {
    console.error("Deal Radar research failed:", error);
    return NextResponse.json({ error: "Исследование не удалось. Попробуй ещё раз." }, { status: 502, headers: HEADERS });
  }
}

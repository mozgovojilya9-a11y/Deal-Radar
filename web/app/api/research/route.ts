import { NextRequest, NextResponse } from "next/server";
import { offerLimits, resaleEconomics, PROFITABILITY } from "@/lib/economics";
import { researchMarket } from "@/lib/market-research";
import { understandQuery } from "@/lib/query-understanding";
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

  const rawQuery = String(body.query || "").trim().replace(/\s+/g, " ");
  // Russian product words, typos and spacing -> a clean model query.
  const understood = understandQuery(rawQuery);
  const query = understood.query;
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
      // Up to 5 Marktplaats pages (500 listings) instead of the first 100.
      marketplacePages: Number.isFinite(Number((body as { pages?: number }).pages)) ? Math.max(1, Math.min(10, Number((body as { pages?: number }).pages))) : 5,
    });
    // Market value: independent sources only. Marktplaats offers are the things you can buy.
    const valuation = research.valuation;
    const newSeg = research.segments.new;
    const basisIsNew = valuation.marketValue === null && newSeg.count >= 2 && new Set(newSeg.domains).size >= 2;
    const resaleBasis = valuation.conservativeValue ?? (basisIsNew ? newSeg.median : null);
    const priced = research.marketplace.offers
      .filter((offer) => (maxPrice === null || offer.price <= maxPrice) && (minPrice === null || offer.price >= minPrice))
      .map((offer) => {
        const economics = resaleBasis ? resaleEconomics(offer.price, resaleBasis, basisIsNew) : null;
        // Far below the independent market value: fakes, parts or scams are flagged, never "deals".
        const suspicious = valuation.marketValue !== null && offer.price < valuation.marketValue * 0.4;
        const status = suspicious ? "suspicious"
          : economics && valuation.confidence === "high" && economics.profit >= 50 && economics.roi >= PROFITABILITY.strong_min_roi ? "strong"
          : economics && valuation.confidence !== "none" && economics.profit >= PROFITABILITY.min_profit_eur && economics.roi >= PROFITABILITY.min_roi ? "good" : "candidate";
        const limits = economics && !suspicious && (status === "strong" || status === "good") ? offerLimits(offer.price, economics.netSale) : null;
        return { ...offer, maxOffer: limits?.maxOffer ?? null, openingOffer: limits?.openingOffer ?? null, estimatedProfit: suspicious ? null : economics?.profit ?? null, profitRoi: suspicious ? null : economics?.roi ?? null, status,
          warning: suspicious ? "Цена в " + (valuation.marketValue! / offer.price).toFixed(1) + " раза ниже рынка — вероятна подделка или мошенничество" : null };
      })
      .sort((a, b) => Number(a.status === "suspicious") - Number(b.status === "suspicious") || (b.estimatedProfit ?? -Infinity) - (a.estimatedProfit ?? -Infinity));
    // With a known market value only profitable offers stay; without one nothing can be judged, so all are listed.
    const listings = resaleBasis ? priced.filter((offer) => offer.status === "strong" || offer.status === "good") : priced;
    const warnings = [
      ...(valuation.marketValue === null ? ["Рыночная стоимость не определена: " + valuation.reason + ". Цены Marktplaats как замена не используются."] : []),
      ...(research.providersUsed.length === 0 ? ["Все поисковые системы сейчас ограничили запросы; использованы Marktplaats, 2dehands и прямой поиск магазинов."] : []),
      ...(research.rejected.variants ? [research.rejected.variants + " предложений другой версии/комплектации не смешаны с этой моделью."] : []),
      ...(priced.length > listings.length ? ["Скрыто невыгодных или подозрительных объявлений: " + (priced.length - listings.length) + "."] : []),
      "Цены объявлений — цены предложений, а не завершённых сделок.",
    ];
    return NextResponse.json({
      query, originalQuery: rawQuery, corrections: understood.corrections, identity: { searchName: research.identity.searchName, aliases: research.identity.aliases, modelCodes: research.identity.modelCodes },
      checkedAt: research.checkedAt, durationMs: research.durationMs,
      location: postcode && radiusKm ? { postcode, radiusKm } : null,
      segments: research.segments,
      valuation,
      marketplace: research.marketplace.stats,
      resale: resaleBasis ? { basis: resaleBasis, basisLabel: basisIsNew ? "новая цена × " + PROFITABILITY.new_resale_factor : valuation.reason } : null,
      listings: listings.slice(0, 200),
      offers: research.offers.slice(0, 40),
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

import { PROFITABILITY } from "./economics";

const round2 = (value: number) => Math.round(value * 100) / 100;

export type ProfitStep = { key: "resale" | "negotiation" | "fees" | "fixed" | "asking"; label: string; hint: string; amount: number };

/** Net amount a resale brings after buyer negotiation, platform fee and fixed costs (scanner formula). */
function netSaleOf(expectedResale: number): number {
  const afterNegotiation = expectedResale * (1 - PROFITABILITY.buyer_negotiation_rate);
  return afterNegotiation * (1 - PROFITABILITY.selling_fee_rate) - PROFITABILITY.fixed_selling_cost_eur - PROFITABILITY.extra_cost_eur;
}

/**
 * The scanner's profit, step by step, starting from the expected resale price it published
 * (`expected_resale_price` already includes the resale factor). Mirrors `calculate_resale_economics` in bot.py.
 */
export function profitSteps(asking: number, expectedResale: number) {
  const negotiation = expectedResale * PROFITABILITY.buyer_negotiation_rate;
  const fees = (expectedResale - negotiation) * PROFITABILITY.selling_fee_rate;
  const fixed = PROFITABILITY.fixed_selling_cost_eur + PROFITABILITY.extra_cost_eur;
  const netSale = netSaleOf(expectedResale);
  const rows: ProfitStep[] = [
    { key: "resale", label: "Продажа после покупки", hint: "осторожная цена перепродажи", amount: round2(expectedResale) },
    { key: "negotiation", label: "Торг покупателя", hint: Math.round(PROFITABILITY.buyer_negotiation_rate * 100) + "% от цены", amount: -round2(negotiation) },
    { key: "fees", label: "Комиссия и доставка", hint: Math.round(PROFITABILITY.selling_fee_rate * 100) + "% после торга", amount: -round2(fees) },
    { key: "fixed", label: "Фиксированные расходы", hint: "упаковка, поездки", amount: -round2(fixed) },
    { key: "asking", label: "Покупка у продавца", hint: "цена объявления", amount: -round2(asking) },
  ];
  const { profit, roi } = profitAt(asking, expectedResale);
  return { rows, netSale: round2(netSale), profit, roi };
}

/** Profit and ROI if the item is bought for `paid` instead of the asking price. */
export function profitAt(paid: number, expectedResale: number): { profit: number; roi: number | null } {
  const profit = round2(netSaleOf(expectedResale) - paid);
  return { profit: profit === 0 ? 0 : profit, roi: paid > 0 ? Math.round((profit / paid) * 10000) / 10000 + 0 : null };
}

type Source = { price?: number | null; price_eur?: number | null; condition?: string | null };

/** Where the asking price sits among the independent used offers behind the valuation. */
export function pricePosition(price: number, sources: Source[]) {
  const prices = sources
    .filter((source) => source.condition === "used")
    .map((source) => Number(source.price ?? source.price_eur))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (prices.length < 3) return null;
  const middle = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
  const min = prices[0];
  const max = prices[prices.length - 1];
  const axisMin = Math.min(min, price);
  const axisMax = Math.max(max, price);
  const span = axisMax - axisMin || 1;
  return {
    count: prices.length, min, max, median, axisMin, axisMax, prices,
    cheaperThan: prices.filter((value) => value > price).length,
    at: (value: number) => (value - axisMin) / span,
  };
}

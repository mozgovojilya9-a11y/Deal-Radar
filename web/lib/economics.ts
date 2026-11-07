/**
 * Resale economics. Mirrors `profitability` in /config.json used by the Python scanner;
 * web/tests/economics.test.ts asserts both stay identical.
 */
export const PROFITABILITY = {
  market_resale_factor: 0.95,
  buyer_negotiation_rate: 0.04,
  selling_fee_rate: 0.08,
  fixed_selling_cost_eur: 10,
  extra_cost_eur: 0,
  min_profit_eur: 40,
  min_roi: 0.2,
  strong_min_roi: 0.3,
  new_resale_factor: 0.62,
} as const;

export type Economics = {
  resaleBasis: number;
  expectedResale: number;
  negotiation: number;
  fees: number;
  fixedCosts: number;
  netSale: number;
  profit: number;
  roi: number;
};

/** Profit after buyer negotiation, platform fee and fixed selling costs. */
export function resaleEconomics(askingPrice: number, resaleBasis: number, basisIsNewRetail = false): Economics {
  const factor = basisIsNewRetail ? PROFITABILITY.new_resale_factor : PROFITABILITY.market_resale_factor;
  const expectedResale = resaleBasis * factor;
  const negotiation = expectedResale * PROFITABILITY.buyer_negotiation_rate;
  const afterNegotiation = expectedResale - negotiation;
  const fees = afterNegotiation * PROFITABILITY.selling_fee_rate;
  const fixedCosts = PROFITABILITY.fixed_selling_cost_eur + PROFITABILITY.extra_cost_eur;
  const netSale = afterNegotiation - fees - PROFITABILITY.fixed_selling_cost_eur;
  const profit = netSale - askingPrice - PROFITABILITY.extra_cost_eur;
  const invested = askingPrice + PROFITABILITY.extra_cost_eur;
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    resaleBasis: round(resaleBasis),
    expectedResale: round(expectedResale),
    negotiation: round(negotiation),
    fees: round(fees),
    fixedCosts: round(fixedCosts),
    netSale: round(netSale),
    profit: round(profit),
    roi: invested > 0 ? Math.round((profit / invested) * 10000) / 10000 : -1,
  };
}

/** Shops a user can name in a question, with the domains that count as that shop. */
export const SHOPS: Array<{ name: string; pattern: RegExp; domains: string[] }> = [
  { name: "Amazon", pattern: /amazon|амазон/i, domains: ["amazon.nl", "amazon.de", "amazon.com.be", "amazon.fr"] },
  { name: "bol.com", pattern: /\bbol(?:\.com)?\b|бол/i, domains: ["bol.com"] },
  { name: "Coolblue", pattern: /coolblue|кулблю/i, domains: ["coolblue.nl", "coolblue.be"] },
  { name: "MediaMarkt", pattern: /media\s*markt|медиамаркт/i, domains: ["mediamarkt.nl", "mediamarkt.be"] },
  { name: "eBay", pattern: /\bebay|ебей|ибей/i, domains: ["ebay.nl", "ebay.de", "ebay.com", "ebay.fr", "ebay.be"] },
  { name: "Back Market", pattern: /back\s*market|бэк\s*маркет/i, domains: ["backmarket.nl", "backmarket.de", "backmarket.be"] },
  { name: "Refurbed", pattern: /refurbed/i, domains: ["refurbed.nl", "refurbed.de"] },
  { name: "Kleinanzeigen", pattern: /kleinanzeigen/i, domains: ["kleinanzeigen.de"] },
  { name: "Tweakers", pattern: /tweakers/i, domains: ["tweakers.net"] },
  { name: "Apple", pattern: /\bapple\.com|apple store|эпл стор/i, domains: ["apple.com"] },
];

export function requestedShops(question: string) {
  return SHOPS.filter((shop) => shop.pattern.test(question));
}

export function domainMatchesShop(domain: string, shop: { domains: string[] }): boolean {
  const host = domain.toLowerCase().replace(/^www\./, "");
  return shop.domains.some((item) => host === item || host.endsWith("." + item));
}

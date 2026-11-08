"""Offline stand-in for web/scripts/market-cli.ts (same result contract, no network)."""
import statistics


def _percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower, upper = int(position), min(int(position) + 1, len(ordered) - 1)
    return round(ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower), 2)


def external_result(key, used=(), new=(), used_domains=("kleinanzeigen.de", "backmarket.nl"), new_domains=("coolblue.nl", "bol.com")):
    used, new = list(used), list(new)
    offers = [{"title": "Independent used offer", "price": price, "url": f"https://{used_domains[i % len(used_domains)]}/u{i}",
               "domain": used_domains[i % len(used_domains)], "segment": "used", "method": "jsonld", "official": False}
              for i, price in enumerate(used)]
    offers += [{"title": "Shop offer", "price": price, "url": f"https://{new_domains[i % len(new_domains)]}/n{i}",
                "domain": new_domains[i % len(new_domains)], "segment": "new", "method": "jsonld", "official": False}
               for i, price in enumerate(new)]
    domains = {offer["domain"] for offer in offers if offer["segment"] == "used"}
    median = _percentile(used, 0.5)
    spread = None
    if len(used) >= 4 and median:
        spread = round((_percentile(used, 0.75) - _percentile(used, 0.25)) / median, 3)
    if len(used) >= 6 and len(domains) >= 2 and (spread is None or spread <= 0.6):
        confidence = "high"
    elif len(used) >= 3:
        confidence = "medium"
    elif used:
        confidence = "low"
    else:
        confidence = "none"
    market_value = median if len(used) >= 3 else None
    return {
        "key": key, "ok": True, "query": key,
        "valuation": {
            "marketValue": market_value, "conservativeValue": _percentile(used, 0.25) if len(used) >= 8 else market_value,
            "usedValue": median, "newValue": statistics.median(new) if new else None, "refurbishedValue": None,
            "confidence": confidence, "sourceCount": len(offers), "domainCount": len({o["domain"] for o in offers}),
            "spread": spread, "reason": f"медиана {len(used)} независимых б/у предложений",
        },
        "offers": offers, "providers": ["test"],
    }


class FakeExternalMarket:
    """Callable replacement for bot.run_external_research. `market` applies to every requested model."""

    def __init__(self):
        self.market = None
        self.calls = []
        self.used_domains = ("kleinanzeigen.de", "backmarket.nl")

    def set(self, used=(), new=()):
        self.market = {"used": list(used), "new": list(new)}

    def __call__(self, requests, cfg):
        self.calls.append([request["key"] for request in requests])
        if self.market is None:
            return []
        return [external_result(request["key"], self.market["used"], self.market["new"], used_domains=self.used_domains) for request in requests]

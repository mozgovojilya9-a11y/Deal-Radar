#!/usr/bin/env python3
"""Marktplaats deal scanner -> in-app JSON catalog. Only the Python standard library."""
import argparse
import json
import os
import random
import re
import sqlite3
import statistics
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.environ.get("DEAL_CONFIG", os.path.join(HERE, "config.json"))
DB_PATH = os.environ.get("DEAL_DB", os.path.join(HERE, "state.db"))
FEED_PATH = os.environ.get("DEAL_FEED", os.path.join(HERE, "data", "deals.json"))
API = "https://www.marktplaats.nl/lrp/api/search"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
}

HARD_BAD = re.compile(
    r"\b(defect\w*|kapot\w*|onderdelen|niet werkend|werkt niet|gebarsten|replica|kopie|nep|fake|imitatie|lookalike|look-a-like|gestolen)\b|1:1|icloud[\s-]*(slot|lock\w*|geblokkeerd|vergrendeld)",
    re.I,
)
NEGATED = re.compile(r"\b(geen|zonder|niet)\s+(defect\w*|kapot\w*|gebarsten|krassen)", re.I)
SOFT = [
    (re.compile(r"\b(krasje\w*|kras|krassen|deuk\w*|barst\w*|schade)\b", re.I), "в описании упомянуты царапины/повреждения"),
    (re.compile(r"(zonder|geen)\s+(doos|oplader|bon|factuur)", re.I), "нет коробки/зарядки/чека"),
    (re.compile(r"alleen (via )?whatsapp|betaal\w* vooraf|paypal vrienden|verzend\w* na betaling|\bborg\b", re.I), "признаки мошенничества (предоплата/только WhatsApp)"),
    (re.compile(r"gerepareerd|reparatie|nieuw scherm|vervangen scherm", re.I), "был ремонт или замена экрана"),
    (re.compile(r"icloud|apple id", re.I), "проверьте iCloud/Apple ID перед покупкой"),
]

def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)

def norm(s):
    return re.sub(r"[\s\-]", "", s.lower())

def open_db():
    db = sqlite3.connect(DB_PATH)
    db.executescript("""
        CREATE TABLE IF NOT EXISTS listings(
            id TEXT PRIMARY KEY, qkey TEXT, grp TEXT, title TEXT, price REAL,
            first_seen INTEGER, last_seen INTEGER);
        CREATE INDEX IF NOT EXISTS ix_q ON listings(qkey, grp, last_seen);
        CREATE TABLE IF NOT EXISTS sent(id TEXT PRIMARY KEY, ts INTEGER);
        CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
    """)
    return db

def market_stats(db, qkey, grp, exclude_id, since):
    sql = "SELECT price FROM listings WHERE qkey=? AND last_seen>=? AND id!=?"
    args = [qkey, since, exclude_id]
    if grp is not None:
        sql += " AND grp=?"
        args.append(grp)
    prices = [r[0] for r in db.execute(sql, args)]
    return (len(prices), statistics.median(prices)) if prices else (0, None)

def fetch_query(cfg, q, pages):
    out = []
    for p in range(pages):
        params = {
            "query": q["query"], "postcode": cfg["postcode"],
            "distanceMeters": int(cfg["distance_km"] * 1000),
            "limit": 100, "offset": p * 100,
            "sortBy": "SORT_INDEX", "sortOrder": "DECREASING",
            "searchInTitleAndDescription": "true",
        }
        req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params), headers=HEADERS)
        with urllib.request.urlopen(req, timeout=25) as r:
            data = json.load(r)
        items = data.get("listings") or []
        out += items
        if len(items) < 100:
            break
        time.sleep(random.uniform(1.5, 3.0))
    return out

def extract_image_url(l):
    """Best-effort extraction of a public listing image from Marktplaats response."""
    candidates = []
    for key in ("pictures", "images", "imageUrls", "media"):
        value = l.get(key)
        if isinstance(value, list):
            candidates.extend(value)
        elif value:
            candidates.append(value)
    for key in ("imageUrl", "imageURL", "thumbnailUrl", "pictureUrl"):
        if l.get(key):
            candidates.append(l[key])
    for item in candidates:
        value = item
        if isinstance(item, dict):
            value = next((item.get(k) for k in (
                "largeImageUrl", "largeUrl", "imageUrl", "url", "src",
                "mediumImageUrl", "thumbnailUrl"
            ) if item.get(k)), None)
        if isinstance(value, str) and value.strip():
            value = value.strip()
            if value.startswith("//"):
                return "https:" + value
            if value.startswith("/"):
                return "https://www.marktplaats.nl" + value
            if value.startswith("https://") or value.startswith("http://"):
                return value
    return None


def parse_listing(l):
    pi, loc = l.get("priceInfo") or {}, l.get("location") or {}
    url = l.get("vipUrl") or ""
    if url.startswith("/"):
        url = "https://www.marktplaats.nl" + url
    cents = pi.get("priceCents")
    description = l.get("description") or l.get("categorySpecificDescription") or ""
    return {
        "id": str(l.get("itemId") or ""),
        "title": l.get("title") or "",
        "text": " ".join(filter(None, [l.get("title"), l.get("description"),
                                       l.get("categorySpecificDescription")])),
        "description": description,
        "image_url": extract_image_url(l),
        "price": cents / 100.0 if isinstance(cents, (int, float)) else None,
        "ptype": pi.get("priceType"),
        "city": loc.get("cityName") or "",
        "dist_km": (loc.get("distanceMeters") / 1000.0)
        if isinstance(loc.get("distanceMeters"), (int, float)) else None,
        "date": l.get("date"),
        "url": url,
    }
def parse_listing_datetime(value):
    """Parse ISO timestamps and the Dutch relative/date labels used by Marktplaats."""
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    now = datetime.now(timezone.utc)

    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        pass

    text = raw.lower().strip().rstrip(".")
    relative_days = {
        "vandaag": 0, "today": 0,
        "gisteren": 1, "yesterday": 1,
        "eergisteren": 2, "day before yesterday": 2,
    }
    if text in relative_days:
        days = relative_days[text]
        return now - timedelta(days=days)
    relative_match = re.match(r"^(\d+)\s+(?:dag|dagen)\s+geleden$", text)
    if relative_match:
        return now - timedelta(days=int(relative_match.group(1)))
    english_relative = re.match(r"^(\d+)\s+days?\s+ago$", text)
    if english_relative:
        return now - timedelta(days=int(english_relative.group(1)))

    months = {
        "jan": 1, "januari": 1, "feb": 2, "februari": 2,
        "mrt": 3, "maa": 3, "maart": 3, "mar": 3,
        "apr": 4, "april": 4, "mei": 5, "may": 5,
        "jun": 6, "juni": 6, "jul": 7, "juli": 7,
        "aug": 8, "augustus": 8, "sep": 9, "sept": 9, "september": 9,
        "okt": 10, "oktober": 10, "oct": 10, "october": 10,
        "nov": 11, "november": 11, "dec": 12, "december": 12,
    }
    match = re.match(r"^(\d{1,2})\s+([a-z]+)\s+(\d{2,4})$", text)
    if match and match.group(2) in months:
        day, month, year = int(match.group(1)), months[match.group(2)], int(match.group(3))
        year += 2000 if year < 100 else 0
        try:
            # Marktplaats often provides a calendar date without a time.
            # Use the end of that date, capped at now for today's listings.
            dt = datetime(year, month, day, 23, 59, 59, tzinfo=timezone.utc)
            return min(dt, now)
        except ValueError:
            return None

    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y", "%d-%m-%y", "%d/%m/%y"):
        try:
            dt = datetime.strptime(text, fmt).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
            return min(dt, now)
        except ValueError:
            continue
    return None


def age_hours(s):
    dt = parse_listing_datetime(s)
    if dt is None:
        return None
    return (datetime.now(timezone.utc) - dt).total_seconds() / 3600

def group_of(q, text):
    """Build comparable product buckets instead of comparing unrelated items."""
    group_type = q.get("group_type")
    lowered = text.lower()
    if group_type == "television":
        brands = ("samsung", "lg", "sony", "philips", "panasonic", "hisense", "tcl",
                  "metz", "grundig", "sharp", "toshiba", "loewe")
        brand = next((item for item in brands if re.search(r"(?<!\w)" + re.escape(item) + r"(?!\w)", lowered)), None)
        size_match = re.search(
            r"\b(32|40|42|43|48|49|50|55|58|60|65|70|75|77|80|83|85|86|98)\s*(?:inch(?:es)?|[\"”])",
            lowered,
        )
        if not size_match:
            size_match = re.search(
                r"\b(?:ue|qe|qn|kd|oled|pus|qned|tu|du|uq|un)(32|40|42|43|48|49|50|55|58|60|65|70|75|77|80|83|85|86|98)\b",
                lowered,
            )
        size = size_match.group(1) if size_match else None
        if "neo qled" in lowered:
            panel = "neo-qled"
        elif "mini led" in lowered or "mini-led" in lowered:
            panel = "mini-led"
        elif "qned" in lowered:
            panel = "qned"
        elif "qled" in lowered:
            panel = "qled"
        elif "oled" in lowered:
            panel = "oled"
        elif re.search(r"\b(led|lcd)\b", lowered):
            panel = "led-lcd"
        else:
            panel = None
        if re.search(r"\b8k\b", lowered):
            resolution = "8k"
        elif re.search(r"\b(4k|uhd|ultra hd)\b", lowered):
            resolution = "4k"
        elif re.search(r"\b(full hd|fhd|1080p?)\b", lowered):
            resolution = "fhd"
        elif re.search(r"\b(hd ready|720p?)\b", lowered):
            resolution = "hd"
        else:
            resolution = None
        if not brand or not size:
            return "unknown"
        return "-".join((brand, size, panel or "panel-unknown", resolution or "resolution-unknown"))
    rx = q.get("group_regex")
    if not rx:
        return "all"
    found = sorted({norm(m.group(0)) for m in re.finditer(rx, text, re.I)})
    if group_type == "model_required":
        return "-".join(found) if found else "unknown"
    return "-".join(found) if found else "other"

def title_matches_query(q, title):
    """Apply model-specific title filters to both live listings and cached feed cards."""
    if not q:
        return False
    lowered = title.lower()
    inc = q.get("include_any")
    if inc and not any(w.lower() in lowered for w in inc):
        return False
    required = q.get("require_regex")
    if required and not re.search(required, title, re.I):
        return False
    for w in q.get("exclude", []):
        if re.search(r"(?<!\w)" + re.escape(w.lower()) + r"(?!\w)", lowered):
            return False
    for rx in q.get("exclude_regex", []):
        if re.search(rx, title, re.I):
            return False
    return True


def primary_rejection(q, it, cfg):
    """Return the first primary filter that rejects a listing, or None."""
    if not title_matches_query(q, it["title"]):
        return "title"
    if not it["id"] or it["price"] is None or it["price"] <= 0:
        return "invalid"
    if it["ptype"] not in (None, "FIXED"):
        return "price_type"
    if not (q.get("min_price", 0) <= it["price"] <= q.get("max_price", 10**9)):
        return "price_range"
    if it["dist_km"] is not None and it["dist_km"] > cfg["distance_km"] + 1:
        return "distance"
    return None


def accept(q, it, cfg):
    return primary_rejection(q, it, cfg) is None

def risks(it):
    text = NEGATED.sub(" ", it["text"])
    if HARD_BAD.search(text):
        return None
    return [label for rx, label in SOFT if rx.search(it["text"])]


def load_feed():
    """Load the public Mini App feed from the GitHub-backed JSON file."""
    os.makedirs(os.path.dirname(FEED_PATH), exist_ok=True)
    try:
        with open(FEED_PATH, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return {"updatedAt": None, "deals": data}
        if isinstance(data, dict) and isinstance(data.get("deals"), list):
            return data
    except FileNotFoundError:
        pass
    except (OSError, json.JSONDecodeError) as exc:
        log("не удалось прочитать каталог:", type(exc).__name__, str(exc)[:160])
    return {"updatedAt": None, "deals": []}


def save_feed(data):
    """Atomically save the current feed; GitHub Actions publishes this file."""
    os.makedirs(os.path.dirname(FEED_PATH), exist_ok=True)
    tmp_path = FEED_PATH + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp_path, FEED_PATH)


def make_feed_deal(q, it, med, discount, flags, grp, status, market_samples, reason=None):
    confidence = "high" if market_samples >= q.get("min_samples", 8) else ("preliminary" if med is not None else "none")
    return {
        "listing_id": it["id"], "title": it["title"],
        "description": it.get("description") or "",
        "price": round(float(it["price"]), 2),
        "market_price": round(float(med), 2) if med is not None else None,
        "discount": round(float(discount), 4) if discount is not None else None,
        "status": status, "market_confidence": confidence,
        "market_samples": int(market_samples), "evaluation_reason": reason,
        "category_key": q["key"], "category_label": q["label"],
        "model_group": grp, "city": it.get("city") or "",
        "distance_km": round(float(it["dist_km"]), 2) if it.get("dist_km") is not None else None,
        "listing_url": it["url"], "image_url": it.get("image_url"),
        "warning_flags": flags, "posted_at": it.get("date") or None,
        "detected_at": datetime.now(timezone.utc).isoformat(), "active": True,
    }


def run_once(cfg, db, dry=False):
    now = int(time.time())
    window = now - cfg.get("market_days", 21) * 86400
    min_n = cfg.get("min_samples", 8)
    candidate_min_n = cfg.get("candidate_min_samples", 3)
    fails = 0
    feed_doc = load_feed()
    metrics = {
        "checked": 0, "unique": 0, "duplicates": 0,
        "rejectedTitle": 0, "rejectedInvalid": 0, "rejectedPriceType": 0,
        "rejectedPriceRange": 0, "rejectedDistance": 0,
        "accepted": 0, "candidates": 0, "strongDeals": 0, "goodDeals": 0,
        "reviewCandidates": 0, "newDeals": 0, "alreadyPublished": 0,
        "rejectedAge": 0, "rejectedDateUnknown": 0, "rejectedRisk": 0,
        "rejectedDiscount": 0, "candidateNoMarket": 0, "candidatePreliminary": 0,
    }
    queries_by_key = {q["key"]: q for q in cfg["queries"]}
    feed_deals = {}
    for deal in feed_doc.get("deals", []):
        if not isinstance(deal, dict) or not deal.get("listing_id"):
            continue
        q = queries_by_key.get(str(deal.get("category_key") or ""))
        if not title_matches_query(q, deal.get("title") or ""):
            continue
        deal_id = str(deal["listing_id"])
        # Legacy TV cards used one median for every model. Keep them visible,
        # but mark their old discount as unverified until a model-specific group is collected.
        if q.get("group_type") == "television" and deal.get("model_group") in (None, "", "all", "unknown"):
            deal.update({
                "status": "candidate", "market_price": None, "discount": None,
                "market_confidence": "none",
                "evaluation_reason": "Старая общая оценка заменяется сравнением похожих телевизоров",
                "market_samples": 0,
            })
        else:
            deal.setdefault("status", "strong")
        feed_deals[deal_id] = deal

    raw_ids_seen = set()
    for q in cfg["queries"]:
        qkey = q["key"]
        existing = db.execute("SELECT COUNT(*) FROM listings WHERE qkey=?", (qkey,)).fetchone()[0]
        first_run = existing == 0
        pages = cfg.get("seed_pages", 5) if first_run else cfg.get("pages", 2)
        try:
            raw = fetch_query(cfg, q, pages)
        except Exception as exc:
            log(f"[{qkey}] ошибка запроса: {exc}")
            fails += 1
            time.sleep(random.uniform(2, 4))
            continue

        metrics["checked"] += len(raw)
        candidates = {}
        for listing in raw:
            item = parse_listing(listing)
            listing_id = item["id"]
            if listing_id:
                if listing_id in raw_ids_seen:
                    metrics["duplicates"] += 1
                    continue
                raw_ids_seen.add(listing_id)
            metrics["unique"] += 1

            rejection = primary_rejection(q, item, cfg)
            if rejection:
                metric = {
                    "title": "rejectedTitle", "invalid": "rejectedInvalid",
                    "price_type": "rejectedPriceType", "price_range": "rejectedPriceRange",
                    "distance": "rejectedDistance",
                }[rejection]
                metrics[metric] += 1
                continue

            metrics["accepted"] += 1
            group = group_of(q, item["text"])
            known = db.execute("SELECT 1 FROM listings WHERE id=?", (listing_id,)).fetchone()
            if known:
                db.execute(
                    "UPDATE listings SET last_seen=?, price=?, qkey=?, grp=?, title=? WHERE id=?",
                    (now, item["price"], qkey, group, item["title"], listing_id),
                )
            else:
                db.execute(
                    "INSERT INTO listings VALUES(?,?,?,?,?,?,?)",
                    (listing_id, qkey, group, item["title"], item["price"], now, now),
                )
            candidates[listing_id] = (item, group)
        db.commit()

        for listing_id, (item, group) in candidates.items():
            metrics["candidates"] += 1
            age = age_hours(item["date"])
            if age is None:
                metrics["rejectedDateUnknown"] += 1
                continue
            if age < -5 / 60 or age > cfg.get("max_age_hours", 720):
                metrics["rejectedAge"] += 1
                continue
            flags = risks(item)
            if flags is None:
                metrics["rejectedRisk"] += 1
                continue

            if group == "unknown":
                sample_count, median_price = 0, None
            else:
                sample_count, median_price = market_stats(db, qkey, group, listing_id, window)

            if group != "all" and not q.get("strict_group") and sample_count < min_n:
                category_count, category_median = market_stats(db, qkey, None, listing_id, window)
                if category_count >= min_n and category_median is not None:
                    sample_count, median_price = category_count, category_median

            status, discount, reason = "candidate", None, None
            if sample_count >= min_n and median_price is not None:
                discount = 1 - item["price"] / median_price
                deal_threshold = float(q.get("threshold", 0.25))
                good_threshold = float(q.get("good_threshold", max(0.12, deal_threshold - 0.08)))
                if discount >= deal_threshold:
                    status = "strong"
                    metrics["strongDeals"] += 1
                elif discount >= good_threshold:
                    status = "good"
                    metrics["goodDeals"] += 1
                else:
                    metrics["rejectedDiscount"] += 1
                    continue
            else:
                metrics["reviewCandidates"] += 1
                if median_price is not None and sample_count >= candidate_min_n:
                    discount = 1 - item["price"] / median_price
                    metrics["candidatePreliminary"] += 1
                    reason = f"Предварительная оценка по {sample_count} похожим объявлениям; нужно больше данных"
                else:
                    metrics["candidateNoMarket"] += 1
                    reason = "Пока недостаточно похожих объявлений для честной оценки рынка"

            already_published = db.execute("SELECT 1 FROM sent WHERE id=?", (listing_id,)).fetchone()
            if already_published:
                metrics["alreadyPublished"] += 1
            elif status in ("strong", "good"):
                metrics["newDeals"] += 1
                db.execute("INSERT OR IGNORE INTO sent VALUES(?,?)", (listing_id, now))
                db.commit()

            feed_deals[listing_id] = make_feed_deal(
                q, item, median_price, discount, flags, group, status, sample_count, reason
            )
            if status in ("strong", "good"):
                log(
                    f"[{qkey}] {status}: {discount:.0%} скидка, €{item['price']:.0f} "
                    f"(рынок ≈ €{median_price:.0f}, {sample_count} сравнений) {item['title'][:70]}"
                )
        time.sleep(random.uniform(2, 4))

    db.execute("DELETE FROM listings WHERE last_seen<?", (now - 30 * 86400,))
    db.commit()
    if fails == len(cfg["queries"]):
        log("все запросы к Marktplaats не удались — каталог не обновлён")
        return False

    max_age_hours = cfg.get("max_age_hours", 720)
    current_deals = []
    for deal in feed_deals.values():
        listing_age = age_hours(deal.get("posted_at"))
        if listing_age is None:
            listing_age = age_hours(deal.get("detected_at"))
        if listing_age is not None and -5 / 60 <= listing_age <= max_age_hours:
            current_deals.append(deal)

    verified = [d for d in current_deals if d.get("status", "strong") in ("strong", "good")]
    review = [d for d in current_deals if d.get("status") == "candidate"]
    review.sort(key=lambda d: (
        d.get("discount") is not None,
        float(d.get("discount") or -1),
        d.get("detected_at") or "",
    ), reverse=True)
    category_counts = {}
    selected_review = []
    for deal in review:
        key = deal.get("category_key") or "other"
        if category_counts.get(key, 0) >= 8:
            continue
        category_counts[key] = category_counts.get(key, 0) + 1
        selected_review.append(deal)
    selected_review = selected_review[:80]

    fresh_deals = verified + selected_review
    rank = {"strong": 3, "good": 2, "candidate": 1}
    fresh_deals.sort(key=lambda d: (
        -rank.get(d.get("status", "strong"), 0),
        -float(d.get("discount") if d.get("discount") is not None else -1),
        d.get("detected_at") or "",
    ))
    fresh_deals = fresh_deals[:200]

    now_iso = datetime.now(timezone.utc).isoformat()
    changed = fresh_deals != feed_doc.get("deals", [])
    primary_rejected = sum(metrics[key] for key in (
        "rejectedTitle", "rejectedInvalid", "rejectedPriceType", "rejectedPriceRange", "rejectedDistance"
    ))
    rejected_total = primary_rejected + sum(metrics[key] for key in (
        "rejectedAge", "rejectedDateUnknown", "rejectedRisk", "rejectedDiscount"
    ))
    feed_doc = {
        "updatedAt": now_iso if changed or not feed_doc.get("updatedAt") else feed_doc["updatedAt"],
        "scannedAt": now_iso,
        "scannerStats": {
            **metrics, "primaryRejected": primary_rejected, "rejectedTotal": rejected_total,
            "queryCount": len(cfg["queries"]), "failedQueries": fails, "finishedAt": now_iso,
        },
        "deals": fresh_deals,
    }
    if dry:
        log(f"dry-run: каталог не записан ({len(fresh_deals)} предложений)")
    else:
        save_feed(feed_doc)
        log(f"каталог сохранён: {len(fresh_deals)} предложений" + (" (есть изменения)" if changed else ""))
    log(
        f"готово: результатов {metrics['checked']}, уникальных {metrics['unique']}, "
        f"повторов {metrics['duplicates']}, первично принято {metrics['accepted']}, "
        f"кандидатов {metrics['candidates']}, сильных {metrics['strongDeals']}, "
        f"хороших {metrics['goodDeals']}, на проверке {metrics['reviewCandidates']}, "
        f"новых выгодных {metrics['newDeals']}, ошибок запросов {fails}"
    )
    return fails < len(cfg["queries"])

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--loop", type=int, metavar="SEC", help="работать постоянно, проверяя каждые SEC секунд")
    ap.add_argument("--dry", action="store_true", help="сканировать, но не записывать каталог")
    args = ap.parse_args()
    with open(CONFIG_PATH, encoding="utf-8") as f:
        cfg = json.load(f)
    db = open_db()
    if args.loop:
        while True:
            try:
                run_once(cfg, db, args.dry)
            except Exception as e:
                log("ошибка цикла:", e)
            time.sleep(args.loop * random.uniform(0.85, 1.15))
    else:
        return 0 if run_once(cfg, db, args.dry) else 1

if __name__ == "__main__":
    sys.exit(main())

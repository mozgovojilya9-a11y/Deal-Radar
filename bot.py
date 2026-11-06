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
RETAIL_PATH = os.environ.get("DEAL_RETAIL_PRICES", os.path.join(HERE, "retail_prices.json"))
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
EXTERNAL_URL_RE = re.compile(r"(?i)(?:https?://|www\.)[^\s<>\"']+")
BARE_DOMAIN_RE = re.compile(r"(?i)(?<![@\w])\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:nl|com|net|org|eu|de|be|co\.uk|shop|store|io)\b")
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

def fetch_marktplaats_v2(cfg, query, pages):
    """Fallback to the documented Marktplaats v2 search endpoint."""
    out = []
    for page in range(min(pages, 3)):
        params = {
            "query": query, "offset": page * 100, "limit": 100, "locale": "nl-NL",
            "searchDescription": "true", "postCode": cfg.get("postcode", ""),
            "distance": int(cfg.get("distance_km", 50) * 1000),
            "sortBy": "default", "sortOrder": "descending",
        }
        params = {key: value for key, value in params.items() if value not in ("", None)}
        req = urllib.request.Request("https://api.marktplaats.nl/v2/search?" + urllib.parse.urlencode(params), headers=HEADERS)
        with urllib.request.urlopen(req, timeout=25) as response:
            data = json.load(response)
        embedded = data.get("_embedded") or {}
        items = embedded.get("mp:search-result") or data.get("listings") or []
        out.extend(items)
        if len(items) < 100:
            break
        time.sleep(random.uniform(0.6, 1.2))
    return out


def fetch_query(cfg, q, pages):
    """Search several wording/model-code variants, then deduplicate by Marktplaats ID."""
    terms = q.get("search_variants") or [q["query"]]
    terms = list(dict.fromkeys(str(term).strip() for term in terms if str(term).strip()))
    out = []
    seen = set()
    for term in terms:
        term_pages = min(pages, int(q.get("variant_pages", 1))) if len(terms) > 1 else pages
        params = {
            "query": term, "postcode": cfg["postcode"],
            "distanceMeters": int(cfg["distance_km"] * 1000),
            "limit": 100, "offset": 0,
            "sortBy": "SORT_INDEX", "sortOrder": "DECREASING",
            "searchInTitleAndDescription": "true",
        }
        try:
            result = []
            for page in range(term_pages):
                params["offset"] = page * 100
                req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params), headers=HEADERS)
                with urllib.request.urlopen(req, timeout=25) as response:
                    data = json.load(response)
                items = data.get("listings") or []
                result.extend(items)
                if len(items) < 100:
                    break
                time.sleep(random.uniform(0.6, 1.2))
            if not result:
                result = fetch_marktplaats_v2(cfg, term, term_pages)
            elif q.get("search_v2"):
                # Run both search APIs for difficult model-specific searches and merge their hits.
                try:
                    result.extend(fetch_marktplaats_v2(cfg, term, term_pages))
                except Exception as v2_error:
                    log(f"[{qkey}] v2 fallback warning for '{term}': {v2_error}")
        except Exception as legacy_error:
            try:
                result = fetch_marktplaats_v2(cfg, term, term_pages)
            except Exception:
                raise legacy_error
        for item in result:
            listing_id = str(item.get("itemId") or item.get("id") or "")
            if listing_id and listing_id in seen:
                continue
            if listing_id:
                seen.add(listing_id)
            out.append(item)
        if len(terms) > 1:
            time.sleep(random.uniform(0.6, 1.2))
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


def has_external_website_link(value):
    """Reject listings that route buyers to an external shop or seller website."""
    if not isinstance(value, str) or not value.strip():
        return False
    candidates = EXTERNAL_URL_RE.findall(value) + BARE_DOMAIN_RE.findall(value)
    for candidate in candidates:
        host = candidate.strip(".,;:!?)\"]'").lower()
        host = re.sub(r"^https?://", "", host)
        host = host.split("/", 1)[0].split("?", 1)[0].split("#", 1)[0]
        host = host.removeprefix("www.")
        if host and host != "marktplaats.nl" and not host.endswith(".marktplaats.nl"):
            return True
    return False


def parse_listing(l):
    """Normalize both current Marktplaats search responses and the documented v2 API."""
    pi, loc = l.get("priceInfo") or {}, l.get("location") or {}
    price_model = l.get("priceModel") or {}
    cents = pi.get("priceCents")
    if not isinstance(cents, (int, float)):
        cents = price_model.get("askingPrice")
    if not isinstance(cents, (int, float)):
        cents = l.get("priceCents")
    description = l.get("description") or l.get("categorySpecificDescription") or ""
    if not description and isinstance(l.get("translations"), list):
        description = " ".join(str(t.get("description") or "") for t in l["translations"] if isinstance(t, dict))
    url = l.get("vipUrl") or ""
    if not url and isinstance(l.get("_links"), dict):
        rel = l["_links"].get("mp:advertisement-website-link") or l["_links"].get("mp:advertisement")
        if isinstance(rel, dict):
            url = rel.get("href") or ""
    if url.startswith("/"):
        url = "https://www.marktplaats.nl" + url
    if url and url.startswith("http://link.marktplaats.nl/"):
        url = url.replace("http://", "https://", 1)
    text = " ".join(filter(None, [l.get("title"), description, l.get("categorySpecificDescription")]))
    link_fields = []
    for key in ("externalUrl", "externalURL", "website", "websiteUrl", "websiteURL", "externalLinks"):
        value = l.get(key)
        if isinstance(value, str):
            link_fields.append(value)
        elif isinstance(value, list):
            link_fields.extend(str(x) for x in value if x)
        elif isinstance(value, dict):
            link_fields.extend(str(x) for x in value.values() if x)
    price_type = pi.get("priceType") or price_model.get("modelType")
    if isinstance(price_type, str):
        price_type = "FIXED" if price_type.lower() == "fixed" else price_type.upper()
    location = l.get("location")
    if not isinstance(location, dict):
        location = {}
    return {
        "id": str(l.get("itemId") or l.get("id") or ""),
        "title": l.get("title") or "",
        "text": text,
        "description": description,
        "external_link": has_external_website_link(text) or any(has_external_website_link(x) for x in link_fields),
        "image_url": extract_image_url(l),
        "price": cents / 100.0 if isinstance(cents, (int, float)) else None,
        "ptype": price_type,
        "city": location.get("cityName") or "",
        "dist_km": (location.get("distanceMeters") / 1000.0)
        if isinstance(location.get("distanceMeters"), (int, float)) else None,
        "date": l.get("date") or l.get("dateCreated") or l.get("createdAt"),
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

def television_model_year(text):
    """Infer 2023-2026 model generation from known regional model-number schemes."""
    raw = str(text or "").upper()

    # LG OLED: OLED55C3/C4/C5/C6 = 2023/24/25/26.
    match = re.search(r"\bOLED\s*\d{2,3}[A-Z]([1-6])\b", raw)
    if match:
        return 2020 + int(match.group(1))

    # LG UHD / QNED / NanoCell generation letters.
    lg_uhd = re.search(r"\b\d{2,3}U([BATR])\d{3,5}\b", raw)
    if lg_uhd:
        return {"R": 2023, "T": 2024, "A": 2025, "B": 2026}[lg_uhd.group(1)]
    lg_qned = re.search(r"\b\d{2,3}(?:QNED|NANO)\d{2,3}([BATR])\d{1,2}[A-Z]{0,2}\b", raw)
    if lg_qned:
        return {"R": 2023, "T": 2024, "A": 2025, "B": 2026}[lg_qned.group(1)]

    # Samsung QLED/OLED/Micro RGB: C/D/F/H = 2023/24/25/26.
    samsung = re.search(r"\b(?:QE|QN|QA|UA|UE|LS|MRE)?\d{2,3}(?:Q|QN|S|LS|M|R)?\d{1,3}([ABCDFH])(?:[A-Z0-9]{0,5})\b", raw)
    if samsung:
        return {"A": 2021, "B": 2022, "C": 2023, "D": 2024, "F": 2025, "H": 2026}[samsung.group(1)]
    samsung_uhd = re.search(r"\b(?:UA|UE)?\d{2,3}U(?:7000|8000|8500|9000)([FH])\b", raw)
    if samsung_uhd:
        return {"F": 2025, "H": 2026}[samsung_uhd.group(1)]
    samsung_led = re.search(r"\b(?:UE|QE)?\d{2,3}(CU|DU|BU|AU|TU)\d{4,5}\b|\b(CU|DU|BU|AU|TU)\d{4,5}\b", raw)
    if samsung_led:
        code = samsung_led.group(1) or samsung_led.group(2)
        return {"TU": 2020, "AU": 2021, "BU": 2022, "CU": 2023, "DU": 2024}[code]

    # Sony: 2023 L-series; new K- model format starts 2024.
    sony_2026 = re.search(r"\bK-\d{2,3}(?:XR\d{2}|S\d{2})M2\b", raw)
    if sony_2026:
        return 2026
    sony_2026_bravia5 = re.search(r"\bK-\d{2,3}XR53\b", raw)
    if sony_2026_bravia5:
        return 2026
    sony_2025 = re.search(r"\bK-\d{2,3}XR50\b", raw)
    if sony_2025:
        return 2025
    sony_2024 = re.search(r"\bK-\d{2,3}(?:XR(?:90|80|70)|S(?:25|20))\b", raw)
    if sony_2024:
        return 2024
    sony_2023 = re.search(r"\b(?:KD|XRJ|XR|KJ|KE)\s*[- ]?\d{2,3}[A-Z0-9]{1,5}L\b", raw)
    if sony_2023:
        return 2023

    # Philips: model-year digit is 8/9/0/1 for 2023/24/25/26.
    philips_oled = re.search(r"\b(?:\d{2,3})?OLED\d{2}([8901])\b", raw)
    philips_led = re.search(r"\b(?:\d{2,3})?PUS\d{3}([8901])(?:/\d{2})?\b|\b(?:\d{2,3})?PQS\d{3}([8901])(?:/\d{2})?\b", raw)
    digit = (philips_oled.group(1) if philips_oled else None) or ((philips_led.group(1) or philips_led.group(2)) if philips_led else None)
    if digit:
        return {"8": 2023, "9": 2024, "0": 2025, "1": 2026}[digit]

    # Hisense Europe: K/KQ=2023, N/NQ=2024, Q=2025, S=2026.
    hisense = re.search(r"\b\d{2,3}[A-Z]\d{1,2}(NQ|KQ|K|N|Q|S)\b", raw)
    if hisense:
        return {"KQ": 2023, "K": 2023, "NQ": 2024, "N": 2024, "Q": 2025, "S": 2026}[hisense.group(1)]

    # TCL: K=2025 and L=2026 in current P/C lines.
    tcl = re.search(r"\b\d{2,3}[PC]\d{1,2}([KL])\b", raw)
    if tcl:
        return {"K": 2025, "L": 2026}[tcl.group(1)]
    if re.search(r"\bC(?:805|845)\b", raw):
        return 2023
    if re.search(r"\bC855\b", raw):
        return 2024

    # A year written explicitly as the model year is a fallback, not purchase date.
    explicit = re.search(
        r"\b(?:model(?:jaar)?|model year|bouwjaar)\s*[:-]?\s*(202[3-6])\b|\b(202[3-6])\s+(?:model|modeljaar)\b",
        raw, re.I,
    )
    if explicit:
        return int(explicit.group(1) or explicit.group(2))
    return None

def group_of(q, text):
    """Build comparable product buckets instead of comparing unrelated items."""
    group_type = q.get("group_type")
    lowered = text.lower()
    if q.get("key") == "rayban":
        return "wayfarer-gen-2" if title_matches_query(q, text) else "unknown"
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
                r"\b(?:ue|qe|qn|kd|oled|pus|qned|tu|du|uq|un)(32|40|42|43|48|49|50|55|58|60|65|70|75|77|80|83|85|86|98)(?=[a-z0-9]|\b)",
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
        year = television_model_year(text)
        if not brand or not size or year is None:
            return "unknown"
        return "-".join((brand, size, panel or "panel-unknown", resolution or "resolution-unknown", str(year)))
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
    if it.get("external_link") or has_external_website_link(it.get("description") or ""):
        return "external_link"
    if q.get("group_type") == "television":
        year = television_model_year(it.get("text") or it.get("title") or "")
        if year is None or year < int(q.get("min_model_year", 2023)):
            return "old_model"
    if not it["id"] or it["price"] is None or it["price"] <= 0:
        return "invalid"
    if it["ptype"] not in (None, "FIXED"):
        return "price_type"
    absolute_cap = float(cfg.get("max_product_price_eur", 800))
    category_cap = min(float(q.get("max_price", absolute_cap)), absolute_cap)
    if not (float(q.get("min_price", 0)) <= it["price"] <= category_cap):
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


def load_retail_prices():
    """Load current-new-price references; source-less and stale entries are ignored."""
    try:
        with open(RETAIL_PATH, encoding="utf-8") as handle:
            data = json.load(handle)
        return data.get("references", {}) if isinstance(data, dict) else {}
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return {}


def find_retail_reference(q, group, references, cfg):
    keys = [f"{q['key']}|{group}"]
    if group in ("all", "other"):
        keys.append(q["key"])
    reference = next((references.get(key) for key in keys if references.get(key)), None)
    if not isinstance(reference, dict):
        return None
    price = reference.get("new_price_eur")
    source = str(reference.get("source_url") or "")
    checked = parse_listing_datetime(reference.get("checked_at"))
    max_age = int(cfg.get("profitability", {}).get("retail_reference_max_age_days", 45))
    if not isinstance(price, (int, float)) or price <= 0 or not source.startswith("https://") or checked is None:
        return None
    age_seconds = (datetime.now(timezone.utc) - checked).total_seconds()
    if age_seconds < -300 or age_seconds > max_age * 86400:
        return None
    return reference


def calculate_resale_economics(q, asking_price, reference_price, sample_count, reference_type, reference=None, cfg=None):
    """Estimate conservative resale price and profit after typical selling friction."""
    cfg = cfg or {}
    rules = cfg.get("profitability", {})
    retail_proxy = reference_type == "new_retail"
    resale_factor = float((reference or {}).get("resale_factor", q.get("new_resale_factor", rules.get("new_resale_factor", 0.62)))) if retail_proxy else float(rules.get("market_resale_factor", 0.95))
    expected_resale = max(0.0, float(reference_price) * resale_factor)
    negotiation = float(rules.get("buyer_negotiation_rate", 0.04))
    fee = float(rules.get("selling_fee_rate", 0.08))
    fixed = float(rules.get("fixed_selling_cost_eur", 10))
    refurb = float(q.get("resale_extra_cost_eur", rules.get("extra_cost_eur", 0)))
    net_sale = expected_resale * (1 - negotiation) * (1 - fee) - fixed
    profit = net_sale - float(asking_price) - refurb
    invested = float(asking_price) + refurb
    roi = profit / invested if invested > 0 else -1.0
    min_profit = float(q.get("min_profit_eur", rules.get("min_profit_eur", 40)))
    min_roi = float(q.get("min_roi", rules.get("min_roi", 0.20)))
    if retail_proxy:
        min_profit = max(min_profit, float(rules.get("retail_proxy_min_profit_eur", 70)))
        min_roi = max(min_roi, float(rules.get("retail_proxy_min_roi", 0.35)))
    return {
        "expected_resale_price": round(expected_resale, 2),
        "estimated_profit": round(profit, 2),
        "profit_roi": round(roi, 4),
        "profitable": profit >= min_profit and roi >= min_roi,
        "minimum_profit_required": round(min_profit, 2),
        "minimum_roi_required": round(min_roi, 4),
    }


def make_feed_deal(q, it, med, discount, flags, grp, status, market_samples, reason=None,
                   economics=None, reference_type="marktplaats", new_price=None, model_year=None):
    confidence = "retail_proxy" if reference_type == "new_retail" else ("high" if market_samples >= q.get("min_samples", 8) else ("preliminary" if med is not None else "none"))
    economics = economics or {}
    return {
        "listing_id": it["id"], "title": it["title"],
        "description": it.get("description") or "",
        "price": round(float(it["price"]), 2),
        "market_price": round(float(med), 2) if med is not None else None,
        "discount": round(float(discount), 4) if discount is not None else None,
        "expected_resale_price": economics.get("expected_resale_price"),
        "estimated_profit": economics.get("estimated_profit"),
        "profit_roi": economics.get("profit_roi"),
        "price_reference_type": reference_type,
        "new_price": round(float(new_price), 2) if new_price is not None else None,
        "model_year": model_year,
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
    retail_references = load_retail_prices()
    metrics = {
        "checked": 0, "unique": 0, "duplicates": 0,
        "rejectedTitle": 0, "rejectedExternalLink": 0, "rejectedOldModel": 0,
        "rejectedInvalid": 0, "rejectedPriceType": 0, "rejectedPriceRange": 0, "rejectedDistance": 0,
        "accepted": 0, "candidates": 0, "strongDeals": 0, "goodDeals": 0,
        "reviewCandidates": 0, "newDeals": 0, "alreadyPublished": 0,
        "rejectedAge": 0, "rejectedDateUnknown": 0, "rejectedRisk": 0,
        "rejectedDiscount": 0, "rejectedProfit": 0, "candidateNoMarket": 0,
        "candidatePreliminary": 0, "retailProxyEvaluated": 0,
    }
    queries_by_key = {q["key"]: q for q in cfg["queries"]}
    feed_deals = {}
    for deal in feed_doc.get("deals", []):
        if not isinstance(deal, dict) or not deal.get("listing_id"):
            continue
        q = queries_by_key.get(str(deal.get("category_key") or ""))
        if not title_matches_query(q, deal.get("title") or ""):
            continue
        if has_external_website_link(deal.get("description") or ""):
            continue
        deal_id = str(deal["listing_id"])
        if q.get("group_type") == "television":
            year = television_model_year(" ".join([deal.get("title") or "", deal.get("description") or ""]))
            if year is None or year < int(q.get("min_model_year", 2023)):
                continue
            deal["model_year"] = year
        if deal.get("estimated_profit") is None or deal.get("profit_roi") is None:
            deal.update({
                "status": "candidate", "market_price": None, "discount": None,
                "estimated_profit": None, "profit_roi": None, "market_confidence": "none",
                "market_samples": 0,
                "evaluation_reason": "Предложение требует повторной оценки по потенциальной прибыли после расходов",
            })
        else:
            deal.setdefault("status", "candidate")
        feed_deals[deal_id] = deal

    raw_ids_seen = set()
    for q in cfg["queries"]:
        qkey = q["key"]
        existing = db.execute("SELECT COUNT(*) FROM listings WHERE qkey=?", (qkey,)).fetchone()[0]
        pages = cfg.get("seed_pages", 5) if existing == 0 else cfg.get("pages", 2)
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
                    "title": "rejectedTitle", "external_link": "rejectedExternalLink",
                    "old_model": "rejectedOldModel", "invalid": "rejectedInvalid",
                    "price_type": "rejectedPriceType", "price_range": "rejectedPriceRange",
                    "distance": "rejectedDistance",
                }[rejection]
                metrics[metric] += 1
                if listing_id:
                    feed_deals.pop(listing_id, None)
                continue
            metrics["accepted"] += 1
            age = age_hours(item["date"])
            if age is None:
                metrics["rejectedDateUnknown"] += 1
                feed_deals.pop(listing_id, None)
                continue
            if age < -5 / 60 or age > cfg.get("max_age_hours", 720):
                metrics["rejectedAge"] += 1
                feed_deals.pop(listing_id, None)
                continue
            flags = risks(item)
            if flags is None:
                metrics["rejectedRisk"] += 1
                feed_deals.pop(listing_id, None)
                continue
            group = group_of(q, item["text"])
            known = db.execute("SELECT 1 FROM listings WHERE id=?", (listing_id,)).fetchone()
            if known:
                db.execute("UPDATE listings SET last_seen=?, price=?, qkey=?, grp=?, title=? WHERE id=?",
                           (now, item["price"], qkey, group, item["title"], listing_id))
            else:
                db.execute("INSERT INTO listings VALUES(?,?,?,?,?,?,?)",
                           (listing_id, qkey, group, item["title"], item["price"], now, now))
            candidates[listing_id] = (item, group, flags)
        db.commit()

        for listing_id, (item, group, flags) in candidates.items():
            metrics["candidates"] += 1
            if group == "unknown":
                sample_count, median_price = 0, None
            else:
                sample_count, median_price = market_stats(db, qkey, group, listing_id, window)
            if group != "all" and not q.get("strict_group") and sample_count < min_n:
                category_count, category_median = market_stats(db, qkey, None, listing_id, window)
                if category_count >= min_n and category_median is not None:
                    sample_count, median_price = category_count, category_median
            status, discount, reason = "candidate", None, None
            reference_type = "marktplaats" if median_price is not None else "insufficient_data"
            reference = None
            new_price = None
            valuation_price = median_price
            if (sample_count < candidate_min_n or median_price is None) and group != "unknown":
                reference = find_retail_reference(q, group, retail_references, cfg)
                if reference:
                    new_price = float(reference["new_price_eur"])
                    valuation_price = new_price
                    reference_type = "new_retail"
                    metrics["retailProxyEvaluated"] += 1
            if valuation_price is not None:
                economics = calculate_resale_economics(q, item["price"], valuation_price, sample_count, reference_type, reference, cfg)
                market_display_price = economics["expected_resale_price"] if reference_type == "new_retail" else valuation_price
                discount = 1 - item["price"] / market_display_price if market_display_price else None
            else:
                economics, market_display_price = None, None

            model_year = television_model_year(item["text"]) if q.get("group_type") == "television" else None
            if reference_type == "new_retail":
                if economics and economics["profitable"]:
                    status = "strong" if economics["profit_roi"] >= 0.50 and economics["estimated_profit"] >= economics["minimum_profit_required"] * 1.5 else "good"
                    metrics["strongDeals" if status == "strong" else "goodDeals"] += 1
                    reason = "Оценка по актуальной цене нового товара с запасом на торг и расходы"
                else:
                    metrics["reviewCandidates"] += 1
                    reason = "Нет достаточной прибыли при консервативной оценке перепродажи от цены нового товара"
            elif sample_count >= min_n and median_price is not None:
                discount = 1 - item["price"] / median_price
                deal_threshold = float(q.get("threshold", 0.25))
                good_threshold = float(q.get("good_threshold", max(0.12, deal_threshold - 0.08)))
                if economics and economics["profitable"] and discount >= deal_threshold and economics["profit_roi"] >= max(0.30, float(q.get("strong_min_roi", 0.30))):
                    status = "strong"
                    metrics["strongDeals"] += 1
                elif economics and economics["profitable"] and discount >= good_threshold:
                    status = "good"
                    metrics["goodDeals"] += 1
                else:
                    if not economics or economics["estimated_profit"] < economics["minimum_profit_required"] or economics["profit_roi"] < economics["minimum_roi_required"]:
                        metrics["rejectedProfit"] += 1
                    else:
                        metrics["rejectedDiscount"] += 1
                    feed_deals.pop(listing_id, None)
                    continue
            else:
                metrics["reviewCandidates"] += 1
                if median_price is not None and sample_count >= candidate_min_n:
                    metrics["candidatePreliminary"] += 1
                    reason = f"Предварительная оценка по {sample_count} похожим объявлениям; нужна большая выборка"
                elif reference_type == "insufficient_data":
                    metrics["candidateNoMarket"] += 1
                    reason = "Недостаточно данных: нет средней цены Marktplaats и актуальной цены нового товара для точного сравнения; прибыль не выдумывается"
                elif economics and economics["profitable"]:
                    reason = "Цена нового товара даёт ориентир, но спрос и стоимость б/у нужно подтвердить"
                else:
                    reason = "Недостаточно надёжных сравнений; прибыль от перепродажи пока не подтверждена"

            already_published = db.execute("SELECT 1 FROM sent WHERE id=?", (listing_id,)).fetchone()
            if already_published:
                metrics["alreadyPublished"] += 1
            elif status in ("strong", "good"):
                metrics["newDeals"] += 1
                db.execute("INSERT OR IGNORE INTO sent VALUES(?,?)", (listing_id, now))
                db.commit()
            feed_deals[listing_id] = make_feed_deal(
                q, item, market_display_price, discount, flags, group, status, sample_count, reason,
                economics=economics, reference_type=reference_type, new_price=new_price, model_year=model_year
            )
            if status in ("strong", "good"):
                log(f"[{qkey}] {status}: чистая прибыль €{economics['estimated_profit']:.0f}, "
                    f"ROI {economics['profit_roi']:.0%}, цена €{item['price']:.0f} "
                    f"(ориентир €{valuation_price:.0f}, {sample_count} сравнений, {reference_type}) {item['title'][:70]}")
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
    verified = [d for d in current_deals if d.get("status", "candidate") in ("strong", "good")]
    review = [d for d in current_deals if d.get("status") == "candidate"]
    review.sort(key=lambda d: (
        d.get("estimated_profit") is not None,
        float(d.get("estimated_profit") or -1),
        float(d.get("profit_roi") or -1),
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
        -rank.get(d.get("status", "candidate"), 0),
        -float(d.get("estimated_profit") if d.get("estimated_profit") is not None else -1),
        -float(d.get("profit_roi") if d.get("profit_roi") is not None else -1),
        d.get("detected_at") or "",
    ))
    fresh_deals = fresh_deals[:200]
    now_iso = datetime.now(timezone.utc).isoformat()
    changed = fresh_deals != feed_doc.get("deals", [])
    primary_rejected = sum(metrics[key] for key in (
        "rejectedTitle", "rejectedExternalLink", "rejectedOldModel", "rejectedInvalid",
        "rejectedPriceType", "rejectedPriceRange", "rejectedDistance"
    ))
    rejected_total = primary_rejected + sum(metrics[key] for key in (
        "rejectedAge", "rejectedDateUnknown", "rejectedRisk", "rejectedDiscount", "rejectedProfit"
    ))
    feed_doc = {
        "updatedAt": now_iso if changed or not feed_doc.get("updatedAt") else feed_doc["updatedAt"],
        "scannedAt": now_iso,
        "scannerStats": {**metrics, "primaryRejected": primary_rejected, "rejectedTotal": rejected_total,
                         "queryCount": len(cfg["queries"]), "failedQueries": fails, "finishedAt": now_iso},
        "deals": fresh_deals,
    }
    if dry:
        log(f"dry-run: каталог не записан ({len(fresh_deals)} предложений)")
    else:
        save_feed(feed_doc)
        log(f"каталог сохранён: {len(fresh_deals)} предложений" + (" (есть изменения)" if changed else ""))
    log(f"готово: результатов {metrics['checked']}, уникальных {metrics['unique']}, "
        f"повторов {metrics['duplicates']}, первично принято {metrics['accepted']}, "
        f"кандидатов {metrics['candidates']}, сильных {metrics['strongDeals']}, "
        f"хороших {metrics['goodDeals']}, на проверке {metrics['reviewCandidates']}, "
        f"новых выгодных {metrics['newDeals']}, ошибок запросов {fails}")
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

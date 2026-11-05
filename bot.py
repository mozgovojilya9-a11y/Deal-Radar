#!/usr/bin/env python3
"""Marktplaats deal finder -> Telegram. Only the Python standard library."""
import argparse
import html
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
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.environ.get("DEAL_CONFIG", os.path.join(HERE, "config.json"))
DB_PATH = os.environ.get("DEAL_DB", os.path.join(HERE, "state.db"))
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
def age_hours(s):
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).total_seconds() / 3600
    except Exception:
        return None

def group_of(q, text):
    rx = q.get("group_regex")
    if not rx:
        return "all"
    found = sorted({norm(m.group(0)) for m in re.finditer(rx, text, re.I)})
    return "-".join(found) if found else "other"

def accept(q, it, cfg):
    title = it["title"].lower()
    inc = q.get("include_any")
    if inc and not any(w.lower() in title for w in inc):
        return False
    for w in q.get("exclude", []):
        if re.search(r"(?<!\w)" + re.escape(w.lower()) + r"(?!\w)", title):
            return False
    for rx in q.get("exclude_regex", []):
        if re.search(rx, it["title"], re.I):
            return False
    if not it["id"] or it["price"] is None or it["price"] <= 0:
        return False
    if it["ptype"] not in (None, "FIXED"):
        return False
    if not (q.get("min_price", 0) <= it["price"] <= q.get("max_price", 10**9)):
        return False
    if it["dist_km"] is not None and it["dist_km"] > cfg["distance_km"] + 1:
        return False
    return True

def risks(it):
    text = NEGATED.sub(" ", it["text"])
    if HARD_BAD.search(text):
        return None
    return [label for rx, label in SOFT if rx.search(it["text"])]


def supabase_upsert_deal(q, it, med, discount, flags, grp):
    """Publish a qualified deal to Supabase for the Mini App. Optional until secrets are configured."""
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        return False
    payload = {
        "listing_id": it["id"],
        "title": it["title"],
        "description": it.get("description") or "",
        "price": it["price"],
        "market_price": round(float(med), 2),
        "discount": round(float(discount), 4),
        "category_key": q["key"],
        "category_label": q["label"],
        "model_group": grp,
        "city": it.get("city") or "",
        "distance_km": it.get("dist_km"),
        "listing_url": it["url"],
        "image_url": it.get("image_url"),
        "warning_flags": flags,
        "posted_at": it.get("date") or None,
        "detected_at": datetime.now(timezone.utc).isoformat(),
        "active": True,
    }
    endpoint = supabase_url + "/rest/v1/deals?on_conflict=listing_id"
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "apikey": service_key,
            "Authorization": "Bearer " + service_key,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            if response.status not in (200, 201, 204):
                log("Supabase: неожиданный HTTP статус", response.status)
                return False
        return True
    except Exception as exc:
        # Do not print request headers or secrets. Telegram notification remains independent.
        log("Supabase: не удалось сохранить объявление:", type(exc).__name__, str(exc)[:180])
        return False

def tg(method, payload):
    token = os.environ.get("TELEGRAM_TOKEN")
    if not token:
        raise RuntimeError("TELEGRAM_TOKEN is not configured")
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.load(r)

def send(text, dry=False):
    chat = os.environ.get("TELEGRAM_CHAT_ID")
    if dry or not os.environ.get("TELEGRAM_TOKEN") or not chat:
        print("---- (не отправлено, режим dry) ----\n" + text + "\n")
        return
    tg("sendMessage", {"chat_id": chat, "text": text, "parse_mode": "HTML", "disable_web_page_preview": False})

def format_deal(q, it, med, n, kind, discount, flags):
    lines = [
        f"🔥 <b>-{discount:.0%}</b> · {html.escape(q['label'])}",
        html.escape(it["title"]),
        f"💶 <b>€{it['price']:.0f}</b> (рынок ≈ €{med:.0f}, по {n} объявл., {'по модели' if kind == 'model' else 'грубая оценка по категории'})",
    ]
    place = it["city"] or "—"
    if it["dist_km"] is not None:
        place += f" · {it['dist_km']:.0f} км"
    lines.append("📍 " + html.escape(place))
    lines.extend("⚠️ " + html.escape(f) for f in flags)
    if discount > 0.6:
        lines.append("⚠️ подозрительно низкая цена: возможна подделка или мошенничество")
    lines.append(it["url"])
    return "\n".join(lines)

def run_once(cfg, db, dry=False):
    now = int(time.time())
    window = now - cfg.get("market_days", 21) * 86400
    min_n, fails, sent_count = cfg.get("min_samples", 8), 0, 0
    for q in cfg["queries"]:
        qkey = q["key"]
        existing = db.execute("SELECT COUNT(*) FROM listings WHERE qkey=?", (qkey,)).fetchone()[0]
        first_run = existing == 0
        pages = cfg.get("seed_pages", 5) if first_run else cfg.get("pages", 2)
        try:
            raw = fetch_query(cfg, q, pages)
        except Exception as e:
            log(f"[{qkey}] ошибка запроса: {e}")
            fails += 1
            time.sleep(random.uniform(2, 4))
            continue
        new_items = []
        for l in raw:
            it = parse_listing(l)
            if not accept(q, it, cfg):
                continue
            grp = group_of(q, it["text"])
            known = db.execute("SELECT 1 FROM listings WHERE id=?", (it["id"],)).fetchone()
            if known:
                db.execute("UPDATE listings SET last_seen=?, price=? WHERE id=?", (now, it["price"], it["id"]))
            else:
                db.execute("INSERT INTO listings VALUES(?,?,?,?,?,?,?)", (it["id"], qkey, grp, it["title"], it["price"], now, now))
                new_items.append((it, grp))
        db.commit()
        for it, grp in new_items:
            age = age_hours(it["date"])
            if age is None and first_run:
                continue
            if age is not None and age > cfg.get("max_age_hours", 36):
                continue
            if db.execute("SELECT 1 FROM sent WHERE id=?", (it["id"],)).fetchone():
                continue
            flags = risks(it)
            if flags is None:
                continue
            n, med = market_stats(db, qkey, grp, it["id"], window)
            kind, need = "model", q.get("threshold", 0.2)
            if grp == "all" or n < min_n or med is None:
                n, med = market_stats(db, qkey, None, it["id"], window)
                kind = "category"
                need = max(q.get("threshold", 0.2) + 0.15, 0.4) if grp != "all" else q.get("threshold", 0.2)
                if n < min_n * (2 if grp != "all" else 1) or med is None:
                    continue
            discount = 1 - it["price"] / med
            if discount < need:
                continue
            if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
                supabase_upsert_deal(q, it, med, discount, flags, grp)
            send(format_deal(q, it, med, n, kind, discount, flags), dry)
            db.execute("INSERT OR IGNORE INTO sent VALUES(?,?)", (it["id"], now))
            db.commit()
            sent_count += 1
        time.sleep(random.uniform(2, 4))
    db.execute("DELETE FROM listings WHERE last_seen<?", (now - 30 * 86400,))
    db.commit()
    if fails == len(cfg["queries"]):
        row = db.execute("SELECT v FROM meta WHERE k='warned'").fetchone()
        if not row or now - int(row[0]) > 6 * 3600:
            send("⚠️ Бот не смог получить данные с Marktplaats (возможно, блокировка или смена формата). Проверьте логи.", dry)
            db.execute("INSERT OR REPLACE INTO meta VALUES('warned',?)", (str(now),))
            db.commit()
    log(f"готово: отправлено {sent_count}, ошибок запросов {fails}")

def get_chat_id():
    data = tg("getUpdates", {})
    seen = set()
    for u in data.get("result", []):
        m = u.get("message") or u.get("edited_message") or {}
        c = m.get("chat")
        if c and c["id"] not in seen:
            seen.add(c["id"])
            print("chat_id:", c["id"], "-", c.get("first_name") or c.get("title"))
    if not seen:
        print("Сообщений нет. Откройте бота в Telegram, нажмите Start и запустите снова.")

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--loop", type=int, metavar="SEC", help="работать постоянно, проверяя каждые SEC секунд")
    ap.add_argument("--dry", action="store_true", help="печатать сделки в консоль вместо отправки в Telegram")
    ap.add_argument("--get-chat-id", action="store_true")
    ap.add_argument("--test-telegram", action="store_true")
    args = ap.parse_args()
    if args.get_chat_id:
        return get_chat_id()
    if args.test_telegram:
        return send("✅ Бот подключён, тестовое сообщение.")
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
        run_once(cfg, db, args.dry)

if __name__ == "__main__":
    sys.exit(main())

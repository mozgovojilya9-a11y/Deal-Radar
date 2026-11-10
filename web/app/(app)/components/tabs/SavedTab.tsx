"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { Deal } from "@/lib/deals";
import type { Purchase } from "@/lib/purchases";
import type { UserLocation } from "@/lib/settings";
import { DealGrid } from "../DealGrid";
import { Purchases } from "../Purchases";
import { plural } from "../ui";

/** Favourites (loaded by id, independent of filters) and the purchase log. */
export function SavedTab({ savedIds, onSavedIds, location, purchases, onPurchases, newIds, onSave, onOpen, onBrowse }: {
  savedIds: string[]; onSavedIds: (next: string[]) => void; location: UserLocation | null;
  purchases: Purchase[]; onPurchases: (next: Purchase[]) => void;
  newIds: Set<string>; onSave: (id: string) => void; onOpen: (deal: Deal) => void; onBrowse: () => void;
}) {
  const [view, setView] = useState<"saved" | "bought">("saved");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(savedIds.length > 0);
  const idKey = savedIds.join(",");

  useEffect(() => {
    if (!idKey) return;
    let cancelled = false;
    const params = new URLSearchParams({ ids: idKey });
    if (location) { params.set("lat", String(location.lat)); params.set("lon", String(location.lon)); }
    apiFetch("/api/deals?" + params, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => { if (!cancelled) setDeals(Array.isArray(data.deals) ? data.deals : []); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [idKey, location]);

  // Unsaving a card removes it at once, before the next request returns.
  const shown = savedIds.length ? deals.filter((deal) => savedIds.includes(deal.listing_id)) : [];
  const gone = savedIds.length - shown.length;

  return (
    <section className="content-section v2-section">
      <div className="seg" role="tablist" aria-label="Мои объявления">
        <button type="button" role="tab" aria-selected={view === "saved"} className={view === "saved" ? "on" : ""} onClick={() => setView("saved")}>Избранное<b>{savedIds.length}</b></button>
        <button type="button" role="tab" aria-selected={view === "bought"} className={view === "bought" ? "on" : ""} onClick={() => setView("bought")}>Мои покупки<b>{purchases.length}</b></button>
      </div>
      {view === "bought" ? <Purchases rows={purchases} onChange={onPurchases} /> : <>
        {savedIds.length && !loading && gone > 0 ? (
          <p className="v2-note"><span>{gone} {plural(gone, "объявление", "объявления", "объявлений")} больше нет в каталоге — вероятно, проданы или сняты.</span>
            <button type="button" onClick={() => { const alive = new Set(shown.map((deal) => deal.listing_id)); onSavedIds(savedIds.filter((id) => alive.has(id))); }}>Убрать их</button></p>
        ) : null}
        {loading && !shown.length ? <div className="deal-grid">{Array.from({ length: 3 }).map((_, index) => <div className="skeleton-card" key={index}><div /><span /><span /></div>)}</div>
          : shown.length ? <DealGrid deals={shown} savedIds={savedIds} newIds={newIds} resetKey="saved" onSave={onSave} onOpen={onOpen} />
            : <div className="state-panel"><div className="state-icon">♡</div><h3>Пока пусто</h3><p>Нажмите ♡ на карточке, чтобы сохранить объявление.</p><button className="secondary-button" onClick={onBrowse}>К находкам</button></div>}
      </>}
    </section>
  );
}

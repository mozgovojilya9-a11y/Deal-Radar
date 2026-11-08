"use client";

import { useEffect, useRef, useState } from "react";
import type { Deal } from "@/lib/deals";
import { DealCard } from "./DealCard";

const STEP = 24;

/** Renders cards in portions: long lists stay smooth inside Telegram. */
export function DealGrid({ deals, savedIds, newIds, resetKey, onSave, onOpen }: {
  deals: Deal[]; savedIds: string[]; newIds?: Set<string>; resetKey?: string; onSave: (id: string) => void; onOpen: (deal: Deal) => void;
}) {
  const [limit, setLimit] = useState(STEP);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const [previousKey, setPreviousKey] = useState(resetKey);
  if (previousKey !== resetKey) { setPreviousKey(resetKey); setLimit(STEP); }
  const more = deals.length > limit;

  useEffect(() => {
    if (!more || !sentinel.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) setLimit((value) => value + STEP); }, { rootMargin: "600px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [more, limit]);

  return (
    <>
      <div className="deal-grid">{deals.slice(0, limit).map((deal) => (
        <DealCard key={deal.listing_id} deal={deal} isNew={newIds?.has(deal.listing_id)} saved={savedIds.includes(deal.listing_id)} onSave={() => onSave(deal.listing_id)} onOpen={() => onOpen(deal)} />
      ))}</div>
      {more ? <div ref={sentinel} className="grid-more"><button type="button" className="secondary-button" onClick={() => setLimit((value) => value + STEP)}>Показать ещё · осталось {deals.length - limit}</button></div> : null}
    </>
  );
}

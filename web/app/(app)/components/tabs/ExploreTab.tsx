"use client";

import { useState } from "react";
import type { Deal } from "@/lib/deals";
import { CATEGORIES, CATEGORY_GROUPS } from "@/lib/categories";
import type { SearchSettings } from "@/lib/settings";
import { Research } from "../Research";
import { plural } from "../ui";

/** "Поиск": model research on Marktplaats, or the category list leading into the catalogue. */
export function ExploreTab({ settings, deals, category, onPickCategory, onOpen }: {
  settings: SearchSettings; deals: Deal[]; category: string; onPickCategory: (category: string) => void; onOpen: (deal: Deal) => void;
}) {
  const [view, setView] = useState<"categories" | "research">("research");
  const counts: Record<string, number> = {};
  for (const deal of deals) if (deal.status !== "candidate") counts[deal.category_key] = (counts[deal.category_key] || 0) + 1;

  return (
    <section className="content-section v2-section">
      <div className="seg" role="tablist" aria-label="Раздел">
        <button type="button" role="tab" aria-selected={view === "categories"} className={view === "categories" ? "on" : ""} onClick={() => setView("categories")}>Категории</button>
        <button type="button" role="tab" aria-selected={view === "research"} className={view === "research" ? "on" : ""} onClick={() => setView("research")}>Поиск модели</button>
      </div>
      {view === "research" ? <Research settings={settings} onOpen={onOpen} /> : (
        <>
          <div className="v2-head"><h2>Категории</h2><p>Количество — с учётом ваших фильтров. Нажмите, чтобы открыть находки.</p></div>
          <button type="button" className={"v2-all" + (!category ? " on" : "")} onClick={() => onPickCategory("")}><strong>Все находки</strong><span>{deals.length}</span></button>
          {CATEGORY_GROUPS.map((group) => {
            const items = CATEGORIES.filter((item) => item.group === group);
            const total = items.reduce((sum, item) => sum + (counts[item.key] || 0), 0);
            return (
              <div className="cg-group" key={group}>
                <button type="button" className="cg-group-head" onClick={() => onPickCategory("group:" + group)}><strong>{group}</strong><span>{total ? total + " " + plural(total, "находка", "находки", "находок") : "пока пусто"}</span></button>
                <div className="cg-chips">{items.map((item) => (
                  <button type="button" key={item.key} className={"preference-chip" + (counts[item.key] ? "" : " empty")} onClick={() => onPickCategory(item.key)}>{item.label}{counts[item.key] ? <b>{counts[item.key]}</b> : null}</button>
                ))}</div>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

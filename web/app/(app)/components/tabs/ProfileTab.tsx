"use client";

import { useState, type ReactNode } from "react";
import { categoryLabel } from "@/lib/categories";
import { radiusLabel, type SearchSettings } from "@/lib/settings";
import { euro } from "../ui";

export type TelegramProfile = { id: number; firstName: string; lastName: string; username: string };

export function ProfileTab({ profile, settings, activeCount, savedCount, hiddenCount, onOpenSettings, onShowSaved, onRestoreHidden, children }: {
  profile: TelegramProfile | null; settings: SearchSettings; activeCount: number; savedCount: number; hiddenCount: number; children?: ReactNode;
  onOpenSettings: () => void; onShowSaved: () => void; onRestoreHidden: () => void;
}) {
  const [copied, setCopied] = useState(false);
  function copyId() {
    if (!profile?.id) return;
    void navigator.clipboard?.writeText(String(profile.id)).then(() => setCopied(true)).catch(() => undefined);
  }
  return (
    <section className="content-section v2-section">
      <div className="v2-me">
        <div className="v2-ava" aria-hidden="true">{(profile?.firstName || "D").slice(0, 1).toUpperCase()}</div>
        <div><strong>{profile ? profile.firstName + (profile.lastName ? " " + profile.lastName : "") : "Гость"}</strong><span>{profile?.username ? "@" + profile.username : profile ? "Вход через Telegram" : "Откройте приложение из Telegram"}</span></div>
      </div>
      {children}
      <button type="button" className="v2-row" onClick={onOpenSettings}><span>Настройки поиска</span><b>{activeCount ? activeCount + " активных" : "по умолчанию"}</b></button>
      <div className="v2-card">
        <div className="v2-card-head"><h3>Сейчас применяется</h3></div>
        <ul className="settings-summary">
          <li><span>Локация</span><b>{settings.location ? settings.location.label : "не задана"}</b></li>
          <li><span>Радиус</span><b>{settings.location ? radiusLabel(settings.radiusKm) : "вся страна"}</b></li>
          <li><span>Цена</span><b>{settings.minPrice === null && settings.maxPrice === null ? "без ограничений" : (settings.minPrice !== null ? "от " + euro(settings.minPrice) + " " : "") + (settings.maxPrice !== null ? "до " + euro(settings.maxPrice) : "")}</b></li>
          <li><span>Скидка / прибыль / ROI</span><b>{settings.minDiscount ? "от " + settings.minDiscount + "%" : "любая"} · {settings.minProfit !== null ? "от " + euro(settings.minProfit) : "любая"} · {settings.minRoi !== null ? "от " + settings.minRoi + "%" : "любой"}</b></li>
          <li><span>Состояние</span><b>{settings.condition === "all" ? "новые и б/у" : settings.condition === "new" ? "только новые" : "только б/у"}{settings.exactOnly ? " · точная модель" : ""}</b></li>
          <li><span>Категории</span><b>{settings.categories.length ? settings.categories.map(categoryLabel).join(", ") : "все"}</b></li>
        </ul>
      </div>
      <button type="button" className="v2-row" onClick={onShowSaved}><span>Избранное</span><b>{savedCount || "пусто"}</b></button>
      {hiddenCount ? <button type="button" className="v2-row" onClick={onRestoreHidden}><span>Скрытые объявления</span><b>вернуть {hiddenCount}</b></button> : null}
      <div className="v2-card">
        <div className="v2-card-head"><h3>Уведомления в Telegram</h3></div>
        <p className="v2-hint">Новые Best и Good, а также снижение цены на них придут в чат с ботом, если в GitHub добавлены секреты TELEGRAM_TOKEN и TELEGRAM_CHAT_ID.</p>
        {profile?.id ? <button type="button" className="v2-row" onClick={copyId}><span>Ваш Telegram ID: {profile.id}</span><b>{copied ? "скопирован" : "скопировать"}</b></button> : null}
      </div>
      <p className="v2-hint">Избранное, поиски и настройки хранятся на этом устройстве. Переписка с AI не сохраняется нигде.</p>
    </section>
  );
}

"use client";

import type { CatalogCounts, ScannerStats } from "@/lib/deals";
import { ageLabel } from "./ui";

const fmt = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("ru-RU");

export function Analytics({ stats, counts, scannedAt }: { stats: ScannerStats | null; counts: CatalogCounts | null; scannedAt: string | null }) {
  if (!stats) {
    return <div className="state-panel"><h3>Ждём первый отчёт сканера</h3><p>Статистика появится после публикации нового сканирования.</p></div>;
  }
  const scanAgeHours = scannedAt ? (Date.now() - new Date(scannedAt).getTime()) / 3_600_000 : null;
  const verified = (stats.strongDeals ?? 0) + (stats.goodDeals ?? 0);
  const tiles: Array<{ label: string; value: number | null | undefined; hint: string; tone?: string }> = [
    { label: "Найдено", value: stats.unique, hint: "уникальных объявлений за запуск (" + fmt(stats.checked) + " строк выдачи)" },
    { label: "Проверено", value: stats.evaluated ?? stats.candidates, hint: "прошли оценку рынка и прибыли" },
    { label: "Новых", value: stats.newListings, hint: "впервые увидены сканером" },
    { label: "Отклонено", value: stats.rejectedTotal, hint: "аксессуары, другая модель, цена, риск, нет прибыли" },
    { label: "Кандидатов", value: stats.reviewCandidates, hint: "модель распознана, данных о цене пока мало" },
    { label: "Ждут переоценки", value: stats.awaitingRecheck, hint: "повторная проверка по расписанию" },
    { label: "Прошли проверку", value: verified, hint: "очень выгодные + хорошая цена", tone: "green" },
    { label: "Стали выгодными", value: stats.promoted, hint: "кандидаты, повышенные в этом запуске", tone: "green" },
    { label: "Тех. ошибки", value: stats.technicalErrors ?? stats.failedQueries, hint: "не проверены из-за сбоев запросов", tone: (stats.technicalErrors ?? stats.failedQueries) ? "warn" : "" },
  ];
  const reasons = [
    { label: "Не та модель / название", value: (stats.rejectedTitle ?? 0) + (stats.aiRejected ?? 0) },
    { label: "Аксессуары и детали", value: stats.rejectedAccessory ?? 0 },
    { label: "Цена «bieden» без выгоды / тип цены", value: stats.rejectedPriceType ?? 0 },
    { label: "Ниже порога цены категории", value: stats.rejectedPriceRange ?? 0 },
    { label: "Некорректные, лоты «2x»", value: stats.rejectedInvalid ?? 0 },
    { label: "Ссылка на внешний сайт", value: stats.rejectedExternalLink ?? 0 },
    { label: "Устаревшая модель ТВ", value: stats.rejectedOldModel ?? 0 },
    { label: "Старше 30 дней", value: (stats.rejectedAge ?? 0) + (stats.rejectedDateUnknown ?? 0) },
    { label: "Дефект / подделка", value: stats.rejectedRisk ?? 0 },
    { label: "Нет прибыли после расходов", value: (stats.rejectedProfit ?? 0) + (stats.rejectedDiscount ?? 0) },
  ].sort((a, b) => b.value - a.value);
  const total = Math.max(1, reasons.reduce((sum, item) => sum + item.value, 0));
  return (
    <section className="content-section analytics-section">
      <div className="section-heading">
        <div><h2>Работа сканера</h2><p>Последний запуск: {ageLabel(stats.finishedAt || scannedAt)} · {fmt(stats.queryCount)} категорий</p></div>
        <span className={"scanner-live" + (scanAgeHours !== null && scanAgeHours > 3 ? " stale" : "")}><i /> {scanAgeHours !== null && scanAgeHours > 3 ? "Данные устарели" : "Данные свежие"}</span>
      </div>
      {scanAgeHours !== null && scanAgeHours > 3 ? (
        <p className="v2-note"><span>Последнее сканирование было {Math.round(scanAgeHours)} ч назад. GitHub запускает расписание реже заявленного; каталог показывает последние проверенные данные.</span></p>
      ) : null}
      <div className="metric-grid">
        {tiles.map((tile) => (
          <div className={"metric-tile " + (tile.tone || "")} key={tile.label}>
            <span>{tile.label}</span><strong>{fmt(tile.value)}</strong><small>{tile.hint}</small>
          </div>
        ))}
      </div>
      <div className="metric-grid small">
        <div className="metric-tile"><span>В каталоге</span><strong>{fmt(counts?.feed)}</strong><small>активные объявления</small></div>
        <div className="metric-tile"><span>Проверено «живы ли»</span><strong>{fmt(stats.livenessChecked)}</strong><small>из них снято с продажи: {fmt(stats.verifiedInactive)}</small></div>
        <div className="metric-tile"><span>Понижены</span><strong>{fmt(stats.demoted)}</strong><small>рынок изменился, выгода пропала</small></div>
        <div className="metric-tile"><span>Ошибки запросов</span><strong>{fmt(stats.failedQueries)} / {fmt(stats.queryCount)}</strong><small>категорий Marktplaats</small></div>
      </div>
      {stats.externalOfferDomains && Object.keys(stats.externalOfferDomains).length ? (
        <div className="rejection-panel">
          <div className="rejection-heading"><div><h3>Независимые источники цен</h3></div><strong>{fmt(stats.externalValued)} <small>моделей оценено</small></strong></div>
          {Object.entries(stats.externalOfferDomains).map(([domain, count]) => {
            const max = Math.max(...Object.values(stats.externalOfferDomains || {}));
            return <div className="rejection-row" key={domain}><div className="rejection-label"><span>{domain}</span><strong>{fmt(count)}</strong></div><div className="rejection-track"><i className="rejection-fill samples" style={{ width: (count / max) * 100 + "%" }} /></div></div>;
          })}
          {stats.sourceHealth ? <p className="analytics-note">Ответили: {Object.entries(stats.sourceHealth).filter(([, h]) => h.ok > 0).map(([name]) => name).join(", ") || "—"}. Не ответили: {Object.entries(stats.sourceHealth).filter(([, h]) => h.ok === 0).map(([name, h]) => name + (h.lastError ? " (" + h.lastError + ")" : "")).join(", ") || "—"}. Marktplaats в оценку не входит.</p> : null}
        </div>
      ) : null}
      <div className="rejection-panel">
        <div className="rejection-heading"><div><h3>Почему отсеяны</h3></div><strong>{fmt(stats.rejectedTotal)} <small>всего</small></strong></div>
        {reasons.map((item) => (
          <div className="rejection-row" key={item.label}>
            <div className="rejection-label"><span>{item.label}</span><strong>{fmt(item.value)}</strong></div>
            <div className="rejection-track"><i className="rejection-fill discount" style={{ width: Math.min(100, (item.value / total) * 100) + "%" }} /></div>
          </div>
        ))}
        <p className="analytics-note">Числа — из последнего реального запуска сканера. Кандидаты не считаются отсеянными: они остаются в каталоге и перепроверяются по очереди.</p>
      </div>
    </section>
  );
}

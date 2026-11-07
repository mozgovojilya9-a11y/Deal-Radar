import { ImageResponse } from "next/og";
import { getDictionary, isLocale, LOCALES } from "@/lib/site/i18n";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Deal Radar";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

/** Social preview card shared by every page of a locale. */
export default async function OpenGraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = getDictionary(isLocale(locale) ? locale : "nl");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#0a0d11", color: "#f1f4f7", fontFamily: "sans-serif", position: "relative" }}>
        <div style={{ position: "absolute", right: -140, top: -140, width: 620, height: 620, borderRadius: 620, border: "2px solid rgba(190,205,222,.14)", display: "flex" }} />
        <div style={{ position: "absolute", right: -40, top: -40, width: 420, height: 420, borderRadius: 420, border: "2px solid rgba(190,205,222,.12)", display: "flex" }} />
        <div style={{ position: "absolute", right: 60, top: 60, width: 220, height: 220, borderRadius: 220, border: "2px solid rgba(167,243,107,.4)", display: "flex" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: "#a7f36b", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 34, height: 34, borderRadius: 34, border: "4px solid #0c1308", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 8, height: 8, borderRadius: 8, background: "#0c1308", display: "flex" }} />
            </div>
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>Deal Radar</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 900 }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2.5 }}>{t.hero.title}</div>
          <div style={{ fontSize: 30, color: "#a7f36b", fontWeight: 600 }}>{t.meta.tagline}</div>
        </div>
        <div style={{ display: "flex", gap: 28, fontSize: 24, color: "#8b98a7" }}>
          {t.hero.facts.map((fact) => <div key={fact} style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: "#a7f36b", display: "flex" }} />{fact}</div>)}
        </div>
      </div>
    ),
    size,
  );
}

import type { SiteFeed } from "@/lib/site/feed";
import type { Dictionary, Locale } from "@/lib/site/i18n";
import { LiveDemo } from "./LiveDemo";
import { SectionHead } from "./Sections";

export function DemoSection({ locale, t, feed }: { locale: Locale; t: Dictionary; feed: SiteFeed }) {
  return (
    <section className="sec" id="demo" aria-labelledby="demo-title">
      <div className="wrap">
        <SectionHead eyebrow={t.demo.eyebrow} title={t.demo.title} intro={t.demo.intro} />
        <LiveDemo deals={feed.deals} ok={feed.ok} locale={locale}
          t={{ deal: t.deal, demo: t.demo, categories: t.categories, common: t.common }} />
      </div>
    </section>
  );
}

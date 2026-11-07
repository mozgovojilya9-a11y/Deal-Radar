import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EMPTY_FEED, getSiteFeed } from "@/lib/site/feed";
import { getDictionary, href, isLocale, LOCALES, pageFromSlug, SLUGS, SUB_PAGES, type SubPageKey } from "@/lib/site/i18n";
import { absolute, pageMetadata } from "@/lib/site/seo";
import { AboutPage, CategoriesPage, ContactPage, FaqPage, FeaturesPage, HowPage, LegalPage } from "../../components/Pages";
import { JsonLd } from "../../components/JsonLd";

export const dynamicParams = false;
/** Pages with live feed data refresh at most every 5 minutes. */
export const revalidate = 300;

type Params = Promise<{ locale: string; slug: string }>;

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => SUB_PAGES.map((page) => ({ locale, slug: SLUGS[locale][page] })));
}

function resolve(locale: string, slug: string): { locale: "nl" | "en"; page: SubPageKey } | null {
  if (!isLocale(locale)) return null;
  const page = pageFromSlug(locale, slug);
  return page ? { locale, page } : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const target = resolve(locale, slug);
  return target ? pageMetadata(target.locale, target.page) : {};
}

const NEEDS_FEED: SubPageKey[] = ["how", "features", "categories"];

export default async function SubPage({ params }: { params: Params }) {
  const { locale: rawLocale, slug } = await params;
  const target = resolve(rawLocale, slug);
  if (!target) notFound();
  const { locale, page } = target;
  const t = getDictionary(locale);
  const feed = NEEDS_FEED.includes(page) ? await getSiteFeed() : EMPTY_FEED;
  const props = { locale, t, feed };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: t.common.breadcrumbHome, item: absolute(href(locale, "home")) },
      { "@type": "ListItem", position: 2, name: t.meta.pages[page].title.split(" — ")[0], item: absolute(href(locale, page)) },
    ],
  };
  const faq = page === "faq" ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: t.faq.items.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
  } : null;

  return (
    <>
      <JsonLd data={faq ? [breadcrumb, faq] : breadcrumb} />
      {page === "how" && <HowPage {...props} />}
      {page === "features" && <FeaturesPage {...props} />}
      {page === "categories" && <CategoriesPage {...props} />}
      {page === "about" && <AboutPage {...props} />}
      {page === "faq" && <FaqPage {...props} />}
      {page === "contact" && <ContactPage {...props} />}
      {page === "privacy" && <LegalPage locale={locale} t={t} doc="privacy" />}
      {page === "terms" && <LegalPage locale={locale} t={t} doc="terms" />}
    </>
  );
}


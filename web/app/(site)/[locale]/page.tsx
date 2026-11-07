import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteFeed } from "@/lib/site/feed";
import { getDictionary, href, isLocale, HTML_LANG } from "@/lib/site/i18n";
import { absolute, pageMetadata } from "@/lib/site/seo";
import { siteConfig } from "@/site-config";
import { CategoriesTeaser, Cta, FaqTeaser, FeatureGrid, Hero, Pipeline, Stats, Why } from "../components/Sections";
import { DemoSection } from "../components/DemoSection";
import { JsonLd } from "../components/JsonLd";

/** Re-render with the latest scanner feed at most every 5 minutes. */
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return pageMetadata(locale, "home");
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const feed = await getSiteFeed();

  const sameAs = [siteConfig.telegramUrl, siteConfig.instagramUrl, siteConfig.linkedinUrl, siteConfig.githubUrl].filter(Boolean);
  const structured = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: siteConfig.productName,
      url: absolute(href(locale, "home")),
      inLanguage: HTML_LANG[locale],
      description: t.meta.pages.home.description,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: siteConfig.productName,
      url: absolute(siteConfig.appPath),
      applicationCategory: "ShoppingApplication",
      operatingSystem: "Web, Telegram",
      description: t.meta.tagline,
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      areaServed: { "@type": "Country", name: "Netherlands" },
      ...(siteConfig.developerName ? { author: { "@type": "Person", name: siteConfig.developerName, ...(sameAs.length ? { sameAs } : {}) } } : {}),
    },
  ];

  return (
    <>
      <JsonLd data={structured} />
      <Hero locale={locale} t={t} feed={feed} />
      <Stats locale={locale} t={t} feed={feed} />
      <Pipeline locale={locale} t={t} />
      <DemoSection locale={locale} t={t} feed={feed} />
      <FeatureGrid locale={locale} t={t} />
      <CategoriesTeaser locale={locale} t={t} feed={feed} />
      <Why t={t} />
      <FaqTeaser locale={locale} t={t} />
      <Cta t={t} />
    </>
  );
}

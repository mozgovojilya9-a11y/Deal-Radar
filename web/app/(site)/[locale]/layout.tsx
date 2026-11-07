import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import "@fontsource-variable/manrope";
import "../site.css";
import { getDictionary, HTML_LANG, isLocale, LOCALES } from "@/lib/site/i18n";
import { siteConfig, siteUrl } from "@/site-config";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { RevealObserver } from "../components/Reveal";

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  applicationName: siteConfig.productName,
  authors: siteConfig.developerName ? [{ name: siteConfig.developerName }] : undefined,
  creator: siteConfig.developerName || undefined,
  formatDetection: { telephone: false, email: false, address: false },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0d11",
  colorScheme: "dark",
};

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  return (
    <html lang={HTML_LANG[locale]}>
      <body>
        <Header locale={locale} nav={t.nav} />
        <main id="main">{children}</main>
        <Footer locale={locale} t={t} />
        <RevealObserver />
      </body>
    </html>
  );
}

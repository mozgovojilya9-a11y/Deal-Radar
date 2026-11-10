import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deal Radar — умный поиск выгодных покупок",
  description: "Находите объявления Marktplaats заметно дешевле рыночной цены.",
  applicationName: "Deal Radar"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f3f5f8" }, { media: "(prefers-color-scheme: dark)", color: "#0b0e13" }]
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js?64" strategy="beforeInteractive" />
        {/* Theme before the first paint, so light-theme users never see a dark flash (kept in sync by components/theme.ts). */}
        <Script id="theme" strategy="beforeInteractive">{`try{var w=window.Telegram&&Telegram.WebApp,s=w&&w.platform&&w.platform!=="unknown"?w.colorScheme:null;document.documentElement.dataset.theme=s==="light"||s==="dark"?s:(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark")}catch(e){}`}</Script>
        {children}
      </body>
    </html>
  );
}

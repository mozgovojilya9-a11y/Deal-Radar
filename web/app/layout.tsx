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
  themeColor: "#0a0d12"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js?64" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}

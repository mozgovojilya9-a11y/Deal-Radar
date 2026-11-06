import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const designDocument = readFileSync(join(process.cwd(), "design", "index.html"), "utf8");
const styleStart = designDocument.indexOf("<style>");
const styleEnd = designDocument.indexOf("</style>", styleStart);
const designCss = styleStart >= 0 && styleEnd > styleStart
  ? designDocument.slice(styleStart + "<style>".length, styleEnd)
  : "";
if (!designCss.trim()) throw new Error("Design CSS was not found in design/index.html");

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
      <head><style dangerouslySetInnerHTML={{ __html: designCss }} /></head>
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js?64" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}

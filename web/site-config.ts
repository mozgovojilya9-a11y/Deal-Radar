/**
 * Public website configuration — the single place to edit contact details and branding.
 *
 * Every field is optional: leave a value as an empty string ("") and the website simply
 * hides that contact channel. Never put secrets (API keys, bot tokens) in this file — it is
 * bundled into public pages.
 */
type SiteConfig = {
  productName: string; companyName: string; developerName: string; contactEmail: string;
  telegramUrl: string; telegramLabel: string; whatsappUrl: string; phoneNumber: string; phoneDisplay: string;
  instagramUrl: string; linkedinUrl: string; githubUrl: string; location: string; appPath: string; telegramAppUrl: string;
};

export const siteConfig: SiteConfig = {
  /** Product / brand name shown in the header, footer and metadata. */
  productName: "Deal Radar",
  /** Legal or trading name. Leave empty while there is no registered company. */
  companyName: "",
  developerName: "Illia Mozghovoi",
  contactEmail: "mozgovojilya9@gmail.com",
  /** Telegram link. Currently the Deal Radar bot, which also opens the Mini App. */
  telegramUrl: "https://t.me/DeealRadarbot",
  telegramLabel: "@DeealRadarbot",
  whatsappUrl: "https://wa.me/380977107574",
  /** E.164 format, used for tel: links. */
  phoneNumber: "+380977107574",
  /** Human-readable phone number. */
  phoneDisplay: "+380 97 710 7574",
  instagramUrl: "",
  linkedinUrl: "",
  githubUrl: "",
  /** City / region shown on the contact page. Leave empty to hide. */
  location: "",
  /** Where the "Open Deal Radar" buttons lead: the existing web app at the site root. */
  appPath: "/",
  /** Telegram Mini App entry (BotFather menu button opens the app inside Telegram). */
  telegramAppUrl: "https://t.me/DeealRadarbot",
};

/**
 * Canonical origin for SEO (canonical URLs, sitemap, Open Graph).
 * Set NEXT_PUBLIC_SITE_URL in Vercel when a custom domain is connected; otherwise Vercel's
 * production domain is used automatically.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return "https://" + vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return "http://localhost:3000";
}

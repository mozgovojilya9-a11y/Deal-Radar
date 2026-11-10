"use client";

import { useEffect } from "react";

/** Background colour of each theme; mirrors --bg in globals.css. */
const BACKGROUND = { dark: "#0b0e13", light: "#f3f5f8" } as const;

function currentScheme(): "light" | "dark" {
  // Outside Telegram the script still reports "light" (platform "unknown"): only a real client's theme counts.
  const webApp = window.Telegram?.WebApp;
  const telegram = webApp && webApp.platform && webApp.platform !== "unknown" ? webApp.colorScheme : undefined;
  if (telegram === "light" || telegram === "dark") return telegram;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * Follows the Telegram theme (or the system theme in a browser): sets <html data-theme> and paints
 * Telegram's own header and background in the same colour, so there is no seam around the app.
 */
export function useTelegramTheme(): void {
  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    const media = window.matchMedia?.("(prefers-color-scheme: light)");
    const apply = () => {
      const scheme = currentScheme();
      document.documentElement.dataset.theme = scheme;
      webApp?.setHeaderColor?.(BACKGROUND[scheme]);
      webApp?.setBackgroundColor?.(BACKGROUND[scheme]);
      webApp?.setBottomBarColor?.(BACKGROUND[scheme]);
    };
    apply();
    webApp?.onEvent?.("themeChanged", apply);
    media?.addEventListener?.("change", apply);
    return () => {
      webApp?.offEvent?.("themeChanged", apply);
      media?.removeEventListener?.("change", apply);
    };
  }, []);
}

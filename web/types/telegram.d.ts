export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name?: string;
            username?: string;
          };
        };
        ready: () => void;
        expand: () => void;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
        setBottomBarColor?: (color: string) => void;
        /** "light" or "dark", following the user's Telegram theme. */
        colorScheme?: "light" | "dark";
        /** "ios", "android", "tdesktop"…; "unknown" when the page is opened outside Telegram. */
        platform?: string;
        onEvent?: (event: "themeChanged", callback: () => void) => void;
        offEvent?: (event: "themeChanged", callback: () => void) => void;
        BackButton?: {
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
        };
        HapticFeedback?: {
          impactOccurred: (style: "light" | "medium" | "heavy") => void;
          notificationOccurred: (type: "error" | "success" | "warning") => void;
        };
      };
    };
  }
}

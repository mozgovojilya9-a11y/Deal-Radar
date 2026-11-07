import type { SVGProps } from "react";

/** Single-stroke 24px icon set drawn for Deal Radar (no emoji, no icon font). */
const PATHS = {
  radar: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="M12 12 18.5 5.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  scan: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  identify: <><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" /><path d="M8 12.5 10.5 15 16 9" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" /></>,
  scale: <><path d="M12 4v16M7 20h10M5 8h14" /><path d="m5 8-3 6a3 3 0 0 0 6 0L5 8ZM19 8l-3 6a3 3 0 0 0 6 0l-3-6Z" /></>,
  filter: <path d="M4 5h16l-6 7.5V19l-4 1.5v-8L4 5Z" />,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  trend: <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  sliders: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  bars: <><path d="M5 20V11M12 20V5M19 20v-6" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  arrow: <path d="M5 12h14m-5-6 6 6-6 6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
  send: <path d="M21 3 3 10.5l7 2.5 2.5 7L21 3ZM10 13l4.5-4.5" />,
  chat: <><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19l-4 1Z" /><path d="M9 10.5c.3 1.7 2.3 3.6 4.5 4l1.2-1.2-1.7-.9-.8.6c-.8-.3-1.5-1-1.8-1.8l.6-.8-.9-1.7L9 10.5Z" /></>,
  phone: <path d="M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2 4.5 1.5V19a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z" />,
  instagram: <><rect x="4" y="4" width="16" height="16" rx="4.5" /><circle cx="12" cy="12" r="3.6" /><circle cx="16.8" cy="7.2" r=".6" fill="currentColor" /></>,
  linkedin: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8.5 10.5V16M8.5 8v.01M12 16v-3.2c0-1.4 1-2.3 2.2-2.3s2 .9 2 2.3V16M12 10.5V16" /></>,
  github: <path d="M9 19c-4 1.3-4-2-6-2.5m12 4.5v-3.5a3 3 0 0 0-.9-2.4c3-.3 6-1.4 6-6.5a5 5 0 0 0-1.4-3.5 4.7 4.7 0 0 0-.1-3.5s-1.1-.3-3.6 1.4a12.4 12.4 0 0 0-6.5 0C6 1.8 4.9 2.1 4.9 2.1a4.7 4.7 0 0 0-.1 3.5A5 5 0 0 0 3.4 9c0 5.1 3 6.2 6 6.5a3 3 0 0 0-.9 2.4V21" />,
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  shield: <><path d="M12 3 5 6v5c0 4.6 3 8.4 7 10 4-1.6 7-5.4 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>,
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />,
  // Category icons
  headphones: <><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4.5" height="6.5" rx="1.6" /><rect x="16.5" y="14" width="4.5" height="6.5" rx="1.6" /></>,
  glasses: <><circle cx="6.5" cy="14" r="3.5" /><circle cx="17.5" cy="14" r="3.5" /><path d="M10 14c1.2-1 2.8-1 4 0M3 13l1.5-6H7M21 13l-1.5-6H17" /></>,
  gamepad: <><path d="M7 7h10a5 5 0 0 1 4.9 6l-.6 3a2.6 2.6 0 0 1-4.6 1.2L15 15H9l-1.7 2.2a2.6 2.6 0 0 1-4.6-1.2l-.6-3A5 5 0 0 1 7 7Z" /><path d="M8 10v3M6.5 11.5h3" /><circle cx="15.5" cy="11" r=".8" fill="currentColor" /><circle cx="17.5" cy="12.8" r=".8" fill="currentColor" /></>,
  tv: <><rect x="3" y="5" width="18" height="12" rx="1.5" /><path d="M8 21h8M12 17v4" /></>,
  camera: <><path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.6" /></>,
  drone: <><rect x="9" y="10" width="6" height="4" rx="1" /><path d="M9 11 6 8M15 11l3-3M9 13l-3 3M15 13l3 3" /><path d="M3 8h6M15 8h6M3 16h6M15 16h6" /></>,
  bag: <><path d="M5 9h14l-1 11H6L5 9Z" /><path d="M9 9V7a3 3 0 0 1 6 0v2" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></>,
  smartphone: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
  laptop: <><rect x="5" y="5" width="14" height="10" rx="1.2" /><path d="M2.5 19h19l-2-4h-15l-2 4Z" /></>,
  watch: <><rect x="7" y="7" width="10" height="10" rx="3" /><path d="M9 7l.6-4h4.8L15 7M9 17l.6 4h4.8l.6-4M12 10v2.5l1.5 1" /></>,
  speaker: <><rect x="6" y="3" width="12" height="18" rx="2" /><circle cx="12" cy="14" r="3" /><circle cx="12" cy="7.5" r="1" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {PATHS[name]}
    </svg>
  );
}

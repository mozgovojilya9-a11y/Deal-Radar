/**
 * Free-text product queries -> clean model names: Cyrillic / Russian product words, common
 * spelling variants and single-typo correction against a vocabulary of known brands and models.
 */
import { CATEGORIES } from "./categories";

const RUSSIAN: Array<[RegExp, string]> = [
  [/айфон|ай\s?фон/gi, "iPhone"], [/айпад/gi, "iPad"], [/макбук/gi, "MacBook"], [/эйр\s?подс|аирподс|эйрподс/gi, "AirPods"],
  [/плей\s?стейшн|плейстейшен|плейстейшн|пс\s?(\d)/gi, "PlayStation $1"], [/самсунг/gi, "Samsung"], [/галакси/gi, "Galaxy"],
  [/(?<!\p{L})сони(?!\p{L})/giu, "Sony"], [/рей\s?бен|рейбан|рэй\s?бэн/gi, "Ray-Ban"], [/(?<!\p{L})мета(?!\p{L})/giu, "Meta"], [/дайсон/gi, "Dyson"],
  [/нинтендо/gi, "Nintendo"], [/свитч/gi, "Switch"], [/иксбокс/gi, "Xbox"], [/дрон|квадрокоптер/gi, "drone"],
  [/телевизор|телик/gi, "TV"], [/наушники/gi, "koptelefoon"], [/часы/gi, "horloge"], [/фотоаппарат|камера/gi, "camera"],
  [/объектив/gi, "lens"], [/гоу\s?про/gi, "GoPro"], [/джи\s?ай|дджи/gi, "DJI"], [/эппл|эпл/gi, "Apple"],
  [/(?<!\p{L})про(?!\p{L})/giu, "Pro"], [/(?<!\p{L})макс(?!\p{L})/giu, "Max"], [/(?<!\p{L})мини(?!\p{L})/giu, "Mini"], [/(?<!\p{L})ультра(?!\p{L})/giu, "Ultra"], [/(?<!\p{L})слим(?!\p{L})/giu, "Slim"], [/(?<!\p{L})плюс(?!\p{L})/giu, "Plus"], [/(?<!\p{L})эйр(?!\p{L})/giu, "Air"],
  [/(?<!\p{L})(?:вотч|воч)(?!\p{L})/giu, "Watch"], [/(?<!\p{L})(?:джибиэль|джбл)(?!\p{L})/giu, "JBL"], [/(?<!\p{L})тиссот(?!\p{L})/giu, "Tissot"],
  [/(?<!\p{L})(?:стим\s?дек)(?!\p{L})/giu, "Steam Deck"], [/(?<!\p{L})м(\d)(?!\d)/giu, "M$1"],
  [/(?<!\p{L})поколени[ея](?!\p{L})/giu, "gen"], [/(?<!\p{L})гб(?!\p{L})/giu, "GB"], [/(?<!\p{L})тб(?!\p{L})/giu, "TB"],
];

const VOCABULARY = [...new Set([
  ...CATEGORIES.flatMap((item) => item.label.toLowerCase().split(/[\s/|]+/)),
  "iphone", "ipad", "macbook", "airpods", "playstation", "samsung", "galaxy", "sony", "rayban", "meta", "wayfarer", "dyson",
  "nintendo", "switch", "xbox", "series", "steam", "deck", "apple", "watch", "ultra", "slim", "digital", "disc", "pro", "max",
  "mini", "plus", "oled", "qled", "bravia", "canon", "nikon", "fujifilm", "panasonic", "gopro", "hero", "drone", "avata", "mavic",
  "airwrap", "supersonic", "sonos", "bose", "sennheiser", "beats", "garmin", "pixel", "galaxy", "headphones", "koptelefoon",
  "generation", "edition", "console",
].filter((word) => word.length >= 4))];

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

export function understandQuery(raw: string): { query: string; corrections: string[] } {
  let query = raw.trim().replace(/\s+/g, " ");
  const corrections: string[] = [];
  for (const [pattern, replacement] of RUSSIAN) {
    const next = query.replace(pattern, (...args) => replacement.replace("$1", typeof args[1] === "string" ? args[1] : "").trim());
    if (next !== query) { query = next; }
  }
  if (query !== raw.trim()) corrections.push(raw.trim() + " → " + query);
  const words = query.split(" ").map((word) => {
    const lower = word.toLowerCase();
    if (lower.length < 4 || /\d/.test(lower) || VOCABULARY.includes(lower)) return word;
    const limit = lower.length >= 7 ? 2 : 1;
    const best = VOCABULARY.map((candidate) => ({ candidate, d: distance(lower, candidate) }))
      .filter((row) => row.d <= limit && Math.abs(row.candidate.length - lower.length) <= limit)
      .sort((a, b) => a.d - b.d)[0];
    if (!best) return word;
    corrections.push(word + " → " + best.candidate);
    return best.candidate;
  });
  return { query: words.join(" ").replace(/\s+/g, " ").trim(), corrections };
}

/**
 * Product identity extraction and offer matching.
 *
 * Identity is derived deterministically from the listing title (and optional
 * model group), so different generations, capacities or editions are never
 * merged into one price.
 */

export type MatchLevel = "exact" | "variant" | "similar" | "accessory" | "mismatch";

export type ProductIdentity = {
  raw: string;
  /** Clean name used in search queries, e.g. "Ray-Ban Meta Wayfarer Gen 2". */
  searchName: string;
  /** Alternative spellings / aliases used for extra searches. */
  aliases: string[];
  brand: string | null;
  /** Normalized tokens that describe the product family. */
  coreTokens: string[];
  /** Tokens that must match (model numbers, generations, model codes). */
  criticalTokens: string[];
  /** Explicit article / model codes, e.g. RW4012, CFI-2016, MTJV3. */
  modelCodes: string[];
  /** Edition differentiators that change the product, e.g. pro, max, slim. */
  editions: string[];
  storage: string | null;
  /** All capacities named in the title (RAM and storage), e.g. ["18gb", "512gb"]. */
  capacities: string[];
  screenSize: string | null;
  /** Accessory words explicitly present in the query (then accessories are wanted). */
  wantsAccessory: boolean;
};

export type MatchResult = { level: MatchLevel; score: number; reason: string };

const BRANDS = [
  "apple", "samsung", "sony", "playstation", "nintendo", "microsoft", "xbox", "google", "oneplus", "xiaomi",
  "huawei", "oppo", "nothing", "motorola", "lg", "philips", "panasonic", "hisense", "tcl", "sharp", "toshiba",
  "canon", "nikon", "fujifilm", "olympus", "om system", "leica", "gopro", "insta360", "dji", "bose", "sennheiser",
  "jbl", "beats", "marshall", "bang olufsen", "sonos", "shure", "rode", "audio technica", "garmin", "fitbit",
  "rayban", "meta", "michael kors", "fjallraven", "north face", "osprey", "deuter", "eastpak", "casio", "tissot",
  "diesel", "hugo boss", "boss", "tommy hilfiger", "dyson", "lenovo", "dell", "hp", "asus", "acer", "msi",
  "razer", "logitech", "sandisk", "steam", "valve", "kitchenaid", "delonghi", "nespresso", "philips hue", "bosch", "miele",
  "sigma", "tamron", "sennheiser", "airpods", "macbook", "ipad", "iphone",
];

const EDITION_WORDS = new Set([
  "pro", "max", "mini", "plus", "ultra", "lite", "slim", "digital", "disc", "se", "air", "fe", "oled", "neo",
  "studio", "go", "edge", "fold", "flip", "xl", "classic", "sport", "active", "kids", "shield", "touch",
]);
/** Pairs that are mutually exclusive configurations. */
const EXCLUSIVE_EDITIONS: Array<[string, string]> = [["digital", "disc"], ["wifi", "cellular"], ["wifi", "5g"]];

const ACCESSORY_WORDS = [
  "hoesje", "hoes", "case", "cover", "sleeve", "skin", "sticker", "screenprotector", "screen protector",
  "beschermglas", "tempered glass", "standaard", "stand", "houder", "mount", "oplader", "charger", "lader",
  "kabel", "cable", "adapter", "dock", "laadstation", "oplaadstation", "controller", "dualsense", "headset",
  "game", "games", "spel", "spellen", "oorkussens", "ear pads", "earpads", "eartips", "oordopjes los",
  "vervangende", "replacement", "reserve", "onderdeel", "onderdelen", "parts", "batterij", "accu", "battery",
  "lens cap", "lensdop", "filter", "strap", "bandje", "band", "armband", "draagtas", "tas voor", "etui",
  "pouch", "doos", "box only", "lege doos", "empty box", "remote", "afstandsbediening", "koffer", "decal",
  "faceplate", "cooling", "ventilator", "geheugenkaart", "sd kaart", "oplaadcase", "laadcase",
  "charging case", "losse", "los", "linker", "rechter", "left earbud", "right earbud", "oordopje", "links",
  "rechts", "enkele", "single", "conversion kit", "housing", "onderwaterbehuizing", "underwater", "cage",
  "battery grip", "batterijgrip", "batteriegriff", "grip", "rig", "gimbal",
  // Vinted and Kleinanzeigen are international: German, French, Portuguese, Spanish, Italian.
  "ladecase", "ladeetui", "ladegerat", "ladekabel", "hulle", "huelle", "schutzhulle", "ersatz", "einzeln",
  "coque", "chargeur", "boitier", "remplacement", "gauche", "droite", "ecouteur seul",
  "caixa", "caixa de carregamento", "estojo", "capa", "carregador", "esquerdo", "direito",
  "funda", "cargador", "estuche", "izquierdo", "derecho", "custodia", "caricatore", "sinistro", "destro",
];
const ACCESSORY_RE = new RegExp(
  "(?:^|[^a-z0-9])(?:" + ACCESSORY_WORDS.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")).join("|") + ")(?=$|[^a-z0-9])",
  "i",
);
/** "voor PS5", "for AirPods", "geschikt voor" -> a product made for the device, not the device. */
const FOR_DEVICE_RE = /(?:^|\s)(?:voor|for|geschikt\s+voor|compatible\s+(?:with|met)|compatibel\s+met|past\s+op)\s+/i;
const BUNDLE_RE = /(?:\+|\bmet\b|\bwith\b|\bincl\.?\b|\binclusief\b|\bincluding\b|\bbundel\b|\bbundle\b|\bset\b)/i;

const NOISE_WORDS = new Set([
  "nieuw", "nieuwstaat", "new", "used", "gebruikt", "tweedehands", "zgan", "zo", "goed", "als", "z.g.a.n",
  "perfect", "staat", "prima", "mooie", "mooi", "nette", "netjes", "top", "te", "koop", "aangeboden", "gratis",
  "verzending", "verzenden", "garantie", "bon", "factuur", "doos", "originele", "origineel", "sealed", "geseald",
  "ongeopend", "compleet", "complete", "met", "en", "de", "het", "een", "the", "a", "and", "with", "in", "of",
  "zwart", "wit", "black", "white", "grijs", "grey", "gray", "zilver", "silver", "blauw", "blue", "rood", "red",
  "groen", "green", "goud", "gold", "roze", "pink", "paars", "purple", "matte", "mat", "glossy", "shiny",
  "only", "alleen", "bijna", "zeer", "super", "koopje", "ophalen", "nu", "voor", "for", "edition", "versie",
  "model", "uitvoering", "stuk", "stuks", "incl", "inclusief", "excl", "originele", "amper", "weinig", "gebruikt",
  "smartbril", "smart", "glasses", "bril", "zonnebril", "gepolariseerd", "polarized", "lenses", "glazen",
  "goede", "clicks", "body", "camera", "systeemcamera", "horloge",
  "tas", "handtas", "schoudertas", "rugzak", "heren", "dames", "herenhorloge", "dameshorloge", "koptelefoon",
  "vaste", "prijs", "chip", "ram", "swiss", "made", "staal", "datum", "leer", "leren",
]);

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/ray[\s-]*ban/g, "rayban")
    .replace(/play\s*station/g, "playstation")
    // Dutch/German edition wording: "Digitale Editie", "mit/ohne Laufwerk".
    .replace(/\bdigitale\b/g, "digital").replace(/\b(?:editie|edizione)\b/g, "edition")
    .replace(/\bohne\s+laufwerk\b/g, "digital").replace(/\b(?:mit|met)\s+(?:disc\s*)?laufwerk\b/g, "disc")
    .replace(/\bps\s*(\d)\b/g, "playstation $1")
    .replace(/\b(\d)(?:st|nd|rd|th|e|de|ste)\s*(?:gen(?:eration|eratie)?\.?)/g, "gen $1")
    .replace(/\b(?:gen(?:eration|eratie)?\.?)\s*(\d)\b/g, "gen $1")
    .replace(/\bmark\s*(ii|iii|iv|v|vi)\b/g, (_, roman: string) => "mark " + ({ ii: 2, iii: 3, iv: 4, v: 5, vi: 6 } as Record<string, number>)[roman])
    .replace(/\bm\s*k\s*(\d)\b/g, "mark $1")
    // "EOS R6 II" / "A7 III" name the generation without the word "Mark".
    .replace(/\b([a-z]{1,3}\d{1,4})\s*(ii|iii|iv)\b/g, (_, model: string, roman: string) => model + " mark " + ({ ii: 2, iii: 3, iv: 4 } as Record<string, number>)[roman])
    .replace(/(\d)\s*(?:gb|gig)\b/g, "$1gb")
    .replace(/(\d)\s*tb\b/g, "$1tb")
    .replace(/(\d{2})[.,]\d\s*(?:inch|inches|in|"|”|''|-inch)(?=[\s)\]]|$)/g, "$1inch")
    .replace(/(\d{2})\s*(?:inch|inches|in|"|”|''|-inch)(?=[\s)\]]|$)/g, "$1inch")
    .replace(/[^a-z0-9.\s-]+/g, " ")
    .replace(/(?<=[a-z])-(?=\d)|(?<=\d)-(?=[a-z])/g, "")
    .replace(/\s+-\s+|\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value).split(/[\s.-]+/).filter(Boolean);
}

/** Tokens plus compounds of a word followed by a small number ("pro 2" -> "pro2"). */
function tokensWithCompounds(value: string): string[] {
  const tokens = tokenize(value);
  const result = [...tokens];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    // Years ("pro 2026") are not generations or model numbers.
    if (/^[a-z]+$/.test(tokens[index]) && /^\d{1,4}$/.test(tokens[index + 1]) && !/^(?:19|20)\d{2}$/.test(tokens[index + 1])) {
      result.push(tokens[index] + tokens[index + 1]);
    }
  }
  return result;
}

const MODEL_CODE_RE = /\b(?=[a-z0-9-]*\d)(?=[a-z0-9-]*[a-z])[a-z]{1,5}-?\d{2,5}[a-z0-9-]{0,6}\b/gi;

function extractModelCodes(raw: string): string[] {
  const codes = new Set<string>();
  const text = raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  for (const match of text.matchAll(MODEL_CODE_RE)) {
    const code = match[0].toLowerCase().replace(/-/g, "");
    if (/^\d+gb$|^\d+tb$|^\d+inch$|^gen\d$|^\d+mm$|^\d+mp$|^\d+hz$|^\d+w$|^\d+mah$/.test(code)) continue;
    if (/^(iphone|galaxy|pixel|playstation|xbox|series|gen|mark|pro|max|mini|plus|ultra|air)\d+$/.test(code)) continue;
    if (code.length < 4) continue;
    codes.add(code);
  }
  return [...codes].slice(0, 4);
}

function detectBrand(normalized: string): string | null {
  for (const brand of BRANDS) {
    if (new RegExp("(?:^|\\s)" + brand.replace(/ /g, "\\s+") + "(?:\\s|$)").test(normalized)) return brand;
  }
  return null;
}

const COLOUR_WORDS = "midnight|starlight|space\\s*gr[ae]y|spacegrijs|spacegrey|sterrenlicht|middernacht|titanium\\s+\\w+|titanium|natural|zilver|silver|goud|gold|roze|rose|paars|purple|blauw|blue|groen|green|grijs|grey|gray|zwart|black|wit|white|cream|creme|beige|graphite|grafiet|aquamarijn|ultramarijn|ultramarine|teal|lavendel|lavender|mint|koraal|coral|geel|yellow|oranje|orange|rood|red|pink|bruin|brown|antraciet|anthracite";

/**
 * The product name without seller wording: battery health, OS version, condition, trade-in and
 * warranty remarks, colours and "+ extras". Such words are not the product: left in, they end up in
 * the search query (no results) and in the required model tokens (every real offer is rejected).
 */
export function stripSellerNoise(title: string): string {
  const phones = /\b(?:iphone|galaxy)\b/i.test(title);
  let text = String(title || "").slice(0, 200)
    .replace(/[|•·–—!?*()[\]~]/g, " ")
    .replace(/[^\p{L}\p{N}\s.,'"’”/+&€%:;-]/gu, " ")
    // Price talk: "€ 570", "375 vaste prijs", "nu voor €89.99".
    .replace(/(?:\b(?:nu\s+)?(?:voor|vanaf|slechts)\s+)?€\s?\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s?(?:€|euro\b|eur\b)/gi, " ")
    .replace(/(?:\b\d{2,5}\s+)?\b(?:vaste?\s*prij\w*|vraagprijs|vanafprijs|bieden)\b/gi, " ")
    // Usage remarks: shutter count, battery cycles, keyboard layout, grade.
    .replace(/\b\d+(?:[.,]\d+)?\s?k?\s*(?:clicks?|kliks?)\b|\b(?:laad)?cycl(?:i|us|ussen|es?)?\s*:?\s*\d+\b|\b\d+\s*(?:laad)?cycl(?:i|us|ussen|es?)?\b/gi, " ")
    .replace(/\b(?:qwert[yz]?|qwer|azerty)\b|\b[a-c][\s-]?grade\b|\bgrade\s+[a-c]\b/gi, " ")
    .replace(/\b\d{1,2}\s?c(?:ore)?\s*(?:cpu|gpu)\b|\b(?:cpu|gpu)\b/gi, " ")
    .replace(/\b(?:lichte|minimale|weinig|geen|kleine)?\s*gebruik(?:er)?ssporen\b/gi, " ")
    .replace(/\b(?:heren|dames|kinder|unisex)?(?:horloge|uurwerk)\b|\b(?:heren|dames|unisex)\b|\bswiss\s+made\b|\b(?:staal|datum)\b/gi, " ")
    .replace(/\s(?:ll|\/\/+)(?=\s)/gi, " ")
    .replace(/,(?=\s|$)/g, " ")
    .replace(/\b\d{1,3}(?:[.,]\d{3})*\s*(?:clicks?|kliks?|ausl(?:ö|oe?)sungen)\b/gi, " ")
    .replace(/\b\d{1,3}\s?%\s*(?:batterij\w*|baterij\w*|accu\w*|battery\w*|bc\b)?|\b(?:batterij\w*|baterij\w*|accu\w*|battery\w*)\s*:?\s*\d{1,3}\s?%/gi, " ")
    .replace(/\b(?:ios|ipados|macos|watchos|android|one\s*ui)\s*\d+(?:\.\d+)*/gi, " ")
    .replace(/\b\d{2,3}\s?hz(?:\s+oled)?\b/gi, " ")
    .replace(/\b\d+\s+kleuren\b/gi, " ")
    .replace(/\bdual[\s-]*sim\b/gi, " ")
    .replace(new RegExp("\\b(?:" + COLOUR_WORDS + ")\\b", "gi"), " ")
    .replace(/^\s*(?:te\s?koop(?:\s+of\s+inruilen)?|complete set|complete|compleet|complet|set)\s+/i, " ")
    .replace(/^(?:\s*(?:selling|my|verkoop|ik|mijn|aangeboden|nette|net|en|goed|goede|mooie|mooi|zeer|hele|super|prachtige|originele|a|the|een|de)(?=\s))+/i, " ")
    // Everything after "+", "met", "incl" describes extras, not the product.
    .replace(/\s(?:\+|met|incl\.?|inclusief|with|including)(?:\s.*)?$/i, " ")
    .replace(/\+.*$/, " ")
    .replace(/\b(?:in\s+)?(?:zeer|heel|super|erg|hele)?\s*(?:nette|net|netjes|mooie|mooi|goede|prima|perfecte|perfect|top|nieuwe)\s+(?:staat|conditie)\b/gi, " ")
    .replace(/\b(?:zeer|heel|super|erg)\s+(?:nette|net|netjes|mooie|mooi|goede|goed)\b/gi, " ")
    .replace(/\b(?:netjes|krasvrij\w*|gloednieuw\w*|ongedragen|etc\.?|accu|batterij|baterij)(?=\s|$)/gi, " ")
    .replace(/\b(?:compleet|complete)(?:\s+en)?(?=\s|$)/gi, " ")
    .replace(/\binruil\w*(?:\s+mogelijk)?\b/gi, " ")
    .replace(/\b(nieuw(staat)?(\s+en)?|new|used|gebruikt|tweedehands|zgan|z\.g\.a\.n\.?|zo goed als nieuw|als nieuw|in doos|met doos|sealed|geseald|ongeopend|garantie|bon|factuur|te\s?koop|koopje)(?=\s|$)/gi, " ");
  if (phones) text = text.replace(/\b[45]g\b/gi, " ");
  return text
    .replace(/\s[-,;:/.]+(?=\s)/g, " ")
    .replace(/(?<=[a-z])\.(?=\s|$)/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/(?:\s+(?:en|of|met|voor|-))+\s*$/i, "")
    .replace(/[\s,;:–-]+$/, "")
    .trim();
}

export function buildIdentity(title: string, hint?: string | null): ProductIdentity {
  const raw = String(title || "").slice(0, 200);
  const cleanWords = stripSellerNoise(raw);
  // Model features come from the cleaned name: "99% batterij", colours or "nieuw" are not product identity.
  const identitySource = cleanWords.length >= 4 ? cleanWords : raw;
  const normalized = normalizeText(identitySource + (hint ? " " + hint : ""));
  const tokens = tokensWithCompounds(normalized);
  const capacities = [...new Set([...normalized.matchAll(/\b(\d{1,4}(?:gb|tb))\b/g)].map((m) => m[1]))];
  const storage = capacities.find((value) => /tb$/.test(value) || Number.parseInt(value, 10) >= 64) ?? null;
  const screenSize = normalized.match(/\b(\d{2})inch\b/)?.[1] ?? null;
  const modelCodes = extractModelCodes(raw);
  const editions = tokens.filter((token) => EDITION_WORDS.has(token));
  const coreTokens = [...new Set(tokenize(normalized)
    .filter((token) => !NOISE_WORDS.has(token) && token !== "gen" && token.length >= 2 && !/^(?:19|20)\d{2}$/.test(token) && !/^\d+(?:gb|tb|inch)$/.test(token)))].slice(0, 10);
  const criticalTokens = [...new Set(tokens.filter((token) =>
    /^[a-z]+\d{1,4}$/.test(token) || (/\d/.test(token) && /[a-z]/.test(token) && !/^\d+(?:gb|tb|inch)$/.test(token))
  ))].filter((token) => !/^\d+$/.test(token)).slice(0, 8);
  const rawNormalized = normalizeText(raw);
  const wantsAccessory = ACCESSORY_RE.test(rawNormalized) && !BUNDLE_RE.test(rawNormalized);
  const searchName = (cleanWords.length >= 4 ? cleanWords : raw)
    .replace(/\b(smartbril|smart glasses|bril|zonnebril|console|koptelefoon|headphones|oordopjes|earbuds)\b\s*[-–,]?\s*$/i, (word) => /console/i.test(word) ? word : "")
    .replace(/[\s,;:–-]+$/, "")
    .split(/\s+/).slice(0, 9).join(" ").trim();
  const aliases = new Set<string>();
  const lower = normalizeText(searchName);
  if (/rayban/.test(lower)) aliases.add(searchName.replace(/ray[\s-]*ban/i, "Ray-Ban Meta").replace(/meta\s+meta/i, "Meta"));
  if (/playstation (\d)/.test(lower)) aliases.add(searchName.replace(/play\s*station\s*(\d)/i, "PS$1"));
  if (/\bps(\d)\b/i.test(searchName)) aliases.add(searchName.replace(/\bps\s*(\d)\b/i, "PlayStation $1"));
  if (/gen (\d)/.test(lower)) aliases.add(searchName.replace(/\b(?:gen(?:eration|eratie)?\.?)\s*(\d)\b/i, "($1e generatie)").replace(/\b(\d)(?:st|nd|rd|th)\s*gen\w*/i, "($1e generatie)"));
  for (const code of modelCodes) aliases.add(code.toUpperCase());
  aliases.delete(searchName);
  return {
    raw,
    searchName,
    aliases: [...aliases].filter((alias) => alias.length >= 3).slice(0, 4),
    brand: detectBrand(normalized),
    coreTokens,
    criticalTokens,
    modelCodes,
    editions: [...new Set(editions)],
    storage,
    capacities,
    screenSize,
    wantsAccessory,
  };
}

/** Accessory check that also recognises "Hoesje voor PS5" / "Case for AirPods Pro 2". */
export function looksLikeAccessory(candidate: string, identity: ProductIdentity): boolean {
  if (identity.wantsAccessory) return false;
  const normalized = normalizeText(candidate);
  // "geschikt voor" / "compatible with" always marks a third-party accessory or part.
  if (/\b(?:geschikt\s+voor|compatible\s+(?:with|met)|compatibel\s+met|past\s+op|suitable\s+for)\b/.test(normalized)) return true;
  const firstCore = identity.coreTokens.find((token) => normalized.includes(token));
  const forDevice = FOR_DEVICE_RE.exec(" " + normalized);
  if (forDevice && firstCore && normalized.indexOf(firstCore) > (forDevice.index ?? 0)) {
    const before = normalized.slice(0, forDevice.index);
    // "PS5 console voor ..." is still a console; "Standaard voor PS5" is not.
    if (!identity.coreTokens.some((token) => before.includes(token))) return true;
  }
  // Single earbuds, charging cases and spare parts are parts wherever the word appears.
  if (/\b(?:links|rechts|linker|rechter|left|right|enkele|single|oplaadcase|laadcase|ladecase|lade case|ladeetui|charging case|losse?|los|nur|seul|seulement|solo|apenas|droit|gauche)\b(?!\s+(?:en|and|und|et|\+)\s+(?:rechts|links|right|left|droit|gauche))/.test(normalized)
      && !/\b(?:links en rechts|links und rechts|left and right|beide|both|compleet|complete|komplett|set)\b/.test(normalized)
      && !/\b(?:met|mit|with|con|avec|com|incl|inkl|inclusief|inklusive)\s+(?:[a-z0-9]+[\s-]+){0,3}(?:oplaadcase|laadcase|ladecase|lade case|charging case|boitier|caja|estuche|custodia)\b/.test(normalized)) return true;
  if (!ACCESSORY_RE.test(normalized)) return false;
  // A bundle such as "PS5 Slim + 2 controllers" is the device with extras.
  const accessoryIndex = normalized.search(ACCESSORY_RE);
  const bundleIndex = normalized.search(BUNDLE_RE);
  if (bundleIndex >= 0 && bundleIndex < accessoryIndex) return false;
  if (/\b(console|toestel|device|set|compleet|complete)\b/.test(normalized) && accessoryIndex > 0) return false;
  // Accessory word before any product token, e.g. "Controller PS5".
  const coreIndex = firstCore ? normalized.indexOf(firstCore) : -1;
  return coreIndex < 0 || accessoryIndex <= coreIndex || /\b(los|losse|only|alleen|vervangend|vervangende|replacement)\b/.test(normalized);
}

/** Brands implied by a product family name. */
const IMPLIED_BRAND: Record<string, string> = {
  playstation: "sony", airpods: "apple", iphone: "apple", ipad: "apple", macbook: "apple", imac: "apple",
  galaxy: "samsung", pixel: "google", xbox: "microsoft", switch: "nintendo", wayfarer: "rayban",
};
/** Family words whose number defines a different product, not a generation (PS4 vs PS5). */
const FAMILY_WORDS = new Set(["playstation", "iphone", "galaxy", "xbox", "ipad", "pixel", "switch", "series"]);

function codeCore(code: string): string {
  return code.replace(/^[a-z]{1,3}(?=\d)/, "");
}

/** A core made of digits only ("H1000" -> "1000") says nothing: B1000 and H1000 share it. */
function coreIsDistinctive(code: string): boolean {
  const core = codeCore(code);
  return core.length >= 5 && /[a-z]/.test(core);
}

/** Series + model pairs written as GPR-H1000: both halves identify the product. */
function seriesCodes(value: string): Array<[string, string]> {
  return [...value.normalize("NFKD").toLowerCase().matchAll(/\b([a-z]{2,4})-?([a-z]\d{3,5})(?![0-9])/g)]
    .map((match) => [match[1], match[2]] as [string, string]);
}

/** Substring match in the space-less text that does not run into more digits ("pro2" must not match "pro2026"). */
function joinedHas(joined: string, token: string): boolean {
  if (token.length < 4) return false;
  let index = joined.indexOf(token);
  while (index >= 0) {
    const next = joined[index + token.length] || "";
    const previous = joined[index - 1] || "";
    const digitTail = /\d$/.test(token) && /\d/.test(next);
    const digitHead = /^\d/.test(token) && /\d/.test(previous);
    if (!digitTail && !digitHead) return true;
    index = joined.indexOf(token, index + 1);
  }
  return false;
}

function hasCritical(token: string, tokens: Set<string>, joined: string): boolean {
  if (tokens.has(token) || (token.length >= 5 && joinedHas(joined, token))) return true;
  const compound = token.match(/^([a-z]+)(\d{1,4})$/);
  if (!compound) return false;
  const number = Number(compound[2]);
  if (number >= 10) return tokens.has(compound[2]) || tokens.has(compound[2] + "inch");
  return tokens.has("gen" + compound[2]) && tokens.has(compound[1]);
}

function criticalConflicts(token: string, tokens: Set<string>): { values: string[]; family: boolean } {
  const compound = token.match(/^([a-z]+)(\d{1,4})$/);
  if (!compound) return { values: [], family: false };
  const [, prefix, number] = compound;
  const values: string[] = [];
  for (const other of tokens) {
    const match = other.match(/^([a-z]+)(\d{1,4})$/);
    if (!match || other === token) continue;
    if (match[1] === prefix) values.push(other);
    // "gen1" in the candidate contradicts "pro2" / "gen2" in the identity.
    else if (match[1] === "gen" && Number(number) <= 9 && match[2] !== number && tokens.has(prefix)) values.push(other);
  }
  return { values, family: FAMILY_WORDS.has(prefix) };
}

export function matchProduct(candidate: string, identity: ProductIdentity): MatchResult {
  const text = String(candidate || "");
  if (!text.trim()) return { level: "mismatch", score: 0, reason: "пустое название" };
  const normalized = normalizeText(text);
  const tokens = new Set(tokensWithCompounds(normalized));
  const joined = normalized.replace(/[\s.-]/g, "");

  if (looksLikeAccessory(text, identity)) return { level: "accessory", score: 0.1, reason: "аксессуар или отдельная деталь" };

  // A television without an article code cannot be priced against other sets: "55 inch Philips"
  // covers models from very different years and panels.
  const isTelevision = /\b(tv|televisie|television|fernseher|qled|oled|ambilight)\b/.test(normalizeText(identity.raw)) && Boolean(identity.screenSize);
  if (isTelevision && !identity.modelCodes.length) {
    return { level: "similar", score: 0.4, reason: "у телевизора не указан артикул — точная модель не определена" };
  }

  // Brand: tolerate implied brands (PlayStation -> Sony), reject an explicit different brand.
  const candidateBrand = detectBrand(normalized);
  const impliedBrands = new Set([...tokens].map((token) => IMPLIED_BRAND[token]).filter(Boolean));
  const identityBrand = identity.brand ? (IMPLIED_BRAND[identity.brand] || identity.brand) : null;
  const candidateBrandNorm = candidateBrand ? (IMPLIED_BRAND[candidateBrand] || candidateBrand) : null;
  if (identityBrand && candidateBrandNorm && candidateBrandNorm !== identityBrand && !impliedBrands.has(identityBrand)) {
    return { level: "mismatch", score: 0.1, reason: "другой бренд" };
  }

  const core = identity.coreTokens;
  // Only a real brand (e.g. "sony") can be implied by a family word ("playstation"); family words never are.
  const brandImplied = (token: string) => !IMPLIED_BRAND[token] && impliedBrands.has(token);
  const coreHits = core.filter((token) => tokens.has(token) || (token.length >= 5 && joinedHas(joined, token)) || brandImplied(token)
    || hasCritical(token, tokens, joined)).length;
  const coreRatio = core.length ? coreHits / core.length : 0;

  // GPR-H1000, GBD-H1000 and GPR-B1000 are different watches although they share half of the code.
  for (const [series, model] of seriesCodes(identity.raw)) {
    const other = seriesCodes(text).find(([otherSeries, otherModel]) => (otherSeries === series) !== (otherModel === model));
    if (other) return { level: "variant", score: 0.5, reason: "другая модель: " + other.join("-").toUpperCase() };
  }

  // Article / model codes: decisive in both directions.
  if (identity.modelCodes.length) {
    const candidateCodes = extractModelCodes(text);
    const exactCode = identity.modelCodes.find((code) => joinedHas(joined, code)
      || (coreIsDistinctive(code) && joinedHas(joined, codeCore(code)))
      || (coreIsDistinctive(code) && candidateCodes.some((other) => codeCore(other).startsWith(codeCore(code)))));
    if (exactCode) return { level: "exact", score: 0.98, reason: "совпадает артикул " + exactCode.toUpperCase() };
    const shape = (code: string) => codeCore(code).replace(/\d/g, "#");
    const sibling = candidateCodes.find((other) => identity.modelCodes.some((code) =>
      codeCore(other).length >= 4 && shape(other) === shape(code)));
    if (sibling) return { level: "variant", score: 0.5, reason: "другой артикул: " + sibling.toUpperCase() };
  }

  const conflicts: string[] = [];
  let familyConflict = false;
  for (const token of identity.criticalTokens) {
    const found = criticalConflicts(token, tokens);
    if (found.values.length) {
      conflicts.push(...found.values);
      familyConflict ||= found.family;
    }
  }
  // The offer names a generation the listing does not: "Switch" is not "Switch 2", "R6" is not "R6 Mark II".
  const identityTokens = new Set([...tokensWithCompounds(normalizeText(identity.raw)), ...identity.criticalTokens]);
  const identityNumbers = (prefix: string) => [...identityTokens].some((token) => new RegExp("^" + prefix + "\\d{1,4}$").test(token));
  for (const token of tokens) {
    const generation = token.match(/^([a-z]+)(\d{1,2})$/);
    if (!generation || identityNumbers(generation[1])) continue;
    // "AirPods Pro 2" and "AirPods Pro (2nd generation)" name the same generation.
    if (generation[1] === "gen" && [...identityTokens].some((other) => new RegExp("^[a-z]+" + generation[2] + "$").test(other))) continue;
    if (FAMILY_WORDS.has(generation[1]) && identityTokens.has(generation[1])) {
      conflicts.push(token);
      familyConflict = true;
    } else if ((generation[1] === "mark" || generation[1] === "gen") && Number(generation[2]) > 1) {
      conflicts.push(token);
    }
  }
  const missingCritical = identity.criticalTokens.filter((token) => !hasCritical(token, tokens, joined));
  if (identity.storage) {
    const candidateStorage = [...normalized.matchAll(/\b(\d{1,4}(?:gb|tb))\b/g)].map((m) => m[1])
      .filter((value) => /tb$/.test(value) || Number.parseInt(value, 10) >= 64);
    if (candidateStorage.length && !candidateStorage.includes(identity.storage)) conflicts.push(candidateStorage[0]);
  }
  if (identity.screenSize) {
    // "MacBook Air 13" or "QE65..." name the size without "inch".
    const sizes = new Set([...normalized.matchAll(/\b(\d{2})inch\b/g)].map((m) => m[1]));
    for (const token of tokens) {
      if (/^(?:1[0-7]|2[4-9]|[3-9]\d)$/.test(token)) sizes.add(token);
    }
    if (sizes.size && !sizes.has(identity.screenSize)) conflicts.push([...sizes][0] + "inch");
  }
  // Apple silicon: "M3" and "M3 Pro"/"M3 Max" are different chips even though "Pro" is in the product name.
  const chipOf = (value: string) => value.match(/\bm([1-9])(?![0-9])\s*(pro|max|ultra)?/)?.slice(1, 3).filter(Boolean).join(" ") || null;
  const identityChip = chipOf(normalizeText(identity.raw));
  const candidateChip = chipOf(normalized);
  if (identityChip && candidateChip && identityChip !== candidateChip) conflicts.push("чип M" + candidateChip.toUpperCase());
  // Memory (RAM) below 64 GB: 8 GB vs 16/18 GB is a different configuration and price.
  const ramOf = (value: string) => [...value.matchAll(/\b(\d{1,2})gb\b/g)].map((m) => Number(m[1])).filter((gb) => gb >= 4 && gb <= 48);
  // The hint counts too: the scanner adds RAM it read from the listing's description.
  const identityRam = ramOf(identity.capacities.join(" "));
  const candidateRam = ramOf(normalized);
  if (identityRam.length && candidateRam.length && !candidateRam.some((gb) => identityRam.includes(gb))) conflicts.push(candidateRam[0] + "GB RAM");
  const candidateEditions = [...tokens].filter((token) => EDITION_WORDS.has(token));
  for (const [left, right] of EXCLUSIVE_EDITIONS) {
    if ((identity.editions.includes(left) && tokens.has(right)) || (identity.editions.includes(right) && tokens.has(left))) {
      conflicts.push(left + "/" + right);
    }
  }
  const extraEditions = candidateEditions.filter((edition) => !identity.editions.includes(edition)
    && !identity.coreTokens.includes(edition) && !["digital", "disc"].includes(edition));
  const missingEditions = identity.editions.filter((edition) => !tokens.has(edition) && !["digital", "disc", "oled"].includes(edition));

  // Retail bundles ("+ game", "bundel") change the price: never an exact comparable.
  if (!identity.wantsAccessory && !BUNDLE_RE.test(normalizeText(identity.raw))
      && (/(?:^|\s)\+\s*\S/.test(text) || /\b(bundel|bundle|combideal|voordeelset|set mit)\b/i.test(normalized)
        || /\b(?:met|incl\.?|inkl\.?|inclusief|inklusive|mit|with|including)\b[^,.]{0,40}\b(games?|spiele?|spel(?:len)?|controllers?|fifa|fc\s?\d{2}|call of duty|covers?|oplaadstation|ladestation|lens(?:es)?|objektiv|objectie[fv]|kit)\b/i.test(normalized)
        || /\b(call of duty|black ops|fc\s?2\d|fifa\s?\d{2}|spider[\s-]?man|gran turismo|astro bot|god of war|ghost of|hogwarts|fortnite|minecraft|mario kart|zelda|pokemon|battlefield|wolverine|ea sports|oplaadstation|ladestation)\b/i.test(normalized))) {
    if (!familyConflict && coreRatio >= 0.5) return { level: "variant", score: 0.5, reason: "другая комплектация (набор/бандл)" };
  }
  if (familyConflict) return { level: "mismatch", score: 0.2, reason: "другая модель: " + [...new Set(conflicts)].slice(0, 2).join(", ") };
  const familyHit = identity.criticalTokens.length > 0 && missingCritical.length < identity.criticalTokens.length;
  if (familyHit && !conflicts.length && (missingEditions.length || extraEditions.length) && coreRatio >= 0.25) {
    const diff = [...missingEditions.map((e) => "нет «" + e + "»"), ...extraEditions.map((e) => "+" + e)];
    return { level: "variant", score: 0.55, reason: "отличается версия: " + diff.slice(0, 3).join(", ") };
  }
  if (coreRatio < 0.4) return { level: "mismatch", score: coreRatio, reason: "мало общих признаков модели" };
  if (conflicts.length) {
    return { level: "variant", score: 0.5, reason: "другая модификация: " + [...new Set(conflicts)].slice(0, 3).join(", ") };
  }
  if (missingEditions.length || extraEditions.length) {
    const diff = [...missingEditions.map((e) => "нет «" + e + "»"), ...extraEditions.map((e) => "+" + e)];
    return { level: "variant", score: 0.6, reason: "отличается версия: " + diff.slice(0, 3).join(", ") };
  }
  if (missingCritical.length) {
    return coreRatio >= 0.6
      ? { level: "similar", score: 0.55, reason: "не указано поколение/модель: " + missingCritical.slice(0, 2).join(", ") }
      : { level: "mismatch", score: 0.3, reason: "не совпадает модель" };
  }
  if (coreRatio >= 0.7) return { level: "exact", score: Math.min(0.97, 0.7 + coreRatio * 0.27), reason: "совпадают бренд, модель и поколение" };
  return { level: "similar", score: 0.5 + coreRatio * 0.2, reason: "частичное совпадение названия" };
}

/**
 * "Tissot horloge" or "Michael Kors tas" names a brand and a kind of product, not a model:
 * its "market price" would be the median of everything that brand sells.
 */
export function isGenericIdentity(identity: ProductIdentity): boolean {
  if (identity.modelCodes.length || identity.criticalTokens.length || identity.storage) return false;
  const brandWords = new Set([...(identity.brand || "").split(" "), ...BRANDS.flatMap((brand) => brand.split(" "))]);
  return !identity.coreTokens.some((token) => !brandWords.has(token) && !/^\d+$/.test(token));
}

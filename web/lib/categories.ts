export type Category = { key: string; label: string; group: string };

export const CATEGORY_GROUPS = [
  "Телефоны и планшеты", "Компьютеры", "Игровые консоли", "Наушники и аудио", "Камеры и объективы",
  "Телевизоры и техника", "Умные часы", "Обычные часы", "Сумки и рюкзаки", "Очки",
] as const;

export const CATEGORIES: Category[] = [
  { key: "iphone-16", label: "iPhone 16", group: "Телефоны и планшеты" },
  { key: "iphone-15", label: "iPhone 15", group: "Телефоны и планшеты" },
  { key: "iphone-14", label: "iPhone 14", group: "Телефоны и планшеты" },
  { key: "iphone-13", label: "iPhone 13", group: "Телефоны и планшеты" },
  { key: "iphone-12", label: "iPhone 12", group: "Телефоны и планшеты" },
  { key: "galaxy-s", label: "Samsung Galaxy S", group: "Телефоны и планшеты" },
  { key: "ipad", label: "iPad", group: "Телефоны и планшеты" },
  { key: "macbook", label: "MacBook Air / Pro", group: "Компьютеры" },
  { key: "steam-deck", label: "Steam Deck", group: "Компьютеры" },
  { key: "ssd-samsung", label: "SSD Samsung T7–T9", group: "Компьютеры" },
  { key: "ssd-sandisk", label: "SSD SanDisk Extreme", group: "Компьютеры" },
  { key: "ps5", label: "PlayStation 5", group: "Игровые консоли" },
  { key: "switch", label: "Nintendo Switch 2", group: "Игровые консоли" },
  { key: "airpods-max", label: "AirPods Max", group: "Наушники и аудио" },
  { key: "headphones-sony", label: "Наушники Sony", group: "Наушники и аудио" },
  { key: "speaker-jbl", label: "Колонки JBL", group: "Наушники и аудио" },
  { key: "microphone-dji", label: "Микрофоны DJI", group: "Наушники и аудио" },
  { key: "camera-sony", label: "Камеры Sony", group: "Камеры и объективы" },
  { key: "camera-canon", label: "Камеры Canon", group: "Камеры и объективы" },
  { key: "lens-sony-fe", label: "Объективы Sony FE", group: "Камеры и объективы" },
  { key: "action-camera-gopro", label: "GoPro", group: "Камеры и объективы" },
  { key: "drones", label: "Дроны DJI", group: "Камеры и объективы" },
  { key: "televisions", label: "Телевизоры", group: "Телевизоры и техника" },
  { key: "dyson", label: "Dyson", group: "Телевизоры и техника" },
  { key: "apple-watch", label: "Apple Watch", group: "Умные часы" },
  { key: "watch-tissot", label: "Tissot", group: "Обычные часы" },
  { key: "watch-diesel", label: "Diesel", group: "Обычные часы" },
  { key: "watch-boss", label: "Hugo Boss", group: "Обычные часы" },
  { key: "watch-tommy", label: "Tommy Hilfiger", group: "Обычные часы" },
  { key: "bag-michael-kors", label: "Сумки Michael Kors", group: "Сумки и рюкзаки" },
  { key: "backpack-michael-kors", label: "Рюкзаки Michael Kors", group: "Сумки и рюкзаки" },
  { key: "bag-northface", label: "The North Face", group: "Сумки и рюкзаки" },
  { key: "rayban", label: "Ray-Ban Meta", group: "Очки" },
];

export function categoryLabel(key: string): string {
  return CATEGORIES.find((item) => item.key === key)?.label || key;
}

export function groupOf(key: string): string {
  return CATEGORIES.find((item) => item.key === key)?.group || "Другое";
}

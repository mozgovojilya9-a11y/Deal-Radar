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
  { key: "ps5", label: "PlayStation 5", group: "Игровые консоли" },
  { key: "ps4", label: "PlayStation 4", group: "Игровые консоли" },
  { key: "switch", label: "Nintendo Switch", group: "Игровые консоли" },
  { key: "xbox-series", label: "Xbox Series X|S", group: "Игровые консоли" },
  { key: "airpods-pro-2", label: "AirPods Pro 2", group: "Наушники и аудио" },
  { key: "airpods-pro-3", label: "AirPods Pro 3", group: "Наушники и аудио" },
  { key: "airpods-max", label: "AirPods Max", group: "Наушники и аудио" },
  { key: "airpods-5", label: "AirPods 4/5", group: "Наушники и аудио" },
  { key: "headphones-sony", label: "Наушники Sony", group: "Наушники и аудио" },
  { key: "headphones-bose", label: "Наушники Bose", group: "Наушники и аудио" },
  { key: "headphones-sennheiser", label: "Наушники Sennheiser", group: "Наушники и аудио" },
  { key: "headphones-jbl", label: "Наушники JBL", group: "Наушники и аудио" },
  { key: "headphones-beats", label: "Наушники Beats", group: "Наушники и аудио" },
  { key: "sonos", label: "Sonos", group: "Наушники и аудио" },
  { key: "microphone-shure", label: "Микрофоны Shure", group: "Наушники и аудио" },
  { key: "microphone-rode", label: "Микрофоны RØDE", group: "Наушники и аудио" },
  { key: "microphone-dji", label: "Микрофоны DJI", group: "Наушники и аудио" },
  { key: "microphone-sennheiser", label: "Микрофоны Sennheiser", group: "Наушники и аудио" },
  { key: "camera-sony", label: "Камеры Sony", group: "Камеры и объективы" },
  { key: "camera-canon", label: "Камеры Canon", group: "Камеры и объективы" },
  { key: "camera-nikon", label: "Камеры Nikon", group: "Камеры и объективы" },
  { key: "camera-fujifilm", label: "Камеры Fujifilm", group: "Камеры и объективы" },
  { key: "camera-panasonic", label: "Камеры Panasonic", group: "Камеры и объективы" },
  { key: "lens-sony-fe", label: "Объективы Sony FE", group: "Камеры и объективы" },
  { key: "action-camera-gopro", label: "GoPro", group: "Камеры и объективы" },
  { key: "drones", label: "Дроны", group: "Камеры и объективы" },
  { key: "televisions", label: "Телевизоры", group: "Телевизоры и техника" },
  { key: "dyson", label: "Dyson", group: "Телевизоры и техника" },
  { key: "apple-watch", label: "Apple Watch", group: "Умные часы" },
  { key: "watch-casio", label: "Casio", group: "Обычные часы" },
  { key: "watch-tissot", label: "Tissot", group: "Обычные часы" },
  { key: "watch-diesel", label: "Diesel", group: "Обычные часы" },
  { key: "watch-boss", label: "Hugo Boss", group: "Обычные часы" },
  { key: "watch-tommy", label: "Tommy Hilfiger", group: "Обычные часы" },
  { key: "bag-michael-kors", label: "Сумки Michael Kors", group: "Сумки и рюкзаки" },
  { key: "backpack-michael-kors", label: "Рюкзаки Michael Kors", group: "Сумки и рюкзаки" },
  { key: "bag-fjallraven", label: "Fjällräven", group: "Сумки и рюкзаки" },
  { key: "bag-northface", label: "The North Face", group: "Сумки и рюкзаки" },
  { key: "bag-osprey", label: "Osprey", group: "Сумки и рюкзаки" },
  { key: "bag-deuter", label: "Deuter", group: "Сумки и рюкзаки" },
  { key: "bag-eastpak", label: "Eastpak", group: "Сумки и рюкзаки" },
  { key: "rayban", label: "Ray-Ban Meta", group: "Очки" },
];

export function categoryLabel(key: string): string {
  return CATEGORIES.find((item) => item.key === key)?.label || key;
}

export function groupOf(key: string): string {
  return CATEGORIES.find((item) => item.key === key)?.group || "Другое";
}

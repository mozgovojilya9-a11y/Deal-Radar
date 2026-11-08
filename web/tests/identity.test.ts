import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIdentity, matchProduct, type MatchLevel } from "../lib/product-identity";

const cases: Array<[string, string, MatchLevel]> = [
  ["Ray-Ban Wayfarer Gen 2 Smartbril - Nieuw", "Ray-Ban Meta Wayfarer (Gen 2) Matte Black", "exact"],
  ["Ray-Ban Wayfarer Gen 2 Smartbril - Nieuw", "Ray-Ban | Meta Wayfarer (2e generatie)", "exact"],
  ["Ray-Ban Wayfarer Gen 2 Smartbril - Nieuw", "Ray-Ban Meta Wayfarer Gen 1", "variant"],
  ["Ray-Ban Wayfarer Gen 2 Smartbril - Nieuw", "Hoesje voor Ray-Ban Meta Wayfarer Gen 2", "accessory"],
  ["Sony PlayStation 5 Slim Disc Edition", "Sony PlayStation 5 Slim (Disc) 1TB", "exact"],
  ["Sony PlayStation 5 Slim Disc Edition", "PlayStation 5 Slim Digital Edition", "variant"],
  ["Sony PlayStation 5 Slim Disc Edition", "PlayStation 5 Pro", "variant"],
  ["Sony PlayStation 5 Slim Disc Edition", "PlayStation 5 Slim Disc Edition + Call of Duty: Black Ops 7", "variant"],
  ["Sony PlayStation 5 Slim Disc Edition", "BlueBuilt Cover Zwart voor PS5 Slim Disc Edition", "accessory"],
  ["Sony PlayStation 5 Slim Disc Edition", "DualSense controller PS5", "accessory"],
  ["Sony PlayStation 5 Slim Disc Edition", "PS4 Slim 500GB", "mismatch"],
  ["Apple AirPods Pro 2 USB-C", "Apple AirPods Pro (2nd generation) USB-C", "exact"],
  ["Apple AirPods Pro 2 USB-C", "AirPods Pro (2e generatie) met MagSafe-oplaadcase (USB‑C)", "exact"],
  ["Apple AirPods Pro 2 USB-C", "AirPods Pro 3", "variant"],
  ["Apple AirPods Pro 2 USB-C", "AirPods Pro 2 oplaadcase los", "accessory"],
  ["Apple AirPods Pro 2 USB-C", "Apple AirPods Pro 2 – links (USB-C) • Nieuw in doos", "accessory"],
  ["Apple AirPods Pro 2 USB-C", "INF AirPods Pro 2 geschikt voor Apple AirPods Pro 2", "accessory"],
  ["Apple AirPods Pro 2 USB-C", "APPLE MacBook Pro (2026) - 14 inch - M5 Pro (15C CPU/16C GPU) - 24 GB - 2 TB - Silver", "mismatch"],
  ["MacBook Pro 14 M3 Pro 18GB 512GB", "Apple MacBook Pro 14-inch M3 Pro 512GB", "exact"],
  ["MacBook Pro 14 M3 Pro 18GB 512GB", "MacBook Pro 14 M2 Pro 512GB", "variant"],
  ["MacBook Pro 14 M3 Pro 18GB 512GB", "MacBook Pro 16 M3 Pro 512GB", "variant"],
  ["Apple MacBook Pro 14 inch – 1TB SSD (M3, 2023)", "MacBook Pro 14\" M3 Pro-18 GB RAM -1 TB SSD- schwarz", "variant"],
  ["Apple MacBook Pro 14 inch – 1TB SSD (M3, 2023)", "Apple MacBook Pro 14-inch M3 – 1TB SSD – Space Gray", "exact"],
  ["MacBook Air M3 8GB 256GB", "MacBook Air 13 M3 16GB 256GB", "variant"],
  ["MacBook Air M3 8GB 256GB", "MacBook Air M3 8GB 256GB Midnight", "exact"],
  ["Macbook Air M2 NIEUW 99% batterij! 15,3” 256gb Midnight", "Apple MacBook Air 15 inch M2 256GB", "exact"],
  ["Macbook Air M2 NIEUW 99% batterij! 15,3” 256gb Midnight", "MacBook Air 13 M2 256GB", "variant"],
  ["Samsung QE55S90D 55 inch OLED", "Samsung OLED 4K 55S90D (2024)", "exact"],
  ["Samsung QE55S90D 55 inch OLED", "Samsung QE65S90D", "variant"],
  ["iPhone 15 Pro 256GB", "Apple iPhone 15 Pro 256GB Natural Titanium", "exact"],
  ["iPhone 15 Pro 256GB", "iPhone 15 Pro Max 256GB", "variant"],
  ["iPhone 15 Pro 256GB", "iPhone 15 Pro 128GB", "variant"],
  ["iPhone 15 Pro 256GB", "iPhone 14 Pro 256GB", "mismatch"],
  // A TV without article code is never priced against other sets.
  ["55 inch TV QLED Ambilight Philips Smart TV [2026] Als Nieuw!", "Philips 55PUS6704 55 Zoll 4K Ambilight Smart TV", "similar"],
  ["Sony PlayStation 5 Slim Disc Edition", "Sony PlayStation 5 Slim Digitale Editie (PS5 Slim)", "variant"],
  ["Sony PlayStation 5 Slim Disc Edition", "Sony PlayStation 5 Slim Disc Edition Konsole inkl Controller", "variant"],
  ["Sony PlayStation 5 Slim Disc Edition", "Sony PlayStation 5 Slim 1TB Disc Edition (mit Laufwerk)", "exact"],
  ["Complete Sony A7iii met 6971 clicks", "Aquatech Edge conversion kit 10m A7RIII A7 III", "accessory"],
  ["Complete Sony A7iii met 6971 clicks", "Sony A7 III systeemcamera", "exact"],
  ["Apple AirPods Pro 2 USB-C", "Caixa de carregamento AirPods Pro 2 USB-C", "accessory"],
  ["Apple AirPods Pro 2 USB-C", "Original Apple AirPods Pro 2 Ladecase (USB-C)", "accessory"],
  ["Apple AirPods Pro 2 USB-C", "Coque protection silicone Apple AirPods Pro 2", "accessory"],
  ["Apple AirPods Pro 2 USB-C", "Apple AirPods Pro 2 USB-C, Model: AirPods Pro 2", "exact"],
  ["Apple AirPods Pro 2 USB-C", "Apple Airpods Pro (2.Gen.2023), Model: AirPods Pro 3 (2025)", "variant"],
  ["Apple AirPods Pro 2 USB-C", "Apple AirPods Pro 2. Generation mit USB-C Ladecase", "exact"],
];

for (const [query, candidate, expected] of cases) {
  test(`${query} ⟶ ${candidate} = ${expected}`, () => {
    assert.equal(matchProduct(candidate, buildIdentity(query)).level, expected);
  });
}

test("search name drops condition, colour and battery noise", () => {
  assert.equal(buildIdentity("Macbook Air M2 NIEUW 99% batterij! 15,3” 256gb Midnight").searchName, "Macbook Air M2 15,3” 256gb");
  assert.equal(buildIdentity("Ray-Ban Wayfarer Gen 2 Smartbril - Nieuw").searchName, "Ray-Ban Wayfarer Gen 2");
});

const wrongModelPairs: Array<[string, string, string?]> = [
  ["Nintendo Switch (2019) met accessoires", "Nintendo Switch 2 Konsole wie neu"],
  ["Nintendo Switch OLED", "Nintendo Switch 2"],
  ["CANON EOS R6 BODY | NIEUWSTAAT", "Canon EOS R6 Mark II Body mit OVP"],
  ["Canon EOS R6", "Canon EOS R6 II Gehäuse"],
  ["Casio GPR-H1000-1", "CASIO G-Shock Rangeman GPR-B1000-1JR Solar"],
  ["G-Shock GBD-H1000-1ER Black Edition", "CASIO G-SHOCK / GPR-H1000 / NEU"],
];
for (const [listing, offer] of wrongModelPairs) {
  test(`${listing} is not valued by ${offer}`, () => {
    assert.notEqual(matchProduct(offer, buildIdentity(listing)).level, "exact");
  });
}

test("the same camera generation still matches, with or without the word Mark", () => {
  assert.equal(matchProduct("Canon EOS R6 Mark II Body", buildIdentity("Canon EOS R6 II")).level, "exact");
  assert.equal(matchProduct("Canon EOS R6 Body", buildIdentity("Canon EOS R6 camera in zeer goede staat, 13.686 clicks")).level, "exact");
});

test("RAM read from the description (hint) separates configurations of one MacBook", () => {
  const identity = buildIdentity("Apple MacBook Pro 14 inch 1TB SSD (M3, 2023)", "14 1tb 8gb m3 pro");
  assert.equal(matchProduct('MacBook Pro 14" M3 1 TB SSD, 8 GB RAM', identity).level, "exact");
  assert.notEqual(matchProduct('MacBook Pro 14" M3 16GB RAM 1 TB SSD', identity).level, "exact");
});

const storageCases: Array<[string, string, MatchLevel]> = [
  ["Samsung T7 1TB", "Samsung Portable SSD T7 1TB", "exact"],
  ["Samsung T7 1TB", "Samsung T9 1TB", "variant"],
  ["Samsung T7 1TB", "Samsung T7 Shield 1TB", "variant"],
  ["Samsung T7 1TB", "Samsung T7 2TB", "variant"],
  ["SanDisk Extreme Portable SSD 2TB", "SanDisk Extreme Pro Portable SSD 2TB", "variant"],
  ["SanDisk Extreme Portable SSD 2TB", "SanDisk Extreme Portable SSD 2TB V2", "exact"],
  ["Samsung T7 1TB", "Hoesje voor Samsung T7", "accessory"],
];
for (const [listing, offer, expected] of storageCases) {
  test(`${listing} ⟶ ${offer} = ${expected}`, () => {
    assert.equal(matchProduct(offer, buildIdentity(listing)).level, expected);
  });
}

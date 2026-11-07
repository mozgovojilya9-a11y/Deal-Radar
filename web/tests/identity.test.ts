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

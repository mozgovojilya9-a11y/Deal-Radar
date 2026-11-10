import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIdentity, isGenericIdentity, matchProduct } from "../lib/product-identity";

/** Real Marktplaats titles that got no market value: seller wording leaked into the product identity. */
const cleaned: Array<[title: string, hint: string | null, searchName: string]> = [
  ["iPhone 14 Plus 128GB Accu 86% iOS 27.0 Zwart | Nette Staat", "128gb plus", "iPhone 14 Plus 128GB"],
  ["Iphone 13 Pro 128gb, 120hz Oled etc. Zeer netjes!", "128gb pro", "Iphone 13 Pro 128gb"],
  ["MacBook Pro 13 inch (M1, 2020) | 256 GB | Inruil mogelijk!", "13 256gb 8gb m1 pro", "MacBook Pro 13 inch M1 2020 256 GB"],
  ["Samsung Galaxy s25 ultra 256GB met Garantie!!!", "256gb s25ultra", "Samsung Galaxy s25 ultra 256GB"],
  ["APPLE iPhone 16 5G - 128 GB 5 kleuren factuur + Garantie", "128gb", "APPLE iPhone 16 128 GB"],
  ["Apple iPhone 16 Pro ll 128GB ll Zwart Titanium", "128gb pro", "Apple iPhone 16 Pro 128GB"],
  ["iPhone 16 Roze 128 GB 88%baterij", null, "iPhone 16 128 GB"],
  ["Apple Watch Series 9 45mm (93%) - Nette staat", "45mm series9", "Apple Watch Series 9 45mm"],
  ["Apple Watch Ultra 49mm Zwart - Compleet en Krasvrij", "49mm ultra", "Apple Watch Ultra 49mm"],
  ["Samsung Galaxy S23 Plus - 256GB - Dual Sim - Cream", "256gb s23plus", "Samsung Galaxy S23 Plus 256GB"],
  ["MacBook Air M2 13,6\" 2022 Midnight 8GB/256GB + doos/box", "13 256gb 8gb air m2", "MacBook Air M2 13,6\" 2022 8GB/256GB"],
  ["Tekoop of inruilen Iphone 13", null, "Iphone 13"],
  ["Zeer nette iphone 15 incl leuke hoesjes", null, "iphone 15"],
  ["Dyson HD07 Supersonic Föhn | In Doos", "supersonic", "Dyson HD07 Supersonic Föhn"],
  ["Nette en goed iphone 16 Pro.   € 570, VASTE PRIJS", null, "iphone 16 Pro"],
  ["iPhone 14 Pro Max 128GB  80%Zo goed als nieuw 375 vaste prijs", null, "iPhone 14 Pro Max 128GB"],
  ["Selling my PS5 Digital Edition", null, "PS5 Digital Edition"],
  ["JBL Charge 5 Zwart nu voor €89.99", null, "JBL Charge 5"],
  ["JBL Charge 3, nette staat, lichte gebruikerssporen", null, "JBL Charge 3"],
  ["✅NIEUW✅ JBL Partybox 320 + 2 draadloze Microfoons", null, "JBL Partybox 320"],
  ["Canon EOS R5 ~254k clicks", null, "Canon EOS R5"],
  ["MacBook Pro 2024 M4 Pro 14'' 24GB 512GB (Cycli 43) QWERTY", null, "MacBook Pro 2024 M4 Pro 14'' 24GB 512GB"],
  ["MacBook Pro 2023 | M3 Pro | 18C GPU | 18GB 1TB SSD 14 inch", null, "MacBook Pro 2023 M3 Pro 18GB 1TB SSD 14"],
  ["Tissot PR 100 Herenhorloge – Staal – Datum – Swiss Made", null, "Tissot PR 100"],
  ["Iphone 16 aquamarijn in zeer goede staat vaste prijs", null, "Iphone 16"],
];

for (const [title, hint, expected] of cleaned) {
  test("search name without seller wording: " + title, () => {
    assert.equal(buildIdentity(title, hint).searchName, expected);
  });
}

const matches: Array<[title: string, hint: string | null, offer: string]> = [
  ["iPhone 14 Plus 128GB Accu 86% iOS 27.0 Zwart | Nette Staat", "128gb plus", "Apple iPhone 14 Plus 128GB blau"],
  ["Iphone 13 Pro 128gb, 120hz Oled etc. Zeer netjes!", "128gb pro", "iPhone 13 Pro 128GB Sierra Blue"],
  ["MacBook Pro 13 inch (M1, 2020) | 256 GB | Inruil mogelijk!", null, "Apple MacBook Pro 13 M1 256GB"],
  ["APPLE iPhone 16 5G - 128 GB 5 kleuren factuur + Garantie", "128gb", "iPhone 16 128GB schwarz"],
  ["Apple iPhone 16 Pro ll 128GB ll Zwart Titanium", "128gb pro", "iPhone 16 Pro 128 GB Titan Natur"],
  ["Samsung Galaxy S23 Plus - 256GB - Dual Sim - Cream", "256gb s23plus", "Samsung Galaxy S23 Plus 256GB"],
  ["Apple Watch Series 9 45mm (93%) - Nette staat", "45mm series9", "Apple Watch Series 9 45mm GPS"],
  ["MacBook Pro 2023 | M3 Pro | 18C GPU | 18GB 1TB SSD 14 inch", null, "Apple MacBook Pro 14 M3 Pro 18GB 1TB"],
  ["Nette en goed iphone 16 Pro.   € 570, VASTE PRIJS", null, "Apple iPhone 16 Pro 128GB"],
  ["Tissot PR 100 Herenhorloge – Staal – Datum – Swiss Made", null, "Tissot PR 100 Herrenuhr"],
  ["Iphone 16 aquamarijn in zeer goede staat vaste prijs", "128gb", "iPhone 16 128GB Ultramarin"],
];

for (const [title, hint, offer] of matches) {
  test("noisy listing still matches its own product: " + title, () => {
    const result = matchProduct(offer, buildIdentity(title, hint));
    assert.equal(result.level, "exact", result.reason);
  });
}

test("seller wording never becomes a required model token", () => {
  const identity = buildIdentity("Iphone 13 Pro 128gb, 120hz Oled etc. Zeer netjes!", "128gb pro");
  assert.deepEqual(identity.criticalTokens.filter((token) => /hz|ios|etc/.test(token)), []);
  assert.ok(!identity.editions.includes("oled"));
  assert.ok(!identity.coreTokens.includes("etc"));
});

test("cleaning keeps real differentiators", () => {
  assert.equal(matchProduct("iPhone 14 128GB", buildIdentity("iPhone 14 Plus 128GB Accu 86% iOS 27.0 Zwart | Nette Staat", "128gb plus")).level, "variant");
  assert.equal(matchProduct("Steam Deck LCD 512GB", buildIdentity("Steam Deck OLED 512GB - nieuw en geseald", "512gb oled")).level !== "exact", true);
  assert.ok(buildIdentity("Nintendo Switch OLED wit", null).editions.includes("oled"));
  assert.equal(buildIdentity("Garmin Edge cycling 530", null).searchName, "Garmin Edge cycling 530");
  assert.equal(buildIdentity("The North Face Borealis rugzak", null).searchName, "North Face Borealis rugzak");
});

test("a title that names only a brand and a product type has no model to price", () => {
  for (const title of ["Michael kors tas", "Tissot horloge", "Boss horloge", "Sony koptelefoon", "horloge diesel zo goed als nieuw", "Michael Kors handtas"]) {
    assert.equal(isGenericIdentity(buildIdentity(title, null)), true, title);
  }
  for (const title of ["Tissot PR 100", "Michael Kors Jet Set tas", "Sony WH-1000XM5", "iPhone 13", "JBL Charge 5", "Dyson Airwrap"]) {
    assert.equal(isGenericIdentity(buildIdentity(title, null)), false, title);
  }
});

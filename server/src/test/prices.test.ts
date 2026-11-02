import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BREAD_PER_FLOUR, BREAD_PER_WOOD, OUTPUT_PER_WORKER as OUT, PRICES, WAGES } from '../sim/economyConfig';

// Chaque maillon de la chaîne du pain doit gagner au moins le salaire de qui y travaille,
// sinon il vit aux crochets du village (ou fait faillite).
const margin = {
  ferme: OUT.ble * PRICES.ble,
  scierie: OUT.bois * PRICES.bois,
  moulin: OUT.farine * (PRICES.farine - PRICES.ble),
  boulangerie: OUT.pain * (PRICES.pain - PRICES.farine / BREAD_PER_FLOUR - PRICES.bois / BREAD_PER_WOOD),
};

for (const [kind, m] of Object.entries(margin)) {
  test(`un employé de ${kind} rapporte au moins son salaire`, () => {
    assert.ok(m >= WAGES[kind as keyof typeof WAGES], `${kind} : marge ${m.toFixed(2)} pour un salaire de ${WAGES[kind as keyof typeof WAGES]}`);
  });
}

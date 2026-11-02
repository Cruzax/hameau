import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Workplace, WorkplaceKind } from '@hameau/shared';
import { Economy } from '../sim/economy';
import { SUBSISTENCE_BREAD } from '../sim/economyConfig';
import { newSim } from './helpers';

function chain(kinds: WorkplaceKind[], till = 50) {
  const sim = newSim();
  const w = sim.world;
  w.workplaces = {};
  for (const a of Object.values(w.agents)) delete a.job;
  const eco = new Economy(() => 0, false);
  sim.economy = eco;
  kinds.forEach((kind, i) => {
    const id = `wp-${kind}`;
    w.houses[id] = { id, ownerId: null, kind: 'travail', position: { x: -24 + i * 6, z: -22 }, rotation: 0, style: 'ferme', wallColor: '#fff', roofColor: '#a33' };
    const wp: Workplace = { id, kind, era: 'ancienne', houseId: id, ownerId: null, slots: 1, workers: [], till, stock: {}, unpaidDays: 0, openedDay: 1 };
    w.workplaces[id] = wp;
  });
  const agents = Object.values(w.agents);
  kinds.forEach((kind, i) => eco.hire(sim, agents[i].id, `wp-${kind}`));
  return { sim, w, eco, agents };
}

test('la chaîne blé → farine → pain nourrit le village', () => {
  const { sim, w, eco, agents } = chain(['ferme', 'moulin', 'scierie', 'boulangerie']);
  for (let d = 0; d < 3; d++) {
    eco.morning(sim);
    eco.evening(sim);
  }
  const bakery = w.workplaces['wp-boulangerie'];
  const baked = sim.journal.events.filter((e) => e.type === 'life.work' && (e.payload as { work?: string }).work === 'pain').reduce((n, e) => n + ((e.payload as { qty?: number }).qty ?? 0), 0);
  assert.ok(baked >= 12, `seulement ${baked} pains cuits`);
  const buyer = agents[agents.length - 1];
  // Le pain coûte une pièce ; on en achète jusqu'à quatre d'un coup.
  buyer.inventory = { pain: 0, bois: 0, outils: 0, pieces: 3 };
  bakery.stock.pain = Math.max(bakery.stock.pain ?? 0, 10);
  const tillBefore = bakery.till;
  assert.equal(eco.buyBread(sim, buyer), 3);
  assert.equal(buyer.inventory.pain, 3);
  assert.equal(buyer.inventory.pieces, 0);
  assert.equal(bakery.till, tillBefore + 3);
});

test('sans emploi, le potager donne un pain chaque matin', () => {
  const { sim, eco, agents } = chain([]);
  const a = agents[0];
  a.inventory = { pain: 0, bois: 0, outils: 0, pieces: 0 };
  eco.morning(sim);
  assert.equal(a.inventory.pain, SUBSISTENCE_BREAD);
});

test('un affamé sans le sou reçoit un pain à la boulangerie', () => {
  const { sim, w, eco, agents } = chain(['boulangerie']);
  w.workplaces['wp-boulangerie'].stock.pain = 10;
  const a = agents[agents.length - 1];
  a.inventory = { pain: 0, bois: 0, outils: 0, pieces: 0 };
  a.needs = { satiete: 0.1, energie: 1, humeur: 0.5, sante: 1 };
  assert.equal(eco.buyBread(sim, a), 1);
  assert.equal(a.inventory.pain, 1);
  assert.ok(sim.journal.events.some((e) => /offre un pain/.test(e.text)));
});

test('une ferme ne produit plus quand ses greniers débordent', () => {
  const { sim, w, eco } = chain(['ferme']);
  w.workplaces['wp-ferme'].stock.ble = 500;
  eco.morning(sim);
  eco.evening(sim);
  assert.equal(w.workplaces['wp-ferme'].stock.ble, 500);
});

test('un enfant reçoit deux pains du potager familial', () => {
  const { sim, eco, agents } = chain([]);
  const kid = agents[0];
  kid.family = { parentIds: [agents[1].id], childIds: [] };
  kid.houseId = agents[1].houseId;
  kid.inventory = { pain: 0, bois: 0, outils: 0, pieces: 0 };
  eco.morning(sim);
  assert.equal(kid.inventory.pain, 2);
});

import { wantsBread } from '../sim/daily';

test('on garde une petite réserve de pain, et on peut en acheter jusqu’à 21 h', () => {
  const fed = { satiete: 0.8 };
  assert.equal(wantsBread(fed, { pain: 2, pieces: 4 }, 20), true);
  assert.equal(wantsBread(fed, { pain: 3, pieces: 4 }, 12), false);
  assert.equal(wantsBread(fed, { pain: 0, pieces: 4 }, 22), false);
  assert.equal(wantsBread(fed, { pain: 0, pieces: 0 }, 12), false);
  assert.equal(wantsBread({ satiete: 0.1 }, { pain: 0, pieces: 0 }, 12), true); // affamé sans le sou : il demande
});

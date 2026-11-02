import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Workplace, WorkplaceKind } from '@hameau/shared';
import { Economy } from '../sim/economy';
import { newWorkplace } from '../sim/god';
import { newSim } from './helpers';

function village(kinds: { kind: WorkplaceKind; till: number; slots?: number }[]) {
  const sim = newSim();
  const w = sim.world;
  w.workplaces = {};
  for (const a of Object.values(w.agents)) delete a.job;
  sim.economy = new Economy(() => 0);
  for (const { kind, till, slots } of kinds) {
    const wp = newWorkplace(sim, kind, null)!;
    wp.till = till;
    if (slots !== undefined) wp.slots = slots;
  }
  return { sim, w, eco: sim.economy };
}

test('un nouveau lieu de travail est un bâtiment raccordé au réseau', () => {
  const { sim, w } = village([]);
  const wp = newWorkplace(sim, 'moulin', null)!;
  assert.equal(w.houses[wp.houseId].kind, 'travail');
  assert.equal(w.houses[wp.houseId].style, 'moulin');
  assert.ok(Object.values(w.roads).some((r) => r.a === wp.houseId || r.b === wp.houseId));
  assert.ok(sim.journal.events.some((e) => e.type === 'workplace.opened'));
});

test('la seule boulangerie fait faillite : une autre ouvre aussitôt', () => {
  const { sim, w, eco } = village([
    { kind: 'boulangerie', till: 0 }, { kind: 'ferme', till: 500 }, { kind: 'moulin', till: 500 }, { kind: 'scierie', till: 500 },
  ]);
  const old = Object.values(w.workplaces).find((x) => x.kind === 'boulangerie')!;
  for (let d = 0; d < 9; d++) eco.evening(sim);
  assert.ok(sim.journal.events.some((e) => e.type === 'workplace.closed'));
  assert.equal(w.workplaces[old.id], undefined);
  assert.ok(Object.values(w.workplaces).some((x) => x.kind === 'boulangerie'), 'aucune boulangerie rouverte');
});

test('trop de sans-emploi : le plus riche ouvre un lieu de travail et y investit', () => {
  const { sim, w, eco } = village([
    // Caisses au niveau du fonds de caisse : pas de surplus versé au maire ce soir-là.
    { kind: 'boulangerie', till: 30, slots: 0 }, { kind: 'ferme', till: 30, slots: 0 }, { kind: 'moulin', till: 30, slots: 0 }, { kind: 'scierie', till: 30, slots: 0 },
  ]);
  const rich = Object.values(w.agents)[3];
  rich.inventory = { pain: 0, bois: 0, outils: 0, pieces: 50 };
  const before = Object.keys(w.workplaces).length;
  eco.evening(sim);
  const created = Object.values(w.workplaces).slice(before);
  assert.equal(created.length, 1);
  assert.equal(created[0].ownerId, rich.id);
  assert.equal(rich.inventory.pieces, 30);
});

test('un seul lieu de travail créé par soir', () => {
  const { sim, w, eco } = village([]);
  eco.evening(sim);
  assert.equal(Object.keys(w.workplaces).length, 1);
});

test('chaque lieu de travail porte l’époque ancienne', () => {
  const { sim } = village([]);
  const wp: Workplace = newWorkplace(sim, 'ferme', null)!;
  assert.equal(wp.era, 'ancienne');
});

test('pas assez de pain pour tout le monde : une boulangerie de plus', () => {
  const { sim, w, eco } = village([
    { kind: 'boulangerie', till: 30 }, { kind: 'ferme', till: 30 }, { kind: 'moulin', till: 30 }, { kind: 'scierie', till: 30 },
  ]);
  // 13 habitants : il faut ~21 pains par jour ; une boulangerie à 1 poste n'en cuit que 12.
  Object.values(w.workplaces).find((x) => x.kind === 'boulangerie')!.slots = 1;
  eco.evening(sim);
  assert.equal(Object.values(w.workplaces).filter((x) => x.kind === 'boulangerie').length, 2);
});

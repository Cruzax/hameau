import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Workplace, WorkplaceKind } from '@hameau/shared';
import { Economy } from '../sim/economy';
import { newSim } from './helpers';

/** Village vidé de ses emplois, avec un lieu de travail par type demandé. */
function setup(kinds: { kind: WorkplaceKind; till: number }[]) {
  const sim = newSim();
  const w = sim.world;
  w.workplaces = {};
  for (const a of Object.values(w.agents)) delete a.job;
  kinds.forEach(({ kind, till }, i) => {
    const id = `wp-${i}`;
    w.houses[id] = { id, ownerId: null, kind: 'travail', position: { x: -20 + i * 6, z: -20 }, rotation: 0, style: 'ferme', wallColor: '#fff', roofColor: '#a33' };
    const wp: Workplace = { id, kind, era: 'ancienne', houseId: id, ownerId: null, slots: 1, workers: [], till, stock: {}, unpaidDays: 0, openedDay: 1 };
    w.workplaces[id] = wp;
  });
  // Toujours présent au travail (pas d'absence tirée au sort).
  const eco = new Economy(() => 0, false);
  sim.economy = eco;
  return { sim, w, eco };
}

test('un sans-emploi est embauché le matin et payé le soir', () => {
  const { sim, w, eco } = setup([{ kind: 'scierie', till: 100 }]);
  const a = Object.values(w.agents).find((x) => x.id !== w.mayorId)!;
  for (const x of Object.values(w.agents)) if (x.id !== a.id) x.job = { workplaceId: 'aucun', since: 0, wage: 0 };
  const before = a.inventory?.pieces ?? 5;
  eco.morning(sim);
  assert.equal(a.job?.workplaceId, 'wp-0');
  eco.evening(sim);
  assert.equal(a.inventory!.pieces, before + 4);
  assert.ok(sim.journal.events.some((e) => e.type === 'job.changed' && /trouve du travail/.test(e.text)));
});

test('trois soirs sans paie : le dernier embauché est renvoyé', () => {
  const { sim, w, eco } = setup([{ kind: 'ferme', till: 0 }]);
  const a = Object.values(w.agents)[0];
  assert.ok(eco.hire(sim, a.id, 'wp-0'));
  for (let i = 0; i < 3; i++) {
    eco.morning(sim);
    eco.evening(sim);
  }
  assert.equal(a.job, undefined);
  assert.ok(sim.journal.events.some((e) => e.type === 'job.changed' && e.actors.includes(a.id) && /perd son emploi|renvoy/.test(e.text)));
});

test('un salarié part pour un emploi mieux payé dès qu’une place se libère', () => {
  const { sim, w, eco } = setup([{ kind: 'ferme', till: 100 }, { kind: 'forge', till: 100 }]);
  w.workplaces['wp-0'].slots = 2;
  const [a, b, c] = Object.values(w.agents);
  eco.hire(sim, c.id, 'wp-0'); // la ferme garde quelqu'un
  eco.hire(sim, a.id, 'wp-0'); // ferme : 3
  eco.hire(sim, b.id, 'wp-1'); // forge : 6, seule place prise
  for (const x of Object.values(w.agents)) if (!x.job) x.job = { workplaceId: 'aucun', since: 0, wage: 0 };
  eco.quit(sim, b.id, 'part de la forge');
  b.job = { workplaceId: 'aucun', since: 0, wage: 0 };
  eco.morning(sim);
  assert.equal(a.job?.workplaceId, 'wp-1');
});

test('le patron prend la moitié de ce qui dépasse le fonds de caisse', () => {
  const { sim, w, eco } = setup([{ kind: 'moulin', till: 60 }]);
  const [boss, worker] = Object.values(w.agents);
  w.workplaces['wp-0'].ownerId = boss.id;
  eco.hire(sim, worker.id, 'wp-0');
  for (const x of Object.values(w.agents)) if (!x.job) x.job = { workplaceId: 'aucun', since: 0, wage: 0 };
  const before = boss.inventory?.pieces ?? 5;
  eco.morning(sim);
  eco.evening(sim);
  // 60 - 4 de salaire = 56 ; au-dessus de 40, 16 de surplus : le patron en prend 8, la caisse garde 48.
  assert.equal(w.workplaces['wp-0'].till, 48);
  assert.equal(boss.inventory!.pieces, before + 8);
});

test('un lieu tenu par le village garde son argent', () => {
  const { sim, w, eco } = setup([{ kind: 'moulin', till: 60 }]);
  const mayor = w.agents[w.mayorId];
  const before = mayor.inventory?.pieces ?? 5;
  eco.evening(sim);
  assert.equal(w.workplaces['wp-0'].till, 60);
  assert.equal(mayor.inventory!.pieces, before);
});

test('un lieu sans personne est pourvu en premier, même s’il paie moins', () => {
  const { sim, w, eco } = setup([{ kind: 'forge', till: 100 }, { kind: 'ferme', till: 100 }]);
  w.workplaces['wp-0'].slots = 2;
  const [a, b] = Object.values(w.agents);
  eco.hire(sim, a.id, 'wp-0');
  for (const x of Object.values(w.agents)) if (x.id !== b.id && !x.job) x.job = { workplaceId: 'aucun', since: 0, wage: 0 };
  eco.morning(sim);
  assert.equal(b.job?.workplaceId, 'wp-1');
});

test('le seul employé d’un lieu ne le quitte pas pour mieux payé', () => {
  const { sim, w, eco } = setup([{ kind: 'ferme', till: 100 }, { kind: 'forge', till: 100 }]);
  const [a] = Object.values(w.agents);
  eco.hire(sim, a.id, 'wp-0');
  for (const x of Object.values(w.agents)) if (!x.job) x.job = { workplaceId: 'aucun', since: 0, wage: 0 };
  eco.morning(sim);
  assert.equal(a.job?.workplaceId, 'wp-0');
});

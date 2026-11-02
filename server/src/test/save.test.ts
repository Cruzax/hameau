import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FounderSpec } from '@hameau/shared';
import { newSim } from './helpers';

const FOUNDERS: FounderSpec[] = [
  { name: 'Maxence', traits: ['ambitieux'], role: 'auto' },
  { name: 'Lina', traits: ['honnete', 'travailleur'], role: 'auto' },
  { name: 'Félix', traits: ['menteur', 'malin'], role: 'auto' },
  { name: 'Rose', traits: ['fouineur'], role: 'auto' },
];

test('une partie sauvegardée reprend là où elle s’était arrêtée, rouages compris', async () => {
  const sim = newSim();
  sim.reset({ founders: FOUNDERS });
  for (let i = 0; i < 6 * sim.clock.ticksPerDay + 77; i++) {
    sim.tick();
    if (i % 4 === 0) await new Promise((r) => setImmediate(r));
  }
  // structuredClone : la même copie que fait IndexedDB (échoue s'il reste une fonction).
  const saved = structuredClone(sim.save());

  const back = newSim();
  assert.ok(back.load(saved));
  assert.deepEqual(back.world, sim.world);
  assert.equal(back.journal.events.length, sim.journal.events.length);
  assert.deepEqual(back.save().state, sim.save().state);
  assert.equal(typeof (back.life as unknown as { rand: unknown }).rand, 'function');

  // Et la vie continue : on enchaîne deux jours sans accroc, les numéros d'événements se suivent.
  const lastSeq = back.journal.events.at(-1)!.seq;
  for (let i = 0; i < 2 * back.clock.ticksPerDay; i++) {
    back.tick();
    if (i % 4 === 0) await new Promise((r) => setImmediate(r));
  }
  assert.ok(back.clock.day >= 8);
  assert.equal(back.journal.events.find((e) => e.seq > lastSeq)?.seq, lastSeq + 1);
});

test('une sauvegarde d’une autre version est ignorée', () => {
  const sim = newSim();
  assert.equal(sim.load({ ...sim.save(), version: -1 }), false);
});

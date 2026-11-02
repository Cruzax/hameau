import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FounderSpec } from '@hameau/shared';
import { checkTreasures, homeOf, rebuildRuins, REBUILD_DAYS, TREASURE_AMOUNT, wreckHouse } from '../sim/disasters';
import { startEffect, tickEffects } from '../sim/effects';
import { newSim } from './helpers';

const FOUNDERS: FounderSpec[] = [
  { name: 'Lucas', traits: ['honnete'], role: 'auto', sex: 'M', orientation: 'hetero' },
  { name: 'Chloé', traits: ['genereux'], role: 'auto', sex: 'F', orientation: 'hetero' },
  { name: 'Greg', traits: ['travailleur'], role: 'auto', sex: 'M', orientation: 'gay' },
  { name: 'Melissa', traits: ['reveur'], role: 'auto', sex: 'F', orientation: 'bi' },
];

function village() {
  const sim = newSim();
  sim.reset({ founders: FOUNDERS });
  return sim;
}
const byName = (sim: ReturnType<typeof village>, n: string) => Object.values(sim.world.agents).find((a) => a.name === n)!;

test('la tornade emporte une maison ; ses habitants sont hébergés puis rentrent après la reconstruction', () => {
  const sim = village();
  const lucas = byName(sim, 'Lucas');
  const house = lucas.houseId;
  wreckHouse(sim, house);
  assert.ok(sim.world.houses[house].ruined);
  assert.notEqual(homeOf(lucas), house, 'pas d’hébergement');
  assert.ok(sim.journal.events.some((e) => e.type === 'house.destroyed'));
  sim.world.clock.day += REBUILD_DAYS;
  rebuildRuins(sim);
  assert.equal(sim.world.houses[house].ruined, undefined);
  assert.equal(homeOf(lucas), house);
  assert.ok(sim.journal.events.some((e) => e.type === 'house.rebuilt'));
});

test('la tornade passe sur la maison visée à mi-parcours', () => {
  const sim = village();
  sim.world.clock.day = 10;
  startEffect(sim, 'tornado');
  const e = sim.world.effects.find((x) => x.kind === 'tornado')!;
  assert.ok(e.houseId && e.path?.length === 3);
  while (sim.clock.tick < e.endTick) {
    sim.world.clock.tick++;
    tickEffects(sim);
  }
  assert.ok(sim.world.houses[e.houseId!].ruined);
});

test('un coffre posé près d’un passant est ramassé : le jackpot', () => {
  const sim = village();
  const chloe = byName(sim, 'Chloé');
  const before = chloe.inventory!.pieces;
  const spot = { ...sim.world.houses[chloe.houseId].position };
  sim.command({ type: 'god.treasure', position: spot });
  sim.world.clock.tick += sim.clock.ticksPerDay / 24;
  for (const a of Object.values(sim.world.agents)) a.location = { kind: 'home' };
  chloe.location = { kind: 'walking', to: 'place', purpose: 'promenade', path: [spot, { x: spot.x + 30, z: spot.z }], startTick: sim.clock.tick, speed: 0.1, length: 30 };
  checkTreasures(sim);
  assert.equal(sim.world.treasures?.length, 0);
  assert.equal(chloe.inventory!.pieces, before + TREASURE_AMOUNT);
});

test('un coffre que personne ne croise est trouvé au bout d’un jour', () => {
  const sim = village();
  sim.command({ type: 'god.treasure', position: { x: 500, z: 500 } });
  checkTreasures(sim);
  assert.equal(sim.world.treasures?.length, 1);
  sim.world.clock.tick += sim.clock.ticksPerDay;
  checkTreasures(sim);
  assert.equal(sim.world.treasures?.length, 0);
});

test('coup de foudre : seulement si l’attirance est réciproque', () => {
  const sim = village();
  const [lucas, chloe, greg] = ['Lucas', 'Chloé', 'Greg'].map((n) => byName(sim, n));
  sim.command({ type: 'god.love', a: lucas.id, b: greg.id });
  assert.equal(lucas.family?.partnerId, undefined);
  sim.command({ type: 'god.love', a: lucas.id, b: chloe.id });
  assert.equal(lucas.family?.partnerId, chloe.id);
});

test('argent, récolte miracle, krach, accusation', () => {
  const sim = village();
  const greg = byName(sim, 'Greg');
  const p = greg.inventory!.pieces;
  sim.command({ type: 'god.money', agentId: greg.id, delta: 25 });
  assert.equal(greg.inventory!.pieces, p + 25);
  sim.command({ type: 'god.money', agentId: greg.id, delta: -1000 });
  assert.equal(greg.inventory!.pieces, 0);
  const bread = greg.inventory!.pain;
  sim.command({ type: 'god.harvest' });
  assert.equal(greg.inventory!.pain, bread + 3);
  sim.command({ type: 'god.crash' });
  assert.ok(Object.values(sim.world.workplaces).every((w) => w.till === 0));
  sim.command({ type: 'god.accuse', agentId: greg.id });
  assert.ok(sim.journal.events.some((e) => e.type === 'crime.theft' && e.actors.includes(greg.id)));
});

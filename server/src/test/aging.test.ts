import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageOf, lifespanOf, type FounderSpec } from '@hameau/shared';
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

test('chacun a son âge et une durée de vie à lui, entre 170 et 260 jours', () => {
  const sim = village();
  for (const a of Object.values(sim.world.agents)) {
    assert.ok(ageOf(a, 1) >= 40, 'un fondateur arrive adulte');
    assert.ok(lifespanOf(a) >= 170 && lifespanOf(a) < 260);
    assert.equal(lifespanOf(a), lifespanOf(a));
  }
});

test('un ancien s’éteint : le conjoint hérite, la maison reste à la famille, obsèques sur la place', () => {
  const sim = village();
  const [lucas, chloe] = [byName(sim, 'Lucas'), byName(sim, 'Chloé')];
  sim.life.pair(sim, lucas, chloe);
  chloe.houseId = lucas.houseId;
  lucas.inventory = { pain: 0, bois: 0, outils: 0, pieces: 50 };
  const before = chloe.inventory?.pieces ?? 0;
  sim.life.die(sim, lucas);
  assert.equal(sim.world.agents[lucas.id], undefined);
  assert.equal(chloe.inventory!.pieces, before + 50);
  assert.equal(sim.world.houses[lucas.houseId].ownerId, chloe.id);
  assert.equal(chloe.family?.partnerId, undefined);
  assert.ok(sim.journal.events.some((e) => e.type === 'agent.died' && /éteint paisiblement/.test(e.text)));
});

test('quand le maire s’éteint, quelqu’un reprend l’écharpe', () => {
  const sim = village();
  const mayor = sim.world.agents[sim.world.mayorId];
  sim.life.die(sim, mayor);
  assert.ok(sim.world.agents[sim.world.mayorId], 'plus de maire');
});

test('la rancune s’efface avec le temps', () => {
  const sim = village();
  const [a, b] = [byName(sim, 'Greg'), byName(sim, 'Melissa')];
  a.opinions[b.id] = -0.9;
  b.opinions[a.id] = -0.9;
  for (let i = 0; i < 200 && (a.opinions[b.id] ?? 0) < -0.3; i++) (sim.life as unknown as { healGrudges(s: unknown): void }).healGrudges(sim);
  assert.ok(a.opinions[b.id] >= -0.3);
});

test('une maison restée vide est démontée ; un arrivant bâtit sa propre maison', async () => {
  const { sweepEmptyHouses } = await import('../sim/god');
  const sim = village();
  const melissa = byName(sim, 'Melissa');
  const house = melissa.houseId;
  sim.life.die(sim, melissa);
  sweepEmptyHouses(sim);
  const h = sim.world.houses[house];
  assert.ok(!h || h.kind === 'carrefour', 'la maison vide est toujours là');
  assert.ok(Object.values(sim.world.agents).every((a) => sim.world.houses[a.houseId]), 'quelqu’un a perdu sa maison');
});

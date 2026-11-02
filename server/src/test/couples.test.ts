import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attracted, type Agent } from '@hameau/shared';
import { newSim } from './helpers';

const person = (sex: 'M' | 'F', orientation: 'hetero' | 'bi' | 'gay') => ({ sex, orientation }) as Agent;

test('l’attirance suit le sexe et l’orientation', () => {
  assert.equal(attracted(person('M', 'hetero'), person('F', 'hetero')), true);
  assert.equal(attracted(person('M', 'hetero'), person('M', 'gay')), false);
  assert.equal(attracted(person('F', 'gay'), person('F', 'bi')), true);
  assert.equal(attracted(person('F', 'gay'), person('M', 'bi')), false);
  assert.equal(attracted(person('M', 'bi'), person('M', 'gay')), true);
});

/** Deux habitants qui s'adorent pendant des jours : forment-ils un couple ? */
function fallInLove(a: Partial<Agent>, b: Partial<Agent>) {
  const sim = newSim();
  const [x, y] = Object.values(sim.world.agents);
  for (const z of Object.values(sim.world.agents)) delete z.family;
  Object.assign(x, a);
  Object.assign(y, b);
  x.opinions[y.id] = 0.9;
  y.opinions[x.id] = 0.9;
  const life = sim.life as unknown as { couples: (s: typeof sim) => void };
  for (let d = 0; d < 6; d++) life.couples(sim);
  return { sim, x, y, together: x.family?.partnerId === y.id };
}

test('deux hommes hétéros ne forment pas de couple', () => {
  assert.equal(fallInLove(person('M', 'hetero'), person('M', 'hetero')).together, false);
});

test('deux hommes gays forment un couple', () => {
  assert.equal(fallInLove(person('M', 'gay'), person('M', 'gay')).together, true);
});

test('un couple de même sexe adopte un enfant', () => {
  const { sim, x, y } = fallInLove(person('F', 'gay'), person('F', 'bi'));
  const life = sim.life as unknown as { birth: (s: typeof sim, a: Agent, b: Agent) => void };
  life.birth(sim, x, y);
  assert.ok(sim.journal.events.some((e) => e.type === 'agent.born' && /adopt/.test(e.text)), 'pas d’adoption');
  const child = Object.values(sim.world.agents).find((a) => a.family?.parentIds.includes(x.id))!;
  assert.ok(child.sex === 'M' || child.sex === 'F');
});

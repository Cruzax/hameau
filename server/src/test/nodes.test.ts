import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeedWorld, isDwelling, type House } from '@hameau/shared';
import { createProvider } from '../llm';
import { createLLMBrain } from '../agents/llmBrain';
import { Sim } from '../sim/Sim';
import { Journal } from '../store/journal';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const newSim = () => new Sim(createLLMBrain(createProvider()), new Journal(join(mkdtempSync(join(tmpdir(), 'hameau-')), 'j.jsonl')), () => {});

test('un carrefour n’est pas une maison habitable', () => {
  const j: House = { id: 'j-test', kind: 'carrefour', ownerId: null, position: { x: 15, z: 15 }, rotation: 0, style: 'carrefour', wallColor: '#000', roofColor: '#000' };
  assert.equal(isDwelling(j), false);
  assert.equal(isDwelling(Object.values(createSeedWorld().houses)[0]), true);
});

test('un nouvel arrivant ne s’installe pas dans un carrefour', () => {
  const sim = newSim();
  sim.world.houses['j-test'] = { id: 'j-test', kind: 'carrefour', ownerId: null, position: { x: 15, z: 15 }, rotation: 0, style: 'carrefour', wallColor: '#000', roofColor: '#000' };
  const before = new Set(Object.keys(sim.world.agents));
  const life = sim.life as unknown as { rand: () => number; newcomers: (s: Sim) => void };
  Object.defineProperty(life, 'rand', { value: () => 0.5 });
  life.newcomers(sim);
  const added = Object.values(sim.world.agents).filter((a) => !before.has(a.id));
  for (const a of added) assert.notEqual(a.houseId, 'j-test');
  assert.equal(sim.world.houses['j-test'].ownerId, null);
});

test('le monde de départ a un registre de lieux de travail', () => {
  assert.deepEqual(createSeedWorld().workplaces, {});
});

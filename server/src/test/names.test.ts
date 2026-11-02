import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSim } from './helpers';

type Namer = { freshName(s: unknown, sex: 'M' | 'F'): string };

test('jamais deux fois le même prénom, même après un départ, et jamais « Petit … »', () => {
  const sim = newSim();
  const life = sim.life as unknown as Namer;
  const seen = new Set(Object.values(sim.world.agents).map((a) => a.name));
  const gone = Object.values(sim.world.agents)[0];
  life.freshName(sim, 'F'); // le village a vu passer tout le monde
  delete sim.world.agents[gone.id];
  for (let i = 0; i < 300; i++) {
    const name = life.freshName(sim, i % 2 ? 'M' : 'F');
    assert.ok(!seen.has(name), `${name} déjà porté`);
    assert.ok(!name.startsWith('Petit '));
    seen.add(name);
  }
});

test('le prénom va avec le sexe', () => {
  const sim = newSim();
  const life = sim.life as unknown as Namer;
  const boys = Array.from({ length: 40 }, () => life.freshName(sim, 'M'));
  const girls = Array.from({ length: 40 }, () => life.freshName(sim, 'F'));
  for (const n of ['Chloé', 'Lina', 'Léa', 'Rose']) assert.ok(!boys.includes(n), `garçon prénommé ${n}`);
  for (const n of ['Hugo', 'Lucas', 'Théo', 'Noah']) assert.ok(!girls.includes(n), `fille prénommée ${n}`);
});

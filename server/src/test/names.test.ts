import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSim } from './helpers';

test('jamais deux fois le même prénom, même après un départ, et jamais « Petit … »', () => {
  const sim = newSim();
  const life = sim.life as unknown as { freshName(s: typeof sim): string };
  const seen = new Set(Object.values(sim.world.agents).map((a) => a.name));
  const gone = Object.values(sim.world.agents)[0];
  life.freshName(sim); // le village a vu passer tout le monde
  delete sim.world.agents[gone.id];
  for (let i = 0; i < 300; i++) {
    const name = life.freshName(sim);
    assert.ok(!seen.has(name), `${name} déjà porté`);
    assert.ok(!name.startsWith('Petit '));
    seen.add(name);
  }
});

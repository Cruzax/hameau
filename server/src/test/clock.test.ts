import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeedWorld } from '@hameau/shared';

test('une journée dure 5 minutes en x1', () => {
  const c = createSeedWorld().clock;
  assert.equal(c.ticksPerDay * c.tickMs, 5 * 60 * 1000);
  assert.equal(c.ticksPerDay, 480); // les durées en ticks gardent leur sens en heures de village
});

test('runVillage fait tourner 3 jours sans planter', async () => {
  const { runVillage } = await import('./runVillage');
  const { sim } = await runVillage({ days: 3 });
  assert.equal(sim.clock.day, 4);
});

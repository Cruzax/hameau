import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dist, distToPolyline, isBuildable, VALLEY_RADIUS } from '@hameau/shared';
import { findSpot } from '../sim/god';
import { newSim } from './helpers';

test('la vallée constructible va jusqu’au pied des collines', () => {
  const w = newSim().world;
  assert.equal(VALLEY_RADIUS, 36);
  assert.equal(isBuildable({ x: 30, z: 0 }, w), true);
  assert.equal(isBuildable({ x: 44, z: 0 }, w), false);
  const inRiver = w.terrain.river.points[Math.floor(w.terrain.river.points.length / 2)];
  assert.equal(isBuildable(inRiver, w), false);
  assert.equal(isBuildable(w.terrain.plaza.center, w), false);
});

test('la vallée accueille au moins 55 bâtiments, jamais serrés ni dans l’eau', () => {
  const sim = newSim();
  const w = sim.world;
  let placed = 0;
  for (let i = 0; i < 200; i++) {
    const anchors = Object.values(w.houses);
    const spot = anchors.map((h) => findSpot(sim, h.position)).find(Boolean);
    if (!spot) break;
    w.houses[`t-${i}`] = { id: `t-${i}`, ownerId: null, kind: 'maison', position: spot, rotation: 0, style: 'chaumiere', wallColor: '#fff', roofColor: '#a33' };
    placed++;
  }
  const all = Object.values(w.houses);
  assert.ok(all.length >= 55, `seulement ${all.length} bâtiments`);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) assert.ok(dist(all[i].position, all[j].position) >= 5.5 - 1e-9 || !all[i].id.startsWith('t-') && !all[j].id.startsWith('t-'));
    assert.ok(distToPolyline(all[i].position, w.terrain.river.points) > w.terrain.river.width / 2);
  }
  // Vallée pleine : findSpot rend null au lieu d'empiler.
  assert.ok(placed < 200);
});

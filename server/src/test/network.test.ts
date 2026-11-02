import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDwelling } from '@hameau/shared';
import { findSpot } from '../sim/god';
import { bankOf, connectNode, route } from '../sim/network';
import { metrics } from '../tools/metrics';
import { newSim } from './helpers';

/** Remplit la vallée de 40 nœuds raccordés au réseau. */
function fill(sim: ReturnType<typeof newSim>, n: number) {
  for (let i = 0; i < n; i++) {
    const spot = Object.values(sim.world.houses).map((h) => findSpot(sim, h.position)).find(Boolean);
    if (!spot) break;
    sim.world.houses[`t-${i}`] = { id: `t-${i}`, ownerId: null, kind: 'maison', position: spot, rotation: 0, style: 'chaumiere', wallColor: '#fff', roofColor: '#a33' };
    connectNode(sim, `t-${i}`);
  }
}

test('le réseau de départ est propre : 2 ponts, aucune route qui se croise', () => {
  const sim = newSim();
  const m = metrics([], sim.world);
  assert.equal(m.bridges, 2);
  assert.equal(m.crossings, 0);
});

test('40 bâtiments de plus : toujours 2 ponts et aucun croisement', () => {
  const sim = newSim();
  fill(sim, 40);
  const m = metrics([], sim.world);
  assert.equal(m.bridges, 2);
  assert.equal(m.crossings, 0);
  for (const h of Object.values(sim.world.houses)) assert.ok(route(sim.world, 'h-maire', h.id) || h.id === 'h-maire', `${h.id} injoignable`);
});

/** Deux habitants de rives opposées. */
function acrossRiver(sim: ReturnType<typeof newSim>) {
  const w = sim.world;
  const agents = Object.values(w.agents);
  for (const a of agents) for (const b of agents) {
    if (bankOf(w, w.houses[a.houseId].position) !== bankOf(w, w.houses[b.houseId].position)) return [a, b] as const;
  }
  throw new Error('aucune paire sur deux rives');
}

const runTicks = (sim: ReturnType<typeof newSim>, n: number) => { for (let i = 0; i < n; i++) sim.tick(); };

test('un message traverse la rivière par un pont, sans relais', () => {
  const sim = newSim();
  const [a, b] = acrossRiver(sim);
  const msg = sim.send(a.id, b.id, 'chat', 'Bonjour de l’autre rive !')!;
  assert.ok(msg.route.length >= 2);
  const bridges = msg.route.filter((id) => metrics([], { ...sim.world, roads: { [id]: sim.world.roads[id] } }).bridges === 1);
  assert.equal(bridges.length, 1);
  runTicks(sim, 400);
  const events = sim.journal.events;
  assert.ok(events.some((e) => e.type === 'message.delivered' && (e.payload as { messageId?: string }).messageId === msg.id));
  assert.ok(!events.some((e) => e.type === 'message.relayed'));
});

test('un pont coupé en plein trajet : le messager rebrousse chemin', () => {
  const sim = newSim();
  const [a, b] = acrossRiver(sim);
  const msg = sim.send(a.id, b.id, 'chat', 'Message qui ne passera pas')!;
  const bridge = msg.route.find((id) => metrics([], { ...sim.world, roads: { [id]: sim.world.roads[id] } }).bridges === 1)!;
  sim.world.roads[bridge].status = 'cut';
  runTicks(sim, 400);
  assert.ok(sim.journal.events.some((e) => e.type === 'message.returned' && (e.payload as { messageId?: string }).messageId === msg.id));
  assert.equal(sim.world.messages[msg.id], undefined);
});

test('le destinataire quitte le village en plein trajet : la lettre se perd sans planter', () => {
  const sim = newSim();
  const [a, b] = acrossRiver(sim);
  const msg = sim.send(a.id, b.id, 'chat', 'Tu es encore là ?')!;
  runTicks(sim, 3);
  sim.daily.banish(sim, b.id);
  assert.doesNotThrow(() => runTicks(sim, 50));
  assert.equal(sim.world.messages[msg.id], undefined);
});

test('les carrefours ne sont jamais habités', () => {
  const sim = newSim();
  for (const h of Object.values(sim.world.houses)) if (h.kind === 'carrefour') assert.equal(isDwelling(h), false);
});

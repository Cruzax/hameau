import {
  dist,
  facing,
  isBuildable,
  type Agent,
  type AgentId,
  type ClientToServer,
  type House,
  type HouseId,
  type HouseStyle,
  type Road,
  type Role,
  type Vec2,
} from '@hameau/shared';
import type { Sim } from './Sim';
import { connectNode } from './network';

// Pouvoirs du panneau « Dieu ». Tout passe par le journal : chaque intervention est rejouable.

const STYLE_BY_ROLE: Partial<Record<Role, HouseStyle>> = { MENTEUR: 'cabane', VOLEUR: 'cabane', CITOYEN: 'chaumiere', BOULANGER: 'boulangerie' };
const PALETTE: [string, string][] = [
  ['#efd9b8', '#7a6a9e'], ['#e9d3b0', '#4f8a5b'], ['#f0dcc0', '#b5523b'], ['#ead8bd', '#3d6d8f'], ['#c69a6d', '#6b4a8a'],
];
const DEFAULT_GOALS: Partial<Record<Role, string[]>> = {
  MENTEUR: ['Semer la zizanie sans se faire prendre', 'Devenir indispensable'],
  CITOYEN: ['Se faire une place au village', 'Avoir son mot à dire'],
};

export const houseName = (sim: Sim, h: HouseId) => {
  const owner = sim.world.houses[h]?.ownerId;
  return owner ? sim.agent(owner)?.name ?? 'une maison vide' : 'une maison vide';
};

function roadsChanged(sim: Sim) {
  sim.broadcastPatch({ roads: sim.world.roads });
}

export function cutOrReopenRoad(sim: Sim, roadId: string) {
  const r = sim.world.roads[roadId];
  if (!r) return;
  r.status = r.status === 'open' ? 'cut' : 'open';
  const [a, b] = [houseName(sim, r.a), houseName(sim, r.b)];
  sim.emit(r.status === 'cut' ? 'road.cut' : 'road.added', [],
    r.status === 'cut' ? `✂️ La route entre ${a} et ${b} est coupée !` : `🛠 La route entre ${a} et ${b} est rouverte.`,
    { roadId: r.id, road: r });
  roadsChanged(sim);
}

export function buildRoad(sim: Sim, a: HouseId, b: HouseId, waypoints: Vec2[] = []) {
  const w = sim.world;
  if (a === b || !w.houses[a] || !w.houses[b]) return;
  const existing = Object.values(w.roads).find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  if (existing) {
    if (existing.status === 'cut') cutOrReopenRoad(sim, existing.id);
    return;
  }
  const road: Road = { id: `r-${a}-${b}-${sim.clock.tick}`, a, b, waypoints, status: 'open' };
  w.roads[road.id] = road;
  sim.emit('road.built', [], `🛤 Une nouvelle route relie ${houseName(sim, a)} et ${houseName(sim, b)}.`, { roadId: road.id, road });
  roadsChanged(sim);
}

/** Emplacement libre près d'une maison : loin des autres maisons, de la rivière et de la place. */
/** Écart minimal entre deux bâtiments (maisons, lieux de travail, carrefours). */
const MIN_GAP = 5.5;

/**
 * Emplacement libre près de `near`, sur des anneaux de rayon 6 à 14.
 * Sans `prefer`, le premier qui convient ; avec, le meilleur score (le plus grand).
 */
export function findSpot(sim: Sim, near: Vec2, prefer?: (p: Vec2) => number): Vec2 | null {
  const w = sim.world;
  let best: { p: Vec2; score: number } | null = null;
  for (const radius of [6, 7.5, 9, 10.5, 12, 14]) {
    for (let k = 0; k < 20; k++) {
      const angle = (k / 20) * Math.PI * 2 + radius;
      const p = { x: near.x + Math.cos(angle) * radius, z: near.z + Math.sin(angle) * radius };
      if (!isBuildable(p, w)) continue;
      if (Object.values(w.houses).some((h) => dist(p, h.position) < MIN_GAP)) continue;
      if (!prefer) return p;
      const score = prefer(p);
      if (!best || score > best.score) best = { p, score };
    }
  }
  return best?.p ?? null;
}

export function slug(sim: Sim, name: string) {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'habitant';
  let id = base;
  for (let i = 2; sim.world.agents[id] || sim.world.houses[`h-${id}`]; i++) id = `${base}-${i}`;
  return id;
}

/** Maison neuve pour `ownerId` près de `near` (pas encore ajoutée au monde), ou null faute de place. */
export function newHouse(sim: Sim, ownerId: AgentId, near: House, role: Role): House | null {
  const w = sim.world;
  const spot = findSpot(sim, near.position);
  if (!spot) return null;
  const [wall, roof] = PALETTE[Object.keys(w.houses).length % PALETTE.length];
  return {
    id: `h-${ownerId}`, ownerId, position: spot, rotation: facing(spot, w.terrain.plaza.center),
    style: STYLE_BY_ROLE[role] ?? 'atelier', wallColor: wall, roofColor: roof,
  };
}

/** Nouvel habitant : sa maison, une route vers la maison choisie, des opinions neutres. */
export function addAgent(sim: Sim, c: Extract<ClientToServer, { type: 'god.agent.add' }>) {
  const w = sim.world;
  const near = w.houses[c.near];
  const name = c.agent.name.trim().slice(0, 24);
  if (!near || !name) return;
  const id = slug(sim, name);
  const role = c.agent.role;
  const house = newHouse(sim, id, near, role);
  if (!house) {
    sim.emit('god.inject', [], `⚠️ Plus de place près de ${houseName(sim, near.id)} pour une nouvelle maison.`);
    return;
  }
  const agent: Agent = {
    id, name, role, houseId: house.id,
    personality: {
      traits: c.agent.personality?.traits?.length ? c.agent.personality.traits : role === 'MENTEUR' ? ['charmeur', 'manipulateur'] : ['discret', 'curieux'],
      tone: c.agent.personality?.tone || (role === 'MENTEUR' ? 'mielleux, plein de sous-entendus' : 'simple, poli'),
      honesty: c.agent.personality?.honesty ?? (role === 'MENTEUR' ? 0.1 : 0.7),
      ambition: c.agent.personality?.ambition ?? (role === 'MENTEUR' ? 0.8 : 0.4),
    },
    goals: c.agent.goals?.length ? c.agent.goals : DEFAULT_GOALS[role] ?? ['Trouver sa place au village'],
    memory: { short: [], long: '' },
    opinions: {},
    inbox: [],
    activity: 'idle',
    lastActionTick: sim.clock.tick,
    bornDay: sim.clock.day,
  };
  for (const other of Object.values(w.agents)) {
    agent.opinions[other.id] = 0;
    other.opinions[id] = 0;
  }
  w.houses[house.id] = house;
  w.agents[id] = agent;
  sim.emit('agent.added', [id], `🏡 ${name} s’installe au village, près de chez ${houseName(sim, near.id)}.`, { agentId: id, role, agent, house });
  sim.broadcastPatch({ houses: w.houses, agents: w.agents });
  connectNode(sim, house.id);
}

/** Exil : l'habitant part, sa maison reste vide. Si c'était le maire, le plus estimé reprend l'écharpe. */
export function exileAgent(sim: Sim, id: AgentId) {
  const w = sim.world;
  const a = w.agents[id];
  if (!a || Object.keys(w.agents).length <= 2) return;
  delete w.agents[id];
  const house = w.houses[a.houseId];
  if (house) house.ownerId = null;
  for (const m of Object.values(w.messages)) if (m.from === id || m.to === id) delete w.messages[m.id];
  for (const other of Object.values(w.agents)) delete other.opinions[id];
  sim.emit('agent.left', [id], `🧳 ${a.name} quitte le village. Sa maison reste vide.`, { agentId: id });
  if (w.mayorId === id) {
    const next = Object.values(w.agents).sort((x, y) => esteem(sim, y.id) - esteem(sim, x.id))[0];
    w.mayorId = next.id;
    sim.emit('mayor.elected', [next.id], `👑 ${next.name} reprend l’écharpe du maire parti.`);
  }
  sim.broadcastPatch({ agents: w.agents, houses: w.houses, mayorId: w.mayorId });
}

function esteem(sim: Sim, id: AgentId) {
  const xs = Object.values(sim.world.agents).filter((a) => a.id !== id).map((a) => a.opinions[id] ?? 0);
  return xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
}

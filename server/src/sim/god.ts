import {
  dist,
  facing,
  isBuildable,
  isDwelling,
  type Agent,
  type AgentId,
  type ClientToServer,
  type House,
  type HouseId,
  type HouseStyle,
  type Road,
  type Role,
  type Vec2,
  type Workplace,
  type WorkplaceKind,
  distToPolyline,
  NATURE_SPOTS,
} from '@hameau/shared';
import type { Sim } from './Sim';
import { connectNode } from './network';
import { isAdult } from './economy';
import { FOUNDING_COST, SLOTS } from './economyConfig';

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

/**
 * Une maison que plus personne n'habite est démontée : l'herbe repousse et le prochain arrivant bâtira ailleurs.
 * Une maison par où passent d'autres routes devient un simple carrefour, pour ne couper personne du village.
 * Rend false si un messager est en route sur l'un de ses chemins (on réessaiera plus tard).
 */
export function demolishHouse(sim: Sim, id: HouseId): boolean {
  const w = sim.world;
  const h = w.houses[id];
  if (!h) return false;
  const roads = Object.values(w.roads).filter((r) => r.a === id || r.b === id);
  if (Object.values(w.messages).some((m) => m.route.some((r) => roads.some((x) => x.id === r)))) return false;
  // Ceux qui étaient en visite rentrent chez eux.
  for (const a of Object.values(w.agents)) {
    const l = a.location;
    if ((l?.kind === 'at' && l.place === id) || (l?.kind === 'walking' && l.to === id)) a.location = { kind: 'home' };
  }
  if (roads.length <= 1) {
    for (const r of roads) delete w.roads[r.id];
    delete w.houses[id];
  } else {
    Object.assign(h, { kind: 'carrefour', ownerId: null, style: 'carrefour' });
    delete h.ruined;
  }
  sim.broadcastPatch({ houses: w.houses, roads: w.roads });
  return true;
}

/** Le soir : on démonte les maisons restées vides (départ, décès, bannissement). */
export function sweepEmptyHouses(sim: Sim) {
  const w = sim.world;
  // Une maison sans propriétaire mais encore habitée : un adulte resté là la reprend ;
  // des enfants seuls sont recueillis par un proche (famille d'abord, sinon l'adulte qu'ils aiment le plus).
  let changed = false;
  for (const h of Object.values(w.houses)) {
    if (!isDwelling(h) || (h.ownerId && w.agents[h.ownerId])) continue;
    const occupants = Object.values(w.agents).filter((a) => a.houseId === h.id);
    if (!occupants.length) continue;
    const adult = occupants.find((a) => isAdult(w, a));
    changed = true;
    if (adult) {
      h.ownerId = adult.id;
      continue;
    }
    for (const kid of occupants) {
      const kin = new Set([...(kid.family?.parentIds ?? []), ...Object.values(w.agents).filter((x) => x.family?.parentIds.some((p) => kid.family?.parentIds.includes(p))).map((x) => x.id)]);
      const host = Object.values(w.agents)
        .filter((x) => x.houseId !== h.id && isAdult(w, x) && w.houses[x.houseId]?.ownerId === x.id)
        .sort((x, y) => (kin.has(y.id) ? 2 : 0) + (kid.opinions[y.id] ?? 0) - ((kin.has(x.id) ? 2 : 0) + (kid.opinions[x.id] ?? 0)))[0];
      if (!host) continue;
      kid.houseId = host.houseId;
      kid.location = { kind: 'home' };
      sim.adjustOpinion(kid.id, host.id, 0.3);
      sim.emit('village.event', [host.id, kid.id], `🏡 ${host.name} recueille ${kid.name} sous son toit.`, { adopted: kid.id });
    }
  }
  if (changed) {
    sim.broadcastPatch({ houses: w.houses });
    sim.touchAgents();
  }
  let taken = 0;
  for (const h of Object.values(w.houses)) {
    if (!isDwelling(h) || h.ownerId || h.style === 'mairie' || h.id.startsWith('place-') || h.id.startsWith('pont-')) continue;
    if (Object.values(w.agents).some((a) => a.houseId === h.id || a.lodging === h.id)) continue;
    if (demolishHouse(sim, h.id)) taken++;
  }
  if (taken) sim.emit('house.built', [], taken > 1
    ? `🏚 ${taken} maisons vides sont démontées : l’herbe repousse, d’autres bâtiront ailleurs.`
    : '🏚 Une maison vide est démontée : l’herbe repousse, d’autres bâtiront ailleurs.', { demolished: taken });
}

/** Maison neuve pour `ownerId` près de `near` (pas encore ajoutée au monde), ou null faute de place. */
export function newHouse(sim: Sim, ownerId: AgentId, near: Vec2, role: Role): House | null {
  const w = sim.world;
  // On bâtit au plus près du point visé (son travail, ou la place).
  const spot = findSpot(sim, near, (p) => -dist(p, near));
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
  const house = newHouse(sim, id, near.position, role);
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

// ─── Lieux de travail ────────────────────────────────────────────────────────

const WORK_STYLE: Record<WorkplaceKind, HouseStyle> = {
  ferme: 'ferme', moulin: 'moulin', scierie: 'scierie', forge: 'forge', boulangerie: 'boulangerie', auberge: 'auberge', herboristerie: 'echoppe',
};
const WORK_WHERE: Record<WorkplaceKind, string> = {
  ferme: 'aux abords du village', moulin: 'au bord de la rivière', scierie: 'à l’orée de la forêt', forge: 'près de la place',
  boulangerie: 'près de la place', auberge: 'près de la place', herboristerie: 'près de la place',
};
const WORK_ARTICLE: Record<WorkplaceKind, string> = {
  ferme: 'une ferme', moulin: 'un moulin', scierie: 'une scierie', forge: 'une forge', boulangerie: 'une boulangerie', auberge: 'une auberge', herboristerie: 'une herboristerie',
};

let workplaceSeq = 0;

/** Point visé et préférence d'emplacement : fermes en bord de vallée, scierie vers la forêt, moulin au bord de l'eau. */
function workplaceSite(sim: Sim, kind: WorkplaceKind): { near: Vec2; prefer: (p: Vec2) => number } {
  const w = sim.world;
  const center = w.terrain.plaza.center;
  switch (kind) {
    case 'ferme': {
      const a = Math.random() * Math.PI * 2;
      const near = { x: Math.cos(a) * 26, z: Math.sin(a) * 26 };
      return { near, prefer: (p) => dist(p, center) };
    }
    case 'scierie':
      return { near: NATURE_SPOTS.foret, prefer: (p) => -dist(p, NATURE_SPOTS.foret) };
    case 'moulin': {
      const pts = w.terrain.river.points;
      const near = pts[1 + Math.floor(Math.random() * (pts.length - 2))];
      return { near, prefer: (p) => -Math.abs(distToPolyline(p, pts) - 5) - dist(p, center) * 0.05 };
    }
    default:
      return { near: center, prefer: (p) => -dist(p, center) };
  }
}

/**
 * Ouvre un lieu de travail : un bâtiment vide du bon style s'il y en a un, sinon un nouveau, raccordé au réseau.
 * Le fondateur investit 20 pièces et devient patron ; sans fondateur, c'est le village qui tient le lieu.
 */
export function newWorkplace(sim: Sim, kind: WorkplaceKind, founderId: AgentId | null): Workplace | null {
  const w = sim.world;
  const style = WORK_STYLE[kind];
  const used = new Set(Object.values(w.workplaces).map((x) => x.houseId));
  let house = Object.values(w.houses).find((h) => h.kind === 'travail' && h.style === style && !used.has(h.id));
  if (!house) {
    const site = workplaceSite(sim, kind);
    const spot = findSpot(sim, site.near, site.prefer) ?? Object.values(w.houses).map((h) => findSpot(sim, h.position, site.prefer)).find(Boolean);
    if (!spot) return null;
    const id = `w-${kind}-${sim.clock.tick}-${Object.keys(w.houses).length}`;
    house = { id, ownerId: null, kind: 'travail', position: spot, rotation: facing(spot, w.terrain.plaza.center), style, wallColor: '#ecdcbc', roofColor: '#8a4a2a' };
    w.houses[id] = house;
    connectNode(sim, id);
  }
  const founder = founderId ? w.agents[founderId] : undefined;
  if (founder) (founder.inventory ??= { pain: 1, bois: 1, outils: 0, pieces: 5 }).pieces -= FOUNDING_COST;
  const wp: Workplace = {
    id: `wp-${++workplaceSeq}-${house.id}`, kind, era: 'ancienne', houseId: house.id, ownerId: founder?.id ?? null,
    slots: SLOTS[kind], workers: [], till: FOUNDING_COST, stock: {}, unpaidDays: 0, openedDay: w.clock.day,
  };
  w.workplaces[wp.id] = wp;
  sim.emit('workplace.opened', founder ? [founder.id] : [],
    `🏗 Ouverture d’${WORK_ARTICLE[kind]} ${WORK_WHERE[kind]} (aux commandes : ${founder ? founder.name : 'le village'}).`,
    { workplaceId: wp.id, kind, ownerId: wp.ownerId });
  sim.broadcastPatch({ houses: w.houses, workplaces: w.workplaces });
  return wp;
}

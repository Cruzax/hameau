import {
  dist,
  distToPolyline,
  roadLength,
  roadPath,
  segmentIntersection,
  type AgentId,
  type HouseId,
  type Road,
  type RoadId,
  type Vec2,
  type WorldState,
} from '@hameau/shared';
import type { Sim } from './Sim';
import { buildRoad } from './god';

// Réseau de routes : chaque bâtiment se raccorde au plus proche voisin déjà relié, sur sa rive,
// sans croiser d'autre route. Les seules traversées de la rivière sont les ponts posés au départ.

/** Nœuds du pourtour de la place : le cœur du réseau. */
export const PLAZA_NODES = ['place-n', 'place-e', 'place-s', 'place-o'];

const segments = (pts: Vec2[]) => pts.slice(1).map((p, i) => [pts[i], p] as const);

/** Rive d'un point : -1 ou +1, selon le côté du segment de rivière le plus proche. */
export function bankOf(w: WorldState, p: Vec2): -1 | 1 {
  const pts = w.terrain.river.points;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToPolyline(p, [pts[i], pts[i + 1]]);
    if (d < bestD) [best, bestD] = [i, d];
  }
  const [a, b] = [pts[best], pts[best + 1]];
  return (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x) >= 0 ? 1 : -1;
}

/** Le tracé passe-t-il sur l'eau ? */
export function crossesRiver(path: Vec2[], w: WorldState) {
  const half = w.terrain.river.width / 2;
  return path.some((p) => distToPolyline(p, w.terrain.river.points) < half) ||
    segments(path).some(([a, b]) => segments(w.terrain.river.points).some(([c, d]) => segmentIntersection(a, b, c, d)));
}

/** Deux routes se coupent-elles ailleurs qu'à une extrémité commune ? */
export function roadsCross(w: WorldState, r: Road, s: Road) {
  if (r.a === s.a || r.a === s.b || r.b === s.a || r.b === s.b) return false;
  return segments(roadPath(r, w.houses)).some(([a, b]) => segments(roadPath(s, w.houses)).some(([c, d]) => segmentIntersection(a, b, c, d)));
}

function adjacency(w: WorldState, openOnly = true) {
  const adj = new Map<HouseId, { to: HouseId; road: Road }[]>();
  for (const r of Object.values(w.roads)) {
    if (openOnly && r.status !== 'open') continue;
    adj.set(r.a, [...(adj.get(r.a) ?? []), { to: r.b, road: r }]);
    adj.set(r.b, [...(adj.get(r.b) ?? []), { to: r.a, road: r }]);
  }
  return adj;
}

/** Nœuds reliés à la place (routes coupées comprises : elles seront réparées). */
function mainComponent(w: WorldState): Set<HouseId> {
  const adj = adjacency(w, false);
  const seen = new Set<HouseId>(PLAZA_NODES.filter((id) => w.houses[id]));
  const queue = [...seen];
  while (queue.length) for (const n of adj.get(queue.shift()!) ?? []) if (!seen.has(n.to)) (seen.add(n.to), queue.push(n.to));
  return seen;
}

/** Une route candidate est-elle propre : pas d'eau, pas de croisement, pas à travers un bâtiment ou la place ? */
function isClean(w: WorldState, road: Road): boolean {
  const path = roadPath(road, w.houses);
  if (crossesRiver(path, w)) return false;
  if (Object.values(w.roads).some((r) => roadsCross(w, road, r))) return false;
  for (const h of Object.values(w.houses)) {
    if (h.id === road.a || h.id === road.b) continue;
    if (distToPolyline(h.position, path) < (h.kind === 'carrefour' ? 1.2 : 2.4)) return false;
  }
  const { center, radius } = w.terrain.plaza;
  const toPlaza = PLAZA_NODES.includes(road.a) || PLAZA_NODES.includes(road.b);
  if (distToPolyline(center, path) < (toPlaza ? radius - 0.6 : radius + 0.4)) return false;
  return true;
}

/**
 * Raccorde `nodeId` au réseau principal : route droite vers le nœud relié le plus proche, sur la même rive,
 * qui reste propre. Rend la route créée, celle qui existait déjà, ou null s'il n'y a aucune solution.
 */
export function connectNode(sim: Sim, nodeId: HouseId, opts: { silent?: boolean } = {}): RoadId | null {
  const w = sim.world;
  const node = w.houses[nodeId];
  if (!node) return null;
  const main = mainComponent(w);
  if (main.has(nodeId)) return Object.values(w.roads).find((r) => r.a === nodeId || r.b === nodeId)?.id ?? null;
  const bank = bankOf(w, node.position);
  const candidates = Object.values(w.houses)
    .filter((h) => h.id !== nodeId && main.has(h.id) && bankOf(w, h.position) === bank)
    .sort((a, b) => dist(a.position, node.position) - dist(b.position, node.position));
  for (const c of candidates) {
    const road: Road = { id: 'candidate', a: nodeId, b: c.id, waypoints: [], status: 'open' };
    if (!isClean(w, road)) continue;
    if (opts.silent) {
      road.id = `r-${nodeId}-${c.id}`;
      w.roads[road.id] = road;
      return road.id;
    }
    buildRoad(sim, nodeId, c.id);
    return Object.values(w.roads).find((r) => (r.a === nodeId && r.b === c.id))?.id ?? null;
  }
  return null;
}

/** Raccorde tout ce qui ne l'est pas encore : la place, puis les têtes de pont, puis le reste du plus proche au plus loin. */
export function buildNetwork(sim: Sim, opts: { silent?: boolean } = {}) {
  const w = sim.world;
  const center = w.terrain.plaza.center;
  const bridgeheads = new Set(Object.values(w.houses).filter((h) => h.id.startsWith('pont-')).map((h) => h.id));
  const order = Object.values(w.houses)
    .filter((h) => !PLAZA_NODES.includes(h.id))
    .sort((a, b) => Number(bridgeheads.has(b.id)) - Number(bridgeheads.has(a.id)) || dist(a.position, center) - dist(b.position, center));
  for (const h of order) connectNode(sim, h.id, opts);
}

/** Plus court itinéraire (en longueur de route) entre deux nœuds, sur les routes ouvertes. */
export function route(w: WorldState, from: HouseId, to: HouseId): { roads: RoadId[]; nodes: HouseId[] } | null {
  if (from === to) return { roads: [], nodes: [from] };
  const adj = adjacency(w);
  const best = new Map<HouseId, { d: number; prev?: HouseId; road?: RoadId }>([[from, { d: 0 }]]);
  const open = new Set<HouseId>([from]);
  while (open.size) {
    let cur = '';
    for (const id of open) if (!cur || best.get(id)!.d < best.get(cur)!.d) cur = id;
    open.delete(cur);
    if (cur === to) break;
    for (const { to: n, road } of adj.get(cur) ?? []) {
      const d = best.get(cur)!.d + roadLength(road, w.houses);
      if (d < (best.get(n)?.d ?? Infinity)) {
        best.set(n, { d, prev: cur, road: road.id });
        open.add(n);
      }
    }
  }
  if (!best.has(to)) return null;
  const roads: RoadId[] = [];
  const nodes: HouseId[] = [to];
  for (let n = to; n !== from; n = best.get(n)!.prev!) {
    roads.unshift(best.get(n)!.road!);
    nodes.unshift(best.get(n)!.prev!);
  }
  return { roads, nodes };
}

/** Voisins : habitants dont la maison est à 4 routes au plus (carrefours compris). */
export function neighbors(w: WorldState, id: AgentId, maxRoads = 4): AgentId[] {
  const home = w.agents[id]?.houseId;
  if (!home) return [];
  const adj = adjacency(w);
  const depth = new Map<HouseId, number>([[home, 0]]);
  const queue = [home];
  while (queue.length) {
    const cur = queue.shift()!;
    if (depth.get(cur)! >= maxRoads) continue;
    for (const { to } of adj.get(cur) ?? []) if (!depth.has(to)) (depth.set(to, depth.get(cur)! + 1), queue.push(to));
  }
  return Object.values(w.agents).filter((a) => a.id !== id && a.houseId !== home && depth.has(a.houseId)).map((a) => a.id);
}

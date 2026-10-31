import { dist, houseDoor, NATURE_SPOTS, polylineLength, roadPath, type HouseId, type PlaceId, type Road, type Vec2, type WorldState } from '@hameau/shared';

// Itinéraires à pied : les habitants marchent de maison en maison par les routes ouvertes.
// La place du village est un nœud de plus, reliée aux maisons dont la route la traverse.

interface Edge { to: PlaceId; points: Vec2[]; length: number }

/** Point où un segment entre dans le cercle de la place (ou null). */
function enterCircle(a: Vec2, b: Vec2, c: Vec2, r: number): Vec2 | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const fx = a.x - c.x;
  const fz = a.z - c.z;
  const A = dx * dx + dz * dz;
  const B = 2 * (fx * dx + fz * dz);
  const C = fx * fx + fz * fz - r * r;
  const disc = B * B - 4 * A * C;
  if (A === 0 || disc < 0) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  if (t < 0 || t > 1) return null;
  return { x: a.x + dx * t, z: a.z + dz * t };
}

/** Morceau de route depuis la porte `from` jusqu'à l'entrée de la place, puis le centre. */
function toPlaza(road: Road, from: HouseId, w: WorldState): Vec2[] | null {
  const path = roadPath(road, w.houses);
  const oriented = road.a === from ? path : [...path].reverse();
  const { center, radius } = w.terrain.plaza;
  const out: Vec2[] = [oriented[0]];
  for (let i = 1; i < oriented.length; i++) {
    const hit = enterCircle(oriented[i - 1], oriented[i], center, radius);
    if (hit) return [...out, hit, { x: center.x, z: center.z }];
    out.push(oriented[i]);
  }
  return null;
}

function graph(w: WorldState): Map<PlaceId, Edge[]> {
  const g = new Map<PlaceId, Edge[]>();
  const add = (from: PlaceId, e: Edge) => g.set(from, [...(g.get(from) ?? []), e]);
  for (const road of Object.values(w.roads)) {
    if (road.status !== 'open' || !w.houses[road.a] || !w.houses[road.b]) continue;
    const path = roadPath(road, w.houses);
    const len = polylineLength(path);
    add(road.a, { to: road.b, points: path, length: len });
    add(road.b, { to: road.a, points: [...path].reverse(), length: len });
    for (const end of [road.a, road.b]) {
      const part = toPlaza(road, end, w);
      if (!part) continue;
      const l = polylineLength(part);
      add(end, { to: 'place', points: part, length: l });
      add('place', { to: end, points: [...part].reverse(), length: l });
    }
  }
  // Sentiers vers la nature, depuis les deux maisons habitées les plus proches.
  for (const [spot, p] of Object.entries(NATURE_SPOTS)) {
    const near = Object.values(w.houses)
      .filter((h) => h.ownerId)
      .sort((a, b) => dist(houseDoor(a), p) - dist(houseDoor(b), p))
      .slice(0, 2);
    for (const h of near) {
      const pts = [houseDoor(h), p];
      const l = dist(pts[0], p);
      add(h.id, { to: spot, points: pts, length: l });
      add(spot, { to: h.id, points: [p, pts[0]], length: l });
    }
  }
  return g;
}

/** Point d'arrivée concret d'un lieu (devant la porte, ou le centre de la place). */
export function placePoint(w: WorldState, place: PlaceId): Vec2 | null {
  if (place === 'place') return w.terrain.plaza.center;
  if (place === 'foret' || place === 'riviere') return NATURE_SPOTS[place];
  const h = w.houses[place];
  return h ? houseDoor(h) : null;
}

/** Plus court itinéraire à pied entre deux lieux, ou null si aucune route ouverte n'y mène. */
export function findPath(w: WorldState, from: PlaceId, to: PlaceId): { points: Vec2[]; length: number } | null {
  if (from === to) return null;
  const g = graph(w);
  const best = new Map<PlaceId, number>([[from, 0]]);
  const prev = new Map<PlaceId, { from: PlaceId; edge: Edge }>();
  const open = new Set<PlaceId>([from]);
  while (open.size) {
    let cur: PlaceId | null = null;
    for (const n of open) if (cur === null || best.get(n)! < best.get(cur)!) cur = n;
    open.delete(cur!);
    if (cur === to) break;
    for (const e of g.get(cur!) ?? []) {
      const d = best.get(cur!)! + e.length;
      if (d < (best.get(e.to) ?? Infinity)) {
        best.set(e.to, d);
        prev.set(e.to, { from: cur!, edge: e });
        open.add(e.to);
      }
    }
  }
  if (!prev.has(to)) return null;
  const legs: Edge[] = [];
  for (let n: PlaceId = to; n !== from; n = prev.get(n)!.from) legs.unshift(prev.get(n)!.edge);
  const points: Vec2[] = [];
  for (const leg of legs) for (const p of leg.points) if (!points.length || dist(points[points.length - 1], p) > 0.01) points.push(p);
  return { points, length: polylineLength(points) };
}

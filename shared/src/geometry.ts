import type { House, Road, Vec2 } from './types';

export const DOOR_OFFSET = 1.9;

/** Rotation Y pour qu'une maison en `p` regarde vers `target`. */
export function facing(p: Vec2, target: Vec2): number {
  return Math.atan2(target.x - p.x, target.z - p.z);
}

/** Point devant la porte d'une maison. */
export function houseDoor(h: House): Vec2 {
  // Un carrefour n'a pas de porte : la route passe par son centre.
  if (h.kind === 'carrefour') return h.position;
  return {
    x: h.position.x + Math.sin(h.rotation) * DOOR_OFFSET,
    z: h.position.z + Math.cos(h.rotation) * DOOR_OFFSET,
  };
}

/** Tracé complet d'une route : porte(a) → waypoints → porte(b). */
export function roadPath(road: Road, houses: Record<string, House>): Vec2[] {
  return [houseDoor(houses[road.a]), ...road.waypoints, houseDoor(houses[road.b])];
}

/** Tracé orienté depuis la maison `fromHouse` (sens de marche d'un messager). */
export function orientedRoadPath(road: Road, houses: Record<string, House>, fromHouse: string): Vec2[] {
  const path = roadPath(road, houses);
  return road.a === fromHouse ? path : path.reverse();
}

export function roadLength(road: Road, houses: Record<string, House>): number {
  return polylineLength(roadPath(road, houses));
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function polylineLength(pts: Vec2[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

/** Point à la fraction t (0..1) de la longueur d'une polyligne. Sert aux messagers. */
export function pointAlong(pts: Vec2[], t: number): { p: Vec2; heading: number } {
  const total = polylineLength(pts);
  let target = Math.min(Math.max(t, 0), 1) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = dist(a, b);
    if (target <= seg || i === pts.length - 1) {
      const k = seg === 0 ? 0 : Math.min(target / seg, 1);
      return {
        p: { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k },
        heading: Math.atan2(b.x - a.x, b.z - a.z),
      };
    }
    target -= seg;
  }
  return { p: pts[0], heading: 0 };
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

export function distToPolyline(p: Vec2, pts: Vec2[]): number {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, distToSegment(p, pts[i - 1], pts[i]));
  return d;
}

/** Intersection de [p1,p2] et [p3,p4] ; t est la position sur [p1,p2]. */
export function segmentIntersection(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): { p: Vec2; t: number } | null {
  const d = (p2.x - p1.x) * (p4.z - p3.z) - (p2.z - p1.z) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p3.x - p1.x) * (p4.z - p3.z) - (p3.z - p1.z) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.z - p1.z) - (p3.z - p1.z) * (p2.x - p1.x)) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { p: { x: p1.x + t * (p2.x - p1.x), z: p1.z + t * (p2.z - p1.z) }, t };
}

/** PRNG déterministe : le décor est identique à chaque chargement (utile pour les replays). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

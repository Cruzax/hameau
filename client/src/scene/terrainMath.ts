import { CatmullRomCurve3, Vector3 } from 'three';
import { distToPolyline, VALLEY_RADIUS, type Terrain, type Vec2 } from '@hameau/shared';

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const riverCache = new WeakMap<Terrain, Vec2[]>();

/** Tracé lissé de la rivière, partagé par le terrain (lit creusé), l'eau et les ponts. */
export function riverPath(terrain: Terrain): Vec2[] {
  let pts = riverCache.get(terrain);
  if (!pts) {
    const curve = new CatmullRomCurve3(terrain.river.points.map((p) => new Vector3(p.x, 0, p.z)));
    pts = curve.getSpacedPoints(240).map((v) => ({ x: v.x, z: v.z }));
    riverCache.set(terrain, pts);
  }
  return pts;
}

export const RIVER_BED = -0.7;
export const WATER_LEVEL = -0.22;

/** Hauteur du sol : village plat au centre, collines en périphérie, lit de rivière creusé. */
export function terrainHeight(x: number, z: number, terrain: Terrain): number {
  const d = Math.hypot(x, z);
  const n = Math.sin(x * 0.21) * Math.cos(z * 0.17) + 0.5 * Math.sin(x * 0.47 + z * 0.31);
  let h = smoothstep(VALLEY_RADIUS, 46, d) * (2.4 + n * 1.6);
  const halfW = terrain.river.width / 2;
  const rd = distToPolyline({ x, z }, riverPath(terrain));
  h = lerp(RIVER_BED, h, smoothstep(halfW * 0.6, halfW + 1.4, rd));
  return h;
}

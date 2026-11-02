import { dist, distToPolyline } from './geometry';
import type { Vec2, WorldState } from './types';

/** Rayon jusqu'où le sol reste plat : au-delà, les collines montent vers le bord de la carte. */
export const VALLEY_RADIUS = 36;

/** Peut-on bâtir ici ? Hors de la place, hors de la rivière, dans la vallée. */
export function isBuildable(p: Vec2, w: WorldState, margin = 0): boolean {
  const { plaza, river } = w.terrain;
  if (Math.hypot(p.x, p.z) > VALLEY_RADIUS - 3 - margin) return false;
  if (dist(p, plaza.center) < plaza.radius + 4 + margin) return false;
  if (distToPolyline(p, river.points) < river.width / 2 + 3.5 + margin) return false;
  return true;
}

import { distToPolyline, houseDoor, pointAlong, type Agent, type House, type WorldState } from '@hameau/shared';
import { riverPath } from './terrainMath';

const GROUND_Y = 0.07;
const BRIDGE_Y = 0.27;

/** Où l'habitant se tient : devant sa porte, un peu décalé pour ne pas cacher l'entrée. */
export function residentSpot(h: House, slot = 0): [number, number, number] {
  const door = houseDoor(h);
  // slot 0 : à droite de la porte ; les suivants (enfants, invités) de l'autre côté, en rang.
  const side = slot === 0 ? 0.9 : -0.7 - (slot - 1) * 0.55;
  return [door.x + Math.cos(h.rotation) * side, GROUND_Y, door.z - Math.sin(h.rotation) * side];
}

export interface Pose {
  x: number;
  y: number;
  z: number;
  heading: number;
  walking: boolean;
  /** Caché : endormi à l'intérieur. */
  hidden: boolean;
}

/** Rang d'un habitant parmi ceux qui se trouvent au même endroit (pour ne pas les superposer). */
function rankAt(world: WorldState, a: Agent, same: (x: Agent) => boolean) {
  return Object.values(world.agents).filter(same).findIndex((x) => x.id === a.id);
}

/** Position d'un habitant à l'instant `tick` : chez lui, en chemin, ou sur un lieu. */
export function agentPose(world: WorldState, agentId: string, tick: number): Pose | null {
  const a = world.agents[agentId];
  if (!a) return null;
  const home = world.houses[a.houseId];
  const l = a.location ?? { kind: 'home' as const };

  if (l.kind === 'walking') {
    const t = Math.min(1, ((tick - l.startTick) * l.speed) / Math.max(0.01, l.length));
    const { p, heading } = pointAlong(l.path, t);
    const onBridge = distToPolyline(p, riverPath(world.terrain)) < world.terrain.river.width * 0.65 + 0.6;
    return { x: p.x, y: onBridge ? BRIDGE_Y : GROUND_Y, z: p.z, heading, walking: true, hidden: false };
  }

  if (l.kind === 'at') {
    if (l.place === 'place') {
      // En cercle autour de la fontaine.
      const i = rankAt(world, a, (x) => x.location?.kind === 'at' && x.location.place === 'place');
      const angle = i * 0.7 + 0.3;
      const r = 2.3 + (i % 2) * 0.8;
      const c = world.terrain.plaza.center;
      return { x: c.x + Math.cos(angle) * r, y: GROUND_Y, z: c.z + Math.sin(angle) * r, heading: Math.atan2(-Math.cos(angle), -Math.sin(angle)), walking: false, hidden: false };
    }
    const h = world.houses[l.place];
    if (h) {
      const i = rankAt(world, a, (x) => x.location?.kind === 'at' && x.location.place === l.place);
      const [x, y, z] = residentSpot(h, 3 + i);
      return { x, y, z, heading: h.rotation + Math.PI, walking: false, hidden: false };
    }
  }

  if (!home) return null;
  const residents = Object.values(world.agents).filter((x) => x.houseId === home.id && x.id !== home.ownerId);
  const [x, y, z] = residentSpot(home, home.ownerId === a.id ? 0 : residents.indexOf(a) + 1);
  return { x, y, z, heading: home.rotation, walking: false, hidden: !!a.asleep };
}

/** Compatibilité : emplacement fixe d'un habitant chez lui. */
export function agentSpot(world: WorldState, agentId: string): [number, number, number] | null {
  const p = agentPose(world, agentId, world.clock.tick);
  return p ? [p.x, p.y, p.z] : null;
}

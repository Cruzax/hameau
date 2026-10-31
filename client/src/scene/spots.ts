import { houseDoor, type House, type WorldState } from '@hameau/shared';

/** Où l'habitant se tient : devant sa porte, un peu décalé pour ne pas cacher l'entrée. */
export function residentSpot(h: House, slot = 0): [number, number, number] {
  const door = houseDoor(h);
  // slot 0 : à droite de la porte ; les suivants (enfants) de l'autre côté, en rang.
  const side = slot === 0 ? 0.9 : -0.7 - (slot - 1) * 0.55;
  return [door.x + Math.cos(h.rotation) * side, 0.07, door.z - Math.sin(h.rotation) * side];
}

/** Emplacement d'un habitant donné : le propriétaire en slot 0, les autres occupants ensuite. */
export function agentSpot(world: WorldState, agentId: string): [number, number, number] | null {
  const a = world.agents[agentId];
  const h = a && world.houses[a.houseId];
  if (!h) return null;
  const guests = Object.values(world.agents).filter((x) => x.houseId === h.id && x.id !== h.ownerId);
  return residentSpot(h, h.ownerId === a.id ? 0 : guests.indexOf(a) + 1);
}

import type { AgentId, Road, WorldState } from '@hameau/shared';

/** Route ouverte reliant directement deux agents, s'il y en a une. */
export function roadBetween(w: WorldState, a: AgentId, b: AgentId): Road | undefined {
  const ha = w.agents[a]?.houseId;
  const hb = w.agents[b]?.houseId;
  return Object.values(w.roads).find(
    (r) => r.status === 'open' && ((r.a === ha && r.b === hb) || (r.a === hb && r.b === ha)),
  );
}

/** Agents joignables directement (voisins par une route ouverte). */
export function neighbors(w: WorldState, id: AgentId): AgentId[] {
  return Object.keys(w.agents).filter((other) => other !== id && roadBetween(w, id, other));
}

/** Premier voisin sur le plus court chemin (en nombre de routes) vers `to`, ou null si isolé. */
export function nextHop(w: WorldState, from: AgentId, to: AgentId): AgentId | null {
  if (from === to) return null;
  const prev = new Map<AgentId, AgentId>([[from, from]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of neighbors(w, cur)) {
      if (prev.has(n)) continue;
      prev.set(n, cur);
      if (n === to) {
        let step = to;
        while (prev.get(step) !== from) step = prev.get(step)!;
        return step;
      }
      queue.push(n);
    }
  }
  return null;
}

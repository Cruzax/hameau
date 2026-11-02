import type { Agent, WorldState } from './types';

/** Un enfant vit encore chez ses parents : on ne lui demande pas de travailler. */
const isChild = (a: Agent, w: WorldState) => !!a.family?.parentIds.length && w.houses[a.houseId]?.ownerId !== a.id;

/**
 * Satisfaction d'un habitant, de 0 (au fond du trou) à 1 (comblé) :
 * son humeur, s'il mange à sa faim, sa santé, s'il a un emploi, et ce qu'il pense du maire.
 */
export function satisfaction(a: Agent, w: WorldState): number {
  const n = a.needs ?? { satiete: 0.8, energie: 0.9, humeur: 0.7, sante: 1 };
  const work = a.job || isChild(a, w) ? 1 : 0;
  const mayor = a.id === w.mayorId ? 1 : ((a.opinions[w.mayorId] ?? 0) + 1) / 2;
  const s = 0.35 * n.humeur + 0.25 * n.satiete + 0.15 * n.sante + 0.15 * work + 0.1 * mayor;
  return Math.max(0, Math.min(1, s));
}

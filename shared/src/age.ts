import type { Agent } from './types';

// L'âge au village, compté en jours. Un fondateur ou un arrivant est déjà adulte en arrivant.

/** L'âge, en jours, d'un fondateur ou d'un arrivant le jour de son arrivée. */
export const ARRIVAL_AGE = 40;
/** Durée de vie : entre ces deux âges, propre à chacun. */
const LIFESPAN_MIN = 170;
const LIFESPAN_SPREAD = 90;
/** À partir de cette part de sa vie, on est un ancien. */
export const ELDER_FROM = 0.8;

export function ageOf(a: Pick<Agent, 'bornDay' | 'family'>, day: number): number {
  return day - (a.bornDay ?? 1) + (a.family?.parentIds.length ? 0 : ARRIVAL_AGE);
}

/** L'âge auquel cette personne s'éteindra paisiblement (toujours le même pour un même habitant). */
export function lifespanOf(a: Pick<Agent, 'id'>): number {
  let h = 2166136261;
  for (const ch of a.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return LIFESPAN_MIN + ((h >>> 0) % LIFESPAN_SPREAD);
}

export const isElder = (a: Pick<Agent, 'id' | 'bornDay' | 'family'>, day: number) => ageOf(a, day) >= lifespanOf(a) * ELDER_FROM;

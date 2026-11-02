import type { AgentId, SimEvent, WorldState } from '@hameau/shared';

// La gazette ne paraît que quand il se passe quelque chose : chaque événement a un poids,
// et le plus lourd des événements pas encore couverts fait la une.

/** Poids minimal pour mériter un numéro. */
export const HEADLINE_MIN = 4;
/** À partir de ce poids, un second numéro (édition spéciale) peut paraître le même jour. */
export const SPECIAL_EDITION = 10;
/** Malus d'une nouvelle de la veille dans le choix de la une. */
const STALE_PENALTY = 3;
/** Nombre de « meurt de faim » dans la journée qui fait une famine. */
const FAMINE_COUNT = 5;

export function score(e: SimEvent): number {
  const p = (e.payload ?? {}) as { kept?: boolean; lost?: boolean };
  switch (e.type) {
    case 'mayor.elected': return p.kept ? 0 : 10;
    case 'trial.verdict': return 8;
    case 'crime.theft': return 6;
    case 'workplace.closed': return 6;
    case 'agent.born': return 5;
    case 'couple.formed': return 4;
    case 'agent.left': return 4;
    case 'workplace.opened': return 4;
    case 'job.changed': return p.lost ? 3 : 0;
    case 'party': return 3;
    case 'agent.added': return 3;
    default: return 0;
  }
}

/** Le meilleur événement non couvert (par numéro de séquence), ou null s'il ne vaut pas un numéro. */
export function pickHeadline(events: SimEvent[], covered: Set<number>): SimEvent | null {
  const fresh = events.filter((e) => !covered.has(e.seq));
  const hungry = fresh.filter((e) => /meurt de faim/.test(e.text));
  const candidates = fresh.map((e) => ({ e, s: score(e) }));
  if (hungry.length >= FAMINE_COUNT && !covered.has(-hungry[0].day)) {
    const famine = { ...hungry[0], seq: -hungry[0].day, type: 'life.need', text: 'La faim gagne le village : plusieurs habitants n’ont plus rien à manger' } as SimEvent;
    candidates.push({ e: famine, s: 7 });
  }
  // Une nouvelle de la veille a déjà un peu vieilli : à poids proche, celle du jour passe devant.
  const today = Math.max(0, ...events.map((e) => e.day));
  const rank = (c: { e: SimEvent; s: number }) => c.s - (c.e.day < today ? STALE_PENALTY : 0);
  const best = candidates.sort((a, b) => rank(b) - rank(a))[0];
  return best && best.s >= HEADLINE_MIN ? best.e : null;
}

export type GazetteStep = 'ECLAIREUR' | 'ECRIVAIN' | 'EDITEUR' | 'LECTEUR';
const STEPS: GazetteStep[] = ['ECLAIREUR', 'ECRIVAIN', 'EDITEUR', 'LECTEUR'];

/**
 * Qui fait chaque étape de la gazette : le titulaire du rôle s'il existe, sinon celui de l'étape précédente,
 * et en dernier recours le maire. Dans un petit village, une même personne cumule.
 */
export function gazetteStaff(w: WorldState): Record<GazetteStep, AgentId> {
  const staff = {} as Record<GazetteStep, AgentId>;
  let previous = w.mayorId;
  for (const step of STEPS) {
    const holder = Object.values(w.agents).find((a) => a.role === step)?.id;
    staff[step] = holder ?? previous;
    previous = staff[step];
  }
  return staff;
}

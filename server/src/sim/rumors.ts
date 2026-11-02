import type { Agent, AgentId, Rumor } from '@hameau/shared';
import type { Sim } from './Sim';

// Rumeurs : vraies ou fausses, elles passent de bouche en bouche et se déforment en route.

export type RumorKind =
  | 'rodeur' | 'voleur' | 'tricheur' | 'amoureux' | 'malade' | 'riche'
  | 'dette' | 'secret' | 'fantome' | 'fugue' | 'complot' | 'sorcier';

const TEMPLATES: Record<RumorKind, (about: string, target?: string) => string> = {
  rodeur: (a, t) => `${a} rôdait près de chez ${t ?? 'quelqu’un'} cette nuit`,
  voleur: (a) => `c’est ${a} qui vole le pain du village`,
  tricheur: (a) => `${a} truque la gazette en douce`,
  amoureux: (a, t) => `${a} en pince pour ${t ?? 'quelqu’un'}`,
  malade: (a) => `${a} est plus malade qu’il n’y paraît`,
  riche: (a) => `${a} cache un trésor sous son lit`,
  dette: (a, t) => `${a} doit une fortune à ${t ?? 'quelqu’un'}`,
  secret: (a) => `${a} cache quelque chose dans sa cave`,
  fantome: (a) => `${a} parle aux fantômes du vieux moulin`,
  fugue: (a) => `${a} prépare son départ du village en secret`,
  complot: (a) => `${a} complote pour devenir maire`,
  sorcier: (a) => `${a} prépare des potions la nuit`,
};
/** Rumeurs qui font baisser l'estime de la personne visée. */
const HARMFUL: RumorKind[] = ['rodeur', 'voleur', 'tricheur', 'riche', 'dette', 'secret', 'complot', 'sorcier'];
/** Ce qu'un menteur peut inventer sur quelqu'un qu'il n'aime pas. */
export const SLANDERS: RumorKind[] = ['voleur', 'tricheur', 'dette', 'secret', 'complot', 'sorcier', 'fantome'];
const MAX_RUMORS = 40;

interface RumorExt extends Rumor { kind: RumorKind; target?: AgentId }

const name = (sim: Sim, id?: AgentId) => (id ? sim.agent(id)?.name ?? 'quelqu’un' : undefined);

export function createRumor(sim: Sim, origin: AgentId, kind: RumorKind, about: AgentId, truth: boolean, target?: AgentId): Rumor | null {
  if (!sim.agent(about)) return null;
  const r: RumorExt = {
    id: `ru${sim.clock.tick}-${sim.world.rumors.length}`,
    kind,
    about,
    target,
    text: TEMPLATES[kind](name(sim, about)!, name(sim, target)),
    true: truth,
    origin,
    knownBy: [origin],
    day: sim.clock.day,
  };
  sim.world.rumors.push(r);
  if (sim.world.rumors.length > MAX_RUMORS) sim.world.rumors.shift();
  return r;
}

/** Ce qu'un habitant sait et que l'autre ignore (la rumeur la plus récente). */
export function rumorToShare(sim: Sim, speaker: Agent, listener: Agent): Rumor | undefined {
  return [...sim.world.rumors].reverse().find((r) => r.knownBy.includes(speaker.id) && !r.knownBy.includes(listener.id) && r.about !== listener.id && r.about !== speaker.id);
}

/**
 * Transmet une rumeur. Un menteur (honnêteté basse) la déforme : la personne visée change,
 * et la nouvelle version, fausse, circule à son tour.
 */
export function tellRumor(sim: Sim, speaker: Agent, listener: Agent, r: Rumor): Rumor {
  let told = r as RumorExt;
  const lies = Math.random() > speaker.personality.honesty + 0.2;
  if (lies && r.about) {
    const others = Object.keys(sim.world.agents).filter((id) => id !== r.about && id !== speaker.id && id !== listener.id);
    const scapegoat = others[Math.floor(Math.random() * others.length)];
    const twisted = scapegoat && createRumor(sim, speaker.id, told.kind, scapegoat, false, told.target);
    if (twisted) told = twisted as RumorExt;
  }
  if (!told.knownBy.includes(listener.id)) told.knownBy.push(listener.id);
  // Croire ou non dépend de la confiance envers celui qui parle.
  const trust = Math.max(0, (listener.opinions[speaker.id] ?? 0) + 0.3);
  if (told.about && HARMFUL.includes(told.kind) && told.about !== listener.id) {
    sim.adjustOpinion(listener.id, told.about, -0.1 * trust);
  }
  return told;
}

/** Rumeur la plus répandue du moment (pour le crieur et le barde). */
export function hottestRumor(sim: Sim): Rumor | undefined {
  return [...sim.world.rumors].filter((r) => sim.clock.day - r.day <= 2).sort((a, b) => b.knownBy.length - a.knownBy.length)[0];
}

export function rumorKindOf(r: Rumor): RumorKind {
  return (r as RumorExt).kind;
}

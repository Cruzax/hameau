import type { Personality, Role } from './types';

// Traits de caractère cliquables à la création d'une histoire, et profils tout prêts.

export type TraitId =
  | 'honnete' | 'menteur' | 'malin' | 'genereux' | 'avare' | 'fouineur' | 'ambitieux'
  | 'travailleur' | 'paresseux' | 'bavard' | 'grincheux' | 'reveur' | 'tendre';

type Tendency = 'honesty' | 'ambition' | 'generosity' | 'diligence' | 'curiosity';

export const TRAITS: Record<TraitId, { label: string; tone: string; incompatible?: TraitId[]; effect: Partial<Record<Tendency, number>> }> = {
  honnete: { label: 'honnête', tone: 'franc et droit', incompatible: ['menteur'], effect: { honesty: 0.4 } },
  menteur: { label: 'menteur', tone: 'mielleux, plein de sous-entendus', incompatible: ['honnete'], effect: { honesty: -0.4 } },
  malin: { label: 'malin', tone: 'vif, un brin moqueur', effect: { honesty: -0.15, ambition: 0.1 } },
  genereux: { label: 'généreux', tone: 'chaleureux', incompatible: ['avare'], effect: { generosity: 0.4 } },
  avare: { label: 'avare', tone: 'méfiant, compte chaque sou', incompatible: ['genereux'], effect: { generosity: -0.4 } },
  fouineur: { label: 'fouineur', tone: 'curieux, pose mille questions', effect: { curiosity: 0.4 } },
  ambitieux: { label: 'ambitieux', tone: 'assuré, aime convaincre', effect: { ambition: 0.4 } },
  travailleur: { label: 'travailleur', tone: 'simple, concret', incompatible: ['paresseux'], effect: { diligence: 0.4 } },
  paresseux: { label: 'paresseux', tone: 'traînant, toujours une excuse', incompatible: ['travailleur'], effect: { diligence: -0.4 } },
  bavard: { label: 'bavard', tone: 'intarissable', effect: { curiosity: 0.15 } },
  grincheux: { label: 'grincheux', tone: 'bougon, jamais content', incompatible: ['tendre'], effect: { generosity: -0.15, ambition: 0.1 } },
  reveur: { label: 'rêveur', tone: 'doux, la tête ailleurs', effect: { diligence: -0.15, curiosity: 0.15 } },
  tendre: { label: 'cœur tendre', tone: 'doux, attentionné', incompatible: ['grincheux'], effect: { generosity: 0.25 } },
};

export const MAX_TRAITS = 3;

export const PROFILES: { id: string; label: string; emoji: string; traits: TraitId[] }[] = [
  { id: 'travailleur', label: 'L’honnête travailleur', emoji: '🧑‍🌾', traits: ['honnete', 'travailleur'] },
  { id: 'ambitieux', label: 'L’ambitieux', emoji: '👑', traits: ['ambitieux', 'malin'] },
  { id: 'filou', label: 'Le filou', emoji: '🦊', traits: ['menteur', 'malin', 'paresseux'] },
  { id: 'tendre', label: 'Le cœur tendre', emoji: '💛', traits: ['tendre', 'genereux'] },
  { id: 'fouineur', label: 'Le fouineur', emoji: '🔎', traits: ['fouineur', 'bavard'] },
  { id: 'bavard', label: 'Le bavard', emoji: '🗣', traits: ['bavard', 'genereux'] },
  { id: 'grincheux', label: 'Le grincheux', emoji: '😤', traits: ['grincheux', 'avare', 'travailleur'] },
  { id: 'reveur', label: 'Le rêveur', emoji: '🌙', traits: ['reveur', 'tendre'] },
];

export type Sex = 'M' | 'F';
export type Orientation = 'hetero' | 'bi' | 'gay';

/** Un villageois composé à la création d'une histoire. */
export interface FounderSpec {
  name: string;
  traits: TraitId[];
  role: Role | 'auto';
  /** Piloté par l'IA (un seul au plus). */
  ai?: boolean;
  sex?: Sex | 'auto';
  orientation?: Orientation | 'auto';
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Identifiant tiré du nom (sans accents ni ponctuation) : « Zoé » et « Zoe » donnent le même. */
export function founderId(name: string) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function personalityFromTraits(traits: TraitId[]): Personality {
  const t: Record<Tendency, number> = { honesty: 0.6, ambition: 0.4, generosity: 0.5, diligence: 0.6, curiosity: 0.5 };
  for (const id of traits) for (const [k, v] of Object.entries(TRAITS[id]?.effect ?? {})) t[k as Tendency] += v;
  return {
    traits: traits.map((id) => TRAITS[id].label),
    tone: traits.map((id) => TRAITS[id].tone).join(', ') || 'simple, poli',
    honesty: clamp01(t.honesty),
    ambition: clamp01(t.ambition),
    generosity: clamp01(t.generosity),
    diligence: clamp01(t.diligence),
    curiosity: clamp01(t.curiosity),
  };
}

/** Erreur lisible si les fondateurs ne conviennent pas, sinon null. */
export function validateFounders(specs: FounderSpec[]): string | null {
  for (const s of specs) {
    if (!s.name.trim()) return 'Chaque villageois a besoin d’un nom.';
    if (s.traits.length > MAX_TRAITS) return `${s.name} : ${MAX_TRAITS} traits au plus.`;
    for (const id of s.traits) {
      const clash = TRAITS[id]?.incompatible?.find((x) => s.traits.includes(x));
      if (clash) return `${s.name} ne peut pas être à la fois ${TRAITS[id].label} et ${TRAITS[clash].label}.`;
    }
  }
  if (specs.filter((s) => s.ai).length > 1) return 'Un seul villageois peut être piloté par l’IA.';
  if (new Set(specs.map((s) => founderId(s.name))).size !== specs.length) return 'Deux villageois ne peuvent pas porter le même nom.';
  return null;
}

/**
 * Rôles : ceux choisis à la main sont respectés ; parmi les autres, le plus ambitieux devient maire
 * (s'il n'y en a pas déjà un), les plus curieux font la gazette, le reste est citoyen.
 * Les métiers ne sont pas des rôles : ils s'obtiennent à l'embauche.
 */
export function autoRoles(specs: FounderSpec[]): Role[] {
  const roles: (Role | null)[] = specs.map((s) => (s.role === 'auto' ? null : s.role));
  const p = specs.map((s) => personalityFromTraits(s.traits));
  const free = () => roles.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0);
  const assign = (role: Role, by: (i: number) => number) => {
    if (roles.includes(role)) return;
    const i = free().sort((a, b) => by(b) - by(a))[0];
    if (i !== undefined) roles[i] = role;
  };
  assign('MAIRE', (i) => p[i].ambition);
  assign('ECLAIREUR', (i) => p[i].curiosity ?? 0.5);
  assign('ECRIVAIN', (i) => p[i].curiosity ?? 0.5);
  return roles.map((r) => r ?? 'CITOYEN');
}

const ORIENTATION_ODDS: [Orientation, number][] = [['hetero', 0.75], ['bi', 0.15], ['gay', 0.1]];

/** Orientation tirée au sort (r dans [0, 1[) : surtout hétéro, parfois bi ou gay. */
export function randomOrientation(r: number): Orientation {
  let acc = 0;
  for (const [o, p] of ORIENTATION_ODDS) if (r < (acc += p)) return o;
  return 'hetero';
}

/** `a` peut-il être attiré par `b` ? Sans sexe connu (anciens habitants), tout reste possible. */
export function attracted(a: { sex?: Sex; orientation?: Orientation }, b: { sex?: Sex }): boolean {
  if (!a.sex || !b.sex) return true;
  const o = a.orientation ?? 'hetero';
  return o === 'bi' || (o === 'hetero' ? a.sex !== b.sex : a.sex === b.sex);
}

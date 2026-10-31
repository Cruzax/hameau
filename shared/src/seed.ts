import { facing } from './geometry';
import type { Agent, AgentId, House, Road, Role, Terrain, Vec2, WorldState } from './types';

const PLAZA: Vec2 = { x: 0, z: 0 };

export const TERRAIN: Terrain = {
  size: 96,
  plaza: { center: PLAZA, radius: 4.6 },
  river: {
    width: 3.2,
    points: [
      { x: 8, z: -48 },
      { x: 10.5, z: -24 },
      { x: 7.6, z: -7 },
      { x: 10, z: 6 },
      { x: 9, z: 20 },
      { x: 13, z: 48 },
    ],
  },
};

/** Libellés affichés au-dessus des maisons. */
export const ROLE_LABEL: Record<Role, string> = {
  MAIRE: 'Maire',
  ECLAIREUR: 'Éclaireur',
  ECRIVAIN: 'Écrivain',
  EDITEUR: 'Éditeur',
  LECTEUR: 'Lecteur',
  CITOYEN: 'Citoyen',
  MENTEUR: 'Menteur',
};

/** Couleur d'accent par rôle (étiquettes, messagers, journal). */
export const ROLE_COLOR: Record<Role, string> = {
  MAIRE: '#c8553d',
  ECLAIREUR: '#3f7a6b',
  ECRIVAIN: '#8a5a9e',
  EDITEUR: '#2f5d8a',
  LECTEUR: '#d08a2a',
  CITOYEN: '#7a7a6a',
  MENTEUR: '#3a3a3a',
};

function house(id: string, ownerId: AgentId, position: Vec2, style: House['style'], wallColor: string, roofColor: string): House {
  return { id, ownerId, position, rotation: facing(position, PLAZA), style, wallColor, roofColor };
}

export const SEED_HOUSES: House[] = [
  house('h-maire', 'maire', { x: 0, z: -10 }, 'mairie', '#f3e3c3', '#c0573e'),
  house('h-eclaireur', 'eclaireur', { x: -13, z: -3 }, 'tour', '#e8d2a8', '#3f7a6b'),
  house('h-ecrivain', 'ecrivain', { x: -7, z: 10 }, 'chaumiere', '#f1d9b5', '#8a5a9e'),
  house('h-editeur', 'editeur', { x: 4, z: 11 }, 'atelier', '#efe0c8', '#2f5d8a'),
  house('h-lecteur', 'lecteur', { x: 18, z: -3 }, 'cabane', '#b07a4f', '#d89a3a'),
];

/** Graphe initial volontairement incomplet : le lecteur n'est relié qu'au maire (par le pont). */
export const SEED_ROADS: Road[] = [
  { id: 'r-maire-eclaireur', a: 'h-maire', b: 'h-eclaireur', waypoints: [{ x: -7, z: -8 }], status: 'open' },
  { id: 'r-maire-ecrivain', a: 'h-maire', b: 'h-ecrivain', waypoints: [{ x: 0, z: -4 }, { x: -3, z: 3 }], status: 'open' },
  { id: 'r-maire-editeur', a: 'h-maire', b: 'h-editeur', waypoints: [{ x: 0, z: -4 }, { x: 3, z: 3 }], status: 'open' },
  { id: 'r-maire-lecteur', a: 'h-maire', b: 'h-lecteur', waypoints: [{ x: 12, z: -5.5 }], status: 'open' },
  { id: 'r-eclaireur-ecrivain', a: 'h-eclaireur', b: 'h-ecrivain', waypoints: [{ x: -12, z: 4 }], status: 'open' },
  { id: 'r-ecrivain-editeur', a: 'h-ecrivain', b: 'h-editeur', waypoints: [{ x: -1.2, z: 10.8 }], status: 'open' },
];

function agent(id: AgentId, name: string, role: Role, p: Agent['personality'], goals: string[]): Agent {
  return {
    id,
    name,
    role,
    houseId: `h-${id}`,
    personality: p,
    goals,
    memory: { short: [], long: '' },
    opinions: {},
    inbox: [],
    activity: 'idle',
    lastActionTick: 0,
  };
}

export const SEED_AGENTS: Agent[] = [
  agent('maire', 'Maxence', 'MAIRE',
    { traits: ['autoritaire', 'pragmatique', 'vaniteux'], tone: 'solennel, aime les formules', honesty: 0.7, ambition: 0.9 },
    ['Publier une gazette chaque jour', 'Rester maire', 'Garder le contrôle de l’information']),
  agent('eclaireur', 'Enzo', 'ECLAIREUR',
    { traits: ['curieux', 'impatient', 'enthousiaste'], tone: 'rapide, exclamatif', honesty: 0.8, ambition: 0.4 },
    ['Trouver le sujet le plus surprenant du jour', 'Être cité dans la gazette']),
  agent('ecrivain', 'Marie', 'ECRIVAIN',
    { traits: ['lyrique', 'susceptible', 'perfectionniste'], tone: 'imagé, un peu théâtral', honesty: 0.85, ambition: 0.6 },
    ['Écrire un article mémorable', 'Défendre son style face à l’éditeur']),
  agent('editeur', 'Evan', 'EDITEUR',
    { traits: ['méticuleux', 'sec', 'loyal'], tone: 'concis, factuel', honesty: 0.95, ambition: 0.5 },
    ['Zéro faute dans la gazette', 'Couper tout ce qui dépasse']),
  agent('lecteur', 'Cruz', 'LECTEUR',
    { traits: ['franc-parler', 'vit à l’écart', 'sens aigu de l’observation'], tone: 'direct, parfois ironique', honesty: 0.9, ambition: 0.3 },
    ['Lire une gazette qui parle vraiment du village', 'Que son avis compte vraiment']),
];

// Opinions initiales neutres-légèrement positives entre tous les agents.
for (const a of SEED_AGENTS) for (const b of SEED_AGENTS) if (a.id !== b.id) a.opinions[b.id] = 0.2;

const byId = <T extends { id: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [x.id, x])) as Record<string, T>;

export function createSeedWorld(): WorldState {
  return {
    clock: { tick: 0, day: 1, ticksPerDay: 360, tickMs: 250, speed: 1, paused: false },
    terrain: TERRAIN,
    mayorId: 'maire',
    agents: byId(structuredClone(SEED_AGENTS)),
    houses: byId(structuredClone(SEED_HOUSES)),
    roads: byId(structuredClone(SEED_ROADS)),
    messages: {},
    gazettes: [],
    votes: [],
    voteEveryDays: 3,
    llm: { provider: 'mock', budget: { maxCallsPerDay: 40, callsToday: 0, maxTokens: 300, tokensIn: 0, tokensOut: 0 } },
  };
}

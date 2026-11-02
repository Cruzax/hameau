import { facing } from './geometry';
import type { Agent, AgentId, House, Inventory, Road, Role, Terrain, Vec2, WorldState } from './types';

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

/** Coins de nature où l'on va à pied : la forêt (bois, cueillette) et la rive (pêche). */
export const NATURE_SPOTS: Record<'foret' | 'riviere', Vec2> = {
  foret: { x: -17, z: 16 },
  riviere: { x: 6.6, z: 23 },
};

/** Libellés affichés au-dessus des maisons. */
export const ROLE_LABEL: Record<Role, string> = {
  MAIRE: 'Maire',
  ECLAIREUR: 'Éclaireur',
  ECRIVAIN: 'Écrivain',
  EDITEUR: 'Éditeur',
  LECTEUR: 'Lecteur',
  BOULANGER: 'Boulanger',
  FORGERON: 'Forgeron',
  HERBORISTE: 'Herboriste',
  CRIEUR: 'Crieur public',
  AUBERGISTE: 'Aubergiste',
  GARDE: 'Garde',
  BARDE: 'Barde',
  VOLEUR: 'Vagabond', // le métier réel reste secret
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
  BOULANGER: '#c98b3b',
  FORGERON: '#5b5f66',
  HERBORISTE: '#5f8f3a',
  CRIEUR: '#b8433a',
  AUBERGISTE: '#9a5b2c',
  GARDE: '#36507a',
  BARDE: '#b0507f',
  VOLEUR: '#6b6b5a',
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
  house('h-boulanger', 'boulanger', { x: -5, z: -17 }, 'boulangerie', '#f4e2c4', '#b5652b'),
  house('h-forgeron', 'forgeron', { x: -19, z: 5 }, 'forge', '#9b9286', '#4a4a50'),
  house('h-herboriste', 'herboriste', { x: 15, z: 14 }, 'echoppe', '#e6dcc0', '#5f8f3a'),
  house('h-crieur', 'crieur', { x: -12, z: -11 }, 'chaumiere', '#f0d8b0', '#b8433a'),
  house('h-aubergiste', 'aubergiste', { x: -1, z: 19 }, 'auberge', '#e8cfa2', '#8a4a2a'),
  house('h-garde', 'garde', { x: 5, z: -21 }, 'tour', '#d9d2c2', '#36507a'),
  house('h-barde', 'barde', { x: -21, z: -9 }, 'cabane', '#c79a6a', '#b0507f'),
  house('h-voleur', 'voleur', { x: 24, z: 6 }, 'cabane', '#a88a66', '#6b6b5a'),
];

/** Graphe initial volontairement incomplet : le lecteur n'est relié qu'au maire (par le pont). */
export const SEED_ROADS: Road[] = [
  { id: 'r-maire-eclaireur', a: 'h-maire', b: 'h-eclaireur', waypoints: [{ x: -7, z: -8 }], status: 'open' },
  { id: 'r-maire-ecrivain', a: 'h-maire', b: 'h-ecrivain', waypoints: [{ x: 0, z: -4 }, { x: -3, z: 3 }], status: 'open' },
  { id: 'r-maire-editeur', a: 'h-maire', b: 'h-editeur', waypoints: [{ x: 0, z: -4 }, { x: 3, z: 3 }], status: 'open' },
  { id: 'r-maire-lecteur', a: 'h-maire', b: 'h-lecteur', waypoints: [{ x: 12, z: -5.5 }], status: 'open' },
  { id: 'r-eclaireur-ecrivain', a: 'h-eclaireur', b: 'h-ecrivain', waypoints: [{ x: -12, z: 4 }], status: 'open' },
  { id: 'r-ecrivain-editeur', a: 'h-ecrivain', b: 'h-editeur', waypoints: [{ x: -1.2, z: 10.8 }], status: 'open' },
  // Les nouveaux métiers
  { id: 'r-maire-boulanger', a: 'h-maire', b: 'h-boulanger', waypoints: [{ x: -3.5, z: -8.5 }], status: 'open' },
  { id: 'r-boulanger-crieur', a: 'h-boulanger', b: 'h-crieur', waypoints: [], status: 'open' },
  { id: 'r-crieur-eclaireur', a: 'h-crieur', b: 'h-eclaireur', waypoints: [], status: 'open' },
  { id: 'r-crieur-barde', a: 'h-crieur', b: 'h-barde', waypoints: [], status: 'open' },
  { id: 'r-barde-forgeron', a: 'h-barde', b: 'h-forgeron', waypoints: [], status: 'open' },
  { id: 'r-forgeron-eclaireur', a: 'h-forgeron', b: 'h-eclaireur', waypoints: [], status: 'open' },
  { id: 'r-forgeron-ecrivain', a: 'h-forgeron', b: 'h-ecrivain', waypoints: [], status: 'open' },
  { id: 'r-ecrivain-aubergiste', a: 'h-ecrivain', b: 'h-aubergiste', waypoints: [], status: 'open' },
  { id: 'r-editeur-aubergiste', a: 'h-editeur', b: 'h-aubergiste', waypoints: [], status: 'open' },
  { id: 'r-maire-garde', a: 'h-maire', b: 'h-garde', waypoints: [{ x: 3.5, z: -8.5 }], status: 'open' },
  { id: 'r-garde-boulanger', a: 'h-garde', b: 'h-boulanger', waypoints: [], status: 'open' },
  { id: 'r-editeur-herboriste', a: 'h-editeur', b: 'h-herboriste', waypoints: [], status: 'open' },
  { id: 'r-herboriste-lecteur', a: 'h-herboriste', b: 'h-lecteur', waypoints: [], status: 'open' },
  { id: 'r-lecteur-voleur', a: 'h-lecteur', b: 'h-voleur', waypoints: [], status: 'open' },
  { id: 'r-voleur-herboriste', a: 'h-voleur', b: 'h-herboriste', waypoints: [], status: 'open' },
];

/** Ce que chacun possède au départ ; les métiers commencent avec leur stock. */
const START_INVENTORY: Partial<Record<Role, Partial<Inventory>>> = {
  BOULANGER: { pain: 6, bois: 2, pieces: 4 },
  FORGERON: { outils: 3, bois: 4, pieces: 4 },
  AUBERGISTE: { pain: 2, pieces: 12 },
  HERBORISTE: { pieces: 6 },
  MAIRE: { pieces: 15 },
  VOLEUR: { pain: 0, pieces: 1 },
};

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
    needs: { satiete: 0.8, energie: 0.9, humeur: 0.7, sante: 1 },
    inventory: { pain: 1, bois: 1, outils: 0, pieces: 5, ...START_INVENTORY[role] },
    location: { kind: 'home' },
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
  agent('boulanger', 'Léonie', 'BOULANGER',
    { traits: ['matinale', 'généreuse', 'bavarde'], tone: 'chaleureux, plein d’expressions', honesty: 0.8, ambition: 0.3 },
    ['Que personne n’ait faim', 'Être payée à temps']),
  agent('forgeron', 'Bastien', 'FORGERON',
    { traits: ['bourru', 'fiable', 'fier'], tone: 'peu de mots, mais solides', honesty: 0.85, ambition: 0.4 },
    ['Réparer tout ce qui casse', 'Qu’on reconnaisse son travail']),
  agent('herboriste', 'Céleste', 'HERBORISTE',
    { traits: ['mystérieuse', 'patiente', 'calculatrice'], tone: 'doux, énigmatique', honesty: 0.6, ambition: 0.5 },
    ['Soigner ceux qui souffrent', 'Que chacun lui doive un service']),
  agent('crieur', 'Gaston', 'CRIEUR',
    { traits: ['tonitruant', 'indiscret', 'zélé'], tone: 'solennel, en majuscules', honesty: 0.7, ambition: 0.4 },
    ['Annoncer chaque nouvelle le premier', 'Plaire au maire']),
  agent('aubergiste', 'Odette', 'AUBERGISTE',
    { traits: ['accueillante', 'rusée', 'commère'], tone: 'familier, complice', honesty: 0.6, ambition: 0.5 },
    ['Remplir son auberge chaque soir', 'Tout savoir sur tout le monde']),
  agent('garde', 'Victor', 'GARDE',
    { traits: ['rigide', 'soupçonneux', 'juste'], tone: 'sec, réglementaire', honesty: 0.9, ambition: 0.6 },
    ['Arrêter le voleur du village', 'Faire respecter l’ordre']),
  agent('barde', 'Ambroise', 'BARDE',
    { traits: ['rêveur', 'moqueur', 'romantique'], tone: 'chantant, en rimes quand il peut', honesty: 0.7, ambition: 0.3 },
    ['Composer la chanson de l’année', 'Faire rire l’auberge']),
  agent('voleur', 'Félix', 'VOLEUR',
    { traits: ['charmant', 'discret', 'toujours affamé'], tone: 'enjôleur', honesty: 0.2, ambition: 0.6 },
    ['Ne jamais se faire prendre', 'Ne plus jamais avoir faim']),
];

// Opinions initiales neutres-légèrement positives entre tous les agents.
for (const a of SEED_AGENTS) for (const b of SEED_AGENTS) if (a.id !== b.id) a.opinions[b.id] = 0.2;

const byId = <T extends { id: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [x.id, x])) as Record<string, T>;

/** Village de départ : complet (13 habitants) ou d'origine (les 5 qui font la gazette). */
export type VillagePreset = 'complet' | 'origine';
const ORIGINE: AgentId[] = ['maire', 'eclaireur', 'ecrivain', 'editeur', 'lecteur'];

export function createSeedWorld(preset: VillagePreset = 'complet'): WorldState {
  const keep = (id: AgentId) => preset === 'complet' || ORIGINE.includes(id);
  const agents = SEED_AGENTS.filter((a) => keep(a.id)).map((a) => {
    const copy = structuredClone(a);
    copy.opinions = Object.fromEntries(Object.entries(copy.opinions).filter(([id]) => keep(id)));
    return copy;
  });
  const houses = SEED_HOUSES.filter((h) => !h.ownerId || keep(h.ownerId));
  const ids = new Set(houses.map((h) => h.id));
  const roads = SEED_ROADS.filter((r) => ids.has(r.a) && ids.has(r.b));
  return {
    clock: { tick: 0, day: 1, ticksPerDay: 480, tickMs: 625, speed: 1, paused: false },
    terrain: TERRAIN,
    mayorId: 'maire',
    agents: byId(agents),
    houses: byId(structuredClone(houses)),
    roads: byId(structuredClone(roads)),
    messages: {},
    gazettes: [],
    votes: [],
    effects: [],
    rumors: [],
    voteEveryDays: 3,
    llm: { provider: 'mock', budget: { maxCallsPerDay: 40, callsToday: 0, maxTokens: 300, tokensIn: 0, tokensOut: 0 } },
  };
}

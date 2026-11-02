import { facing } from './geometry';
import { autoRoles, founderId, personalityFromTraits, randomOrientation, type FounderSpec } from './traits';
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

/** Carrefours fixes : le pourtour de la place (cœur du réseau) et les deux ponts, une tête sur chaque rive. */
function node(id: string, position: Vec2): House {
  return { id, ownerId: null, kind: 'carrefour', position, rotation: 0, style: 'carrefour', wallColor: '#000', roofColor: '#000' };
}
export const NETWORK_NODES: House[] = [
  node('place-n', { x: 0, z: -4.3 }),
  node('place-e', { x: 4.3, z: 0 }),
  node('place-s', { x: 0, z: 4.3 }),
  node('place-o', { x: -4.3, z: 0 }),
  node('pont-sud-o', { x: 4.4, z: -14 }),
  node('pont-sud-e', { x: 13.2, z: -14 }),
  node('pont-nord-o', { x: 5.7, z: 28 }),
  node('pont-nord-e', { x: 14.5, z: 28 }),
];
const way = (a: string, b: string): Road => ({ id: `r-${a}-${b}`, a, b, waypoints: [], status: 'open' });
/** Le tour de la place et les deux ponts. Le reste du réseau se construit au fil des maisons (serveur). */
export const NETWORK_ROADS: Road[] = [
  way('place-n', 'place-e'), way('place-e', 'place-s'), way('place-s', 'place-o'), way('place-o', 'place-n'),
  way('pont-sud-o', 'pont-sud-e'), way('pont-nord-o', 'pont-nord-e'),
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
  const houses = [...SEED_HOUSES.filter((h) => !h.ownerId || keep(h.ownerId)), ...NETWORK_NODES];
  const roads = NETWORK_ROADS;
  return {
    clock: { tick: 0, day: 1, ticksPerDay: 480, tickMs: 625, speed: 1, paused: false },
    terrain: TERRAIN,
    workplaces: {},
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

/** Une maison où l'on peut habiter (ni lieu de travail, ni carrefour). */
export function isDwelling(h: House): boolean {
  return (h.kind ?? 'maison') === 'maison';
}

// ─── Nouvelle histoire : 4 fondateurs composés par l'utilisateur ─────────────

const FOUNDER_SPOTS: Vec2[] = [{ x: -10, z: -6 }, { x: -11, z: 6 }, { x: -2, z: -12 }, { x: -1, z: 12 }];
const FOUNDER_STYLES: House['style'][] = ['chaumiere', 'atelier', 'chaumiere', 'cabane'];
const FOUNDER_COLORS: [string, string][] = [['#f3e3c3', '#c0573e'], ['#e8d2a8', '#3f7a6b'], ['#f1d9b5', '#8a5a9e'], ['#efe0c8', '#2f5d8a']];


/** Monde de départ d'une histoire choisie : 4 maisons, la chaîne du pain tenue par le village, la place et les ponts. */
export function createFounderWorld(founders: FounderSpec[], rand: () => number = Math.random): WorldState {
  const roles = autoRoles(founders);
  const ids = founders.map((f, i) => founderId(f.name) || `habitant-${i}`);
  const agents = founders.map((f, i) => {
    const a = agent(ids[i], f.name.trim(), roles[i], personalityFromTraits(f.traits), []);
    a.sex = f.sex && f.sex !== 'auto' ? f.sex : rand() < 0.5 ? 'M' : 'F';
    a.orientation = f.orientation && f.orientation !== 'auto' ? f.orientation : randomOrientation(rand());
    a.goals = roles[i] === 'MAIRE' ? ['Rester maire', 'Que le village prospère'] : ['Gagner sa vie', 'Trouver sa place au village'];
    for (const other of ids) if (other !== ids[i]) a.opinions[other] = 0.2;
    return a;
  });
  const houses = founders.map((_, i) => {
    const h = house(`h-${ids[i]}`, ids[i], FOUNDER_SPOTS[i], FOUNDER_STYLES[i], FOUNDER_COLORS[i][0], FOUNDER_COLORS[i][1]);
    return h;
  });
  const work = (id: string, style: House['style'], position: Vec2): House =>
    ({ id, ownerId: null, kind: 'travail', position, rotation: facing(position, PLAZA), style, wallColor: '#ecdcbc', roofColor: '#8a4a2a' });
  const bakery = work('w-boulangerie', 'boulangerie', { x: -17, z: -1 });
  const farm = work('w-ferme', 'ferme', { x: -22, z: -16 });
  const mill = work('w-moulin', 'moulin', { x: 2, z: 20 });
  const sawmill = work('w-scierie', 'scierie', { x: -20, z: 13 });
  const workplaces: WorldState['workplaces'] = {
    'wp-boulangerie': { id: 'wp-boulangerie', kind: 'boulangerie', era: 'ancienne', houseId: bakery.id, ownerId: null, slots: 2, workers: [], till: 40, stock: { pain: 24 }, unpaidDays: 0, openedDay: 1 },
    'wp-ferme': { id: 'wp-ferme', kind: 'ferme', era: 'ancienne', houseId: farm.id, ownerId: null, slots: 4, workers: [], till: 40, stock: { ble: 12 }, unpaidDays: 0, openedDay: 1 },
    'wp-moulin': { id: 'wp-moulin', kind: 'moulin', era: 'ancienne', houseId: mill.id, ownerId: null, slots: 2, workers: [], till: 40, stock: { farine: 8 }, unpaidDays: 0, openedDay: 1 },
    'wp-scierie': { id: 'wp-scierie', kind: 'scierie', era: 'ancienne', houseId: sawmill.id, ownerId: null, slots: 3, workers: [], till: 40, stock: { bois: 8 }, unpaidDays: 0, openedDay: 1 },
  };
  return {
    ...createSeedWorld('origine'),
    mayorId: ids[roles.indexOf('MAIRE')] ?? ids[0],
    agents: byId(agents),
    houses: byId([...houses, bakery, farm, mill, sawmill, ...structuredClone(NETWORK_NODES)]),
    roads: byId(structuredClone(NETWORK_ROADS)),
    workplaces,
  };
}

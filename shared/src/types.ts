// Schéma de données du monde de Hameau.
// Partagé entre le serveur (source de vérité) et le client (rendu).
// Toutes les positions sont dans le plan du sol : x (est/ouest), z (nord/sud).

export type Vec2 = { x: number; z: number };

export type AgentId = string;
export type HouseId = string;
export type RoadId = string;
export type MessageId = string;
export type VoteId = string;

/** Métier d'un agent. Être maire est une *fonction* (WorldState.mayorId), pas un métier :
 *  un maire destitué devient CITOYEN, un nouvel élu cumule son métier et la fonction. */
export type Role =
  | 'MAIRE' | 'ECLAIREUR' | 'ECRIVAIN' | 'EDITEUR' | 'LECTEUR'
  | 'BOULANGER' | 'FORGERON' | 'HERBORISTE' | 'CRIEUR' | 'AUBERGISTE' | 'GARDE' | 'BARDE' | 'VOLEUR'
  | 'CITOYEN' | 'MENTEUR';

// ─── Vie quotidienne ─────────────────────────────────────────────────────────

/** Besoins, de 0 (au plus mal) à 1 (au mieux). Ils poussent les habitants à agir. */
export interface Needs {
  satiete: number;   // 0 = affamé
  energie: number;   // 0 = épuisé
  humeur: number;    // 0 = au fond du trou
  sante: number;     // 0 = très malade
}

export interface Inventory {
  pain: number;
  bois: number;
  outils: number;
  pieces: number;
}

/** Lieu où l'on peut se rendre : la place du village, ou une maison (par son id). */
export type PlaceId = 'place' | 'foret' | 'riviere' | string;

export type TripPurpose =
  | 'acheter' | 'vendre' | 'visite' | 'taverne' | 'fete' | 'travail' | 'soin'
  | 'annonce' | 'vol' | 'enquete' | 'reparer' | 'retour' | 'promenade';

export type AgentLocation =
  | { kind: 'home' }
  | { kind: 'walking'; to: PlaceId; purpose: TripPurpose; path: Vec2[]; startTick: number; speed: number; length: number }
  | { kind: 'at'; place: PlaceId; purpose: TripPurpose; until: number };

/** Une rumeur : vraie ou fausse, elle se déforme en passant de bouche en bouche. */
export interface Rumor {
  id: string;
  text: string;
  about?: AgentId;
  true: boolean;
  origin: AgentId;
  knownBy: AgentId[];
  day: number;
}

// ─── Agents ──────────────────────────────────────────────────────────────────

export interface Personality {
  traits: string[];      // ex. ["méticuleux", "susceptible"]
  tone: string;          // façon de parler, injectée dans le prompt système
  honesty: number;       // 0..1 — un MENTEUR est proche de 0
  ambition: number;      // 0..1 — propension à se présenter / proposer une destitution
  /** Tendances issues des traits (0..1). Absentes = 0,5. */
  generosity?: number;
  diligence?: number;
  curiosity?: number;
}

export interface MemoryEntry {
  tick: number;
  day: number;
  with: AgentId;         // interlocuteur
  direction: 'in' | 'out';
  text: string;
}

export interface AgentMemory {
  short: MemoryEntry[];  // N derniers échanges (fenêtre glissante)
  long: string;          // résumé compressé en fin de journée
}

export type AgentActivity = 'idle' | 'thinking' | 'writing' | 'waiting' | 'voting';

export interface Agent {
  id: AgentId;
  name: string;
  role: Role;
  houseId: HouseId;
  personality: Personality;
  goals: string[];
  memory: AgentMemory;
  /** Opinion de cet agent sur les autres, de -1 (hostile) à +1 (confiance). */
  opinions: Record<AgentId, number>;
  inbox: MessageId[];    // messages livrés, pas encore traités
  /** Vie du village (phase 6) : liens familiaux, naissance. Absent pour les fondateurs. */
  family?: { partnerId?: AgentId; parentIds: AgentId[]; childIds: AgentId[] };
  bornDay?: number;
  activity: AgentActivity;
  lastActionTick: number;
  needs?: Needs;
  inventory?: Inventory;
  location?: AgentLocation;
  asleep?: boolean;
  /** Sexe et orientation (couples, enfants). Absents chez les anciens habitants. */
  sex?: 'M' | 'F';
  orientation?: 'hetero' | 'bi' | 'gay';
  /** Emploi actuel, s'il en a un. */
  job?: { workplaceId: string; since: number; wage: number };
}

// ─── Village (graphe) ────────────────────────────────────────────────────────

export type HouseStyle =
  | 'mairie' | 'tour' | 'chaumiere' | 'atelier' | 'cabane' | 'boulangerie' | 'forge' | 'auberge' | 'echoppe'
  | 'ferme' | 'moulin' | 'scierie' | 'carrefour';

/** Nature d'un nœud du réseau : on habite une maison, on travaille dans un lieu, on passe par un carrefour. */
export type NodeKind = 'maison' | 'travail' | 'carrefour';

export interface House {
  id: HouseId;
  ownerId: AgentId | null;
  /** Absent = maison. */
  kind?: NodeKind;
  position: Vec2;
  rotation: number;      // rotation Y en radians (la porte regarde vers +z local)
  style: HouseStyle;
  wallColor: string;
  roofColor: string;
  /** Chemin futur vers un modèle .glb (Kenney / Quaternius). Primitives si absent. */
  model?: string;
}

// ─── Travail ─────────────────────────────────────────────────────────────────

export type Era = 'ancienne';
export type WorkplaceKind = 'ferme' | 'moulin' | 'scierie' | 'forge' | 'boulangerie' | 'auberge' | 'herboristerie';
export type Good = 'ble' | 'farine' | 'pain' | 'bois' | 'outils';

export interface Workplace {
  id: string;
  kind: WorkplaceKind;
  era: Era;
  /** Nœud du réseau (entrée de `houses`, kind 'travail'). */
  houseId: HouseId;
  /** Patron qui empoche le surplus ; null = tenu par le village. */
  ownerId: AgentId | null;
  slots: number;
  workers: AgentId[];
  /** Caisse du lieu, en pièces. */
  till: number;
  stock: Partial<Record<Good, number>>;
  unpaidDays: number;
  openedDay: number;
}

export type RoadStatus = 'open' | 'cut';

/** Arête non orientée du graphe. Le tracé = porte(a) → waypoints → porte(b). */
export interface Road {
  id: RoadId;
  a: HouseId;
  b: HouseId;
  waypoints: Vec2[];
  status: RoadStatus;
}

export interface Terrain {
  size: number;
  plaza: { center: Vec2; radius: number };
  river: { points: Vec2[]; width: number };
}

// ─── Messages (messagers qui marchent) ───────────────────────────────────────

export type MessageKind =
  | 'chat'       // discussion libre
  | 'task'       // le maire assigne un travail
  | 'topic'      // l'éclaireur propose un sujet
  | 'draft'      // l'écrivain envoie un brouillon
  | 'edit'       // l'éditeur renvoie une version corrigée
  | 'review'     // avis du lecteur
  | 'decision'   // le maire tranche
  | 'campaign'   // propagande électorale
  | 'ballot';    // bulletin de vote scellé, porté jusqu'à la maison du maire

export type MessageStatus = 'walking' | 'delivered' | 'returned' | 'lost';

export interface Message {
  id: MessageId;
  from: AgentId;
  to: AgentId;
  /** Itinéraire complet, route par route, de la maison de l'expéditeur à celle du destinataire. */
  route: RoadId[];
  /** Étape en cours dans `route`. */
  leg: number;
  /** Route de l'étape en cours (= route[leg]). */
  roadId: RoadId;
  /** Nœud d'où part l'étape en cours : donne le sens de marche. */
  legFrom: HouseId;
  /** Auteur d'origine (ancien relais ; plus utilisé). */
  origin?: AgentId;
  kind: MessageKind;
  body: string;
  ballot?: Ballot;       // présent si kind === 'ballot'
  replyTo?: MessageId;
  createdTick: number;
  /** Avancement 0..1 sur l’étape en cours, depuis `legFrom`. */
  progress: number;
  /** Unités de monde par tick. */
  speed: number;
  status: MessageStatus;
}

// ─── Gazette ─────────────────────────────────────────────────────────────────

export interface Article {
  title: string;
  body: string;
  topicBy?: AgentId;
  writtenBy?: AgentId;
  editedBy?: AgentId;
}

export interface Gazette {
  day: number;
  headline: string;
  articles: Article[];
  review?: { by: AgentId; score: number; text: string };
  approvedBy?: AgentId;  // le maire qui a validé
  publishedTick?: number;
}

/** Ce que la gazette du jour a déjà reçu, en entier : le jeu le tient à jour quand les messages arrivent. */
export interface GazetteDraft {
  day: number;
  topic?: string;
  topicBy?: AgentId;
  draft?: string;
  draftBy?: AgentId;
  edited?: string;
  editedBy?: AgentId;
  review?: { by: AgentId; score: number; text: string };
}

// ─── Votes ───────────────────────────────────────────────────────────────────

export interface Ballot {
  voterId: AgentId;
  destitute: boolean;
  candidateId?: AgentId; // pour qui il vote si destitution
  reason: string;
  tick: number;
}

export interface VoteSession {
  id: VoteId;
  day: number;
  proposerId: AgentId;   // qui a lancé la motion
  targetMayorId: AgentId;
  candidates: AgentId[];
  ballots: Ballot[];
  openedTick: number;
  closesTick: number;
  status: 'open' | 'closed';
  result?: { destituted: boolean; newMayorId?: AgentId; tally: Record<string, number> };
}

// ─── Journal d'événements ────────────────────────────────────────────────────

export type SimEventType =
  | 'day.start' | 'day.end'
  | 'message.sent' | 'message.delivered' | 'message.relayed' | 'message.returned' | 'message.lost'
  | 'agent.thought' | 'agent.added' | 'agent.opinion'
  | 'road.cut' | 'road.added'
  | 'couple.formed' | 'couple.split' | 'agent.born' | 'agent.left' | 'house.built' | 'road.built'
  | 'gazette.published'
  | 'vote.opened' | 'vote.cast' | 'vote.closed' | 'mayor.elected'
  | 'god.inject' | 'sim.paused' | 'sim.resumed' | 'sim.speed'
  | 'llm.call' | 'llm.budget_exhausted' | 'llm.config'
  | 'world.effect'
  // Vie quotidienne
  | 'life.trip' | 'life.meet' | 'life.trade' | 'life.work' | 'life.need' | 'life.sleep'
  | 'rumor.spread' | 'rumor.announce'
  | 'crime.theft' | 'crime.investigate' | 'trial.opened' | 'trial.verdict'
  // Économie
  | 'job.changed' | 'workplace.opened' | 'workplace.closed'
  | 'health.sick' | 'health.healed' | 'repair.done' | 'song' | 'party'
  | 'village.event' | 'calendar' | 'life.hobby';

/** Une ligne du journal. Append-only, horodatée, rejouable : c'est le « script » des vidéos. */
export interface SimEvent {
  seq: number;           // ordre strict
  tick: number;
  day: number;
  at: string;            // ISO, heure réelle
  type: SimEventType;
  actors: AgentId[];
  text: string;          // phrase lisible, prête pour un sous-titre
  payload: Record<string, unknown>;
}

// ─── État global ─────────────────────────────────────────────────────────────

export interface LLMBudget {
  maxCallsPerDay: number;
  callsToday: number;
  maxTokens: number;     // max_tokens par appel
  tokensIn: number;
  tokensOut: number;
}

export interface SimClock {
  tick: number;
  day: number;
  ticksPerDay: number;
  tickMs: number;        // durée réelle d'un tick à vitesse x1
  speed: number;         // multiplicateur
  paused: boolean;
}

// ─── Éléments (météo et phénomènes) ──────────────────────────────────────────

/** orage : pluie, éclairs, messagers ralentis · crue : la rivière déborde et coupe les ponts ·
 *  puits : le puits de la place s'illumine (trésor, mystère). */
export type EffectKind = 'storm' | 'flood' | 'well';

export interface WorldEffect {
  id: string;
  kind: EffectKind;
  startTick: number;
  endTick: number;
  /** Routes coupées par l'effet (crue), rouvertes à la fin. */
  cutRoads?: RoadId[];
}

import type { LLMProviderName } from './estimate';

export interface WorldState {
  clock: SimClock;
  terrain: Terrain;
  mayorId: AgentId;
  agents: Record<AgentId, Agent>;
  houses: Record<HouseId, House>;
  roads: Record<RoadId, Road>;
  /** Lieux de travail (fermes, moulins, scieries…), rattachés à un nœud de `houses`. */
  workplaces: Record<string, Workplace>;
  messages: Record<MessageId, Message>;
  gazettes: Gazette[];
  votes: VoteSession[];
  /** Tous les N jours, une fenêtre de vote s'ouvre. */
  voteEveryDays: number;
  effects: WorldEffect[];
  rumors: Rumor[];
  gazetteDraft?: GazetteDraft;
  llm: {
    provider: LLMProviderName;
    budget: LLMBudget;
  };
}

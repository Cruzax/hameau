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
export type Role = 'MAIRE' | 'ECLAIREUR' | 'ECRIVAIN' | 'EDITEUR' | 'LECTEUR' | 'CITOYEN' | 'MENTEUR';

// ─── Agents ──────────────────────────────────────────────────────────────────

export interface Personality {
  traits: string[];      // ex. ["méticuleux", "susceptible"]
  tone: string;          // façon de parler, injectée dans le prompt système
  honesty: number;       // 0..1 — un MENTEUR est proche de 0
  ambition: number;      // 0..1 — propension à se présenter / proposer une destitution
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
}

// ─── Village (graphe) ────────────────────────────────────────────────────────

export type HouseStyle = 'mairie' | 'tour' | 'chaumiere' | 'atelier' | 'cabane';

export interface House {
  id: HouseId;
  ownerId: AgentId | null;
  position: Vec2;
  rotation: number;      // rotation Y en radians (la porte regarde vers +z local)
  style: HouseStyle;
  wallColor: string;
  roofColor: string;
  /** Chemin futur vers un modèle .glb (Kenney / Quaternius). Primitives si absent. */
  model?: string;
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
  roadId: RoadId;        // un message ne voyage que sur UNE route : entre voisins directs
  /** Destinataire final si `to` n'est qu'un relais (pas de route directe). */
  finalTo?: AgentId;
  /** Auteur d'origine d'un message relayé. */
  origin?: AgentId;
  kind: MessageKind;
  body: string;
  ballot?: Ballot;       // présent si kind === 'ballot'
  replyTo?: MessageId;
  createdTick: number;
  /** Avancement 0..1 le long de la route, dans le sens from → to. */
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
  | 'world.effect';

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

import type { LLMProviderName } from './providers';
export type { LLMProviderName };

export interface WorldState {
  clock: SimClock;
  terrain: Terrain;
  mayorId: AgentId;
  agents: Record<AgentId, Agent>;
  houses: Record<HouseId, House>;
  roads: Record<RoadId, Road>;
  messages: Record<MessageId, Message>;
  gazettes: Gazette[];
  votes: VoteSession[];
  /** Tous les N jours, une fenêtre de vote s'ouvre. */
  voteEveryDays: number;
  effects: WorldEffect[];
  llm: {
    provider: LLMProviderName;
    /** Modèle utilisé (Claude ou Ollama). */
    model?: string;
    /** Fournisseurs utilisables tout de suite (clé API présente, Ollama joignable). */
    available?: Partial<Record<LLMProviderName, boolean>>;
    /** Fin de chaque clé enregistrée (ex. « …a1b2 »), pour l'afficher sans la révéler. */
    keyHints?: Partial<Record<LLMProviderName, string>>;
    /** Modèles proposés par chaque fournisseur (récupérés à la vérification de la clé). */
    models?: Partial<Record<LLMProviderName, string[]>>;
    budget: LLMBudget;
  };
}

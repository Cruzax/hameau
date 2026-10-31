// Protocole WebSocket client ⇄ serveur.
import type { Agent, AgentId, EffectKind, HouseId, LLMProviderName, Message, RoadId, SimClock, SimEvent, Vec2, WorldState } from './types';

export const SERVER_PORT = 8787;

export type ServerToClient =
  | { type: 'snapshot'; world: WorldState; events: SimEvent[] }  // à la connexion
  | { type: 'tick'; clock: SimClock; messages: Message[] }       // messagers en route
  | { type: 'events'; events: SimEvent[] }                       // nouvelles lignes du journal
  | { type: 'patch'; world: Partial<WorldState> };               // changements structurels (routes, agents, gazettes…)

/** Commandes du panneau « Dieu ». */
export type ClientToServer =
  | { type: 'god.pause' }
  | { type: 'god.resume' }
  | { type: 'god.speed'; speed: number }
  | { type: 'god.road.cut'; roadId: RoadId }
  | { type: 'god.road.add'; a: HouseId; b: HouseId; waypoints?: Vec2[] }
  | { type: 'god.inject'; text: string; targets?: AgentId[] }
  | { type: 'god.agent.add'; agent: Partial<Agent> & { name: string; role: Agent['role'] }; near: HouseId }
  | { type: 'god.agent.exile'; agentId: AgentId }
  | { type: 'god.vote.force' }
  | { type: 'god.opinion'; who: AgentId; about: AgentId; delta: number }
  | { type: 'god.effect'; kind: EffectKind }
  /** Choix du cerveau des agents, en direct. */
  | { type: 'llm.config'; provider: LLMProviderName; model?: string }
  /** Enregistre (ou efface, avec null) la clé API Anthropic dans le .env local. Jamais renvoyée au client. */
  | { type: 'llm.key'; key: string | null };

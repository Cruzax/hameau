import { create } from 'zustand';
import { createSeedWorld, type AgentId, type ClientToServer, type SimEvent, type WorldState } from '@hameau/shared';

export type BubbleKind = 'say' | 'think' | 'news';

export interface Bubble {
  id: number;
  agentId: AgentId;
  text: string;
  kind: BubbleKind;
  until: number; // performance.now() en ms
}

interface HameauState {
  world: WorldState;
  events: SimEvent[];
  bubbles: Record<AgentId, Bubble>;
  connected: boolean;
  /** Instant (performance.now) du dernier tick reçu : sert à interpoler les messagers. */
  tickAt: number;
  /** En replay, le direct est ignoré et le monde est reconstruit depuis le journal. */
  mode: 'live' | 'replay';
  replay: { tick: number; endTick: number; speed: number; paused: boolean } | null;
  send: (cmd: ClientToServer) => void;
}

const MAX_EVENTS = 1000;

// Monde du seed tant que le serveur n'a pas répondu : la scène s'affiche quand même.
export const useHameau = create<HameauState>(() => ({
  world: createSeedWorld(),
  events: [],
  bubbles: {},
  connected: false,
  tickAt: 0,
  mode: 'live',
  replay: null,
  send: () => {},
}));

let bubbleSeq = 0;

/** Transforme les lignes du journal en bulles au-dessus des personnages. */
function bubblesFrom(events: SimEvent[], current: Record<AgentId, Bubble>, speed: number) {
  const next = { ...current };
  const now = performance.now();
  const life = 5200 / Math.max(1, Math.sqrt(speed));
  const put = (agentId: AgentId | undefined, text: string, kind: BubbleKind) => {
    if (agentId) next[agentId] = { id: ++bubbleSeq, agentId, text, kind, until: now + life };
  };
  for (const e of events) {
    const p = e.payload as Record<string, unknown>;
    switch (e.type) {
      case 'message.sent':
        put(e.actors[0], String(p.body), 'say');
        break;
      case 'agent.thought':
        put(e.actors[0], String(p.text), 'think');
        break;
      case 'message.lost':
        put(e.actors[0], 'Aucune route… le message est perdu.', 'think');
        break;
      case 'vote.opened':
        if (e.actors.length) put(e.actors[0], 'Je demande la destitution du maire !', 'news');
        break;
      case 'mayor.elected':
        put(e.actors[0], e.text.replace(/^👑\s*/, ''), 'news');
        break;
      case 'couple.formed':
      case 'agent.born':
      case 'house.built':
        put(e.actors[0], e.text, 'news');
        break;
      case 'gazette.published':
        put(e.actors[0], e.text.replace(/^📰\s*/, ''), 'news');
        break;
    }
  }
  return next;
}

export function appendEvents(events: SimEvent[]) {
  useHameau.setState((s) => ({
    events: [...s.events, ...events].slice(-MAX_EVENTS),
    bubbles: bubblesFrom(events, s.bubbles, s.world.clock.speed),
  }));
}

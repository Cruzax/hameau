import { create } from 'zustand';
import { createSeedWorld, type AgentId, type ClientToServer, type SimEvent, type WorldState } from '@hameau/shared';

export type BubbleKind = 'say' | 'think' | 'news' | 'emote';

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
  /** Partie de la dernière visite reprise (true), village neuf (false), pas encore su (null). */
  restored: boolean | null;
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
  restored: null,
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
  // Petite émoticône, seulement si l'habitant ne parle pas déjà.
  const emote = (agentId: AgentId | undefined, icon: string) => {
    if (!agentId) return;
    const cur = next[agentId];
    if (cur && cur.until > now && cur.kind !== 'emote') return;
    next[agentId] = { id: ++bubbleSeq, agentId, text: icon, kind: 'emote', until: now + life * 0.6 };
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
      case 'agent.born':
      case 'house.built':
        put(e.actors[0], e.text, 'news');
        break;
      case 'gazette.published':
        put(e.actors[0], e.text.replace(/^📰\s*/, ''), 'news');
        break;
      // Vie quotidienne : ce qu'on se dit de vive voix, ce qu'on chante, ce qu'on annonce.
      case 'life.meet':
      case 'rumor.spread':
        put(e.actors[0], String(p.body ?? ''), 'say');
        break;
      case 'song':
      case 'rumor.announce':
        put(e.actors[0], String(p.body ?? e.text), 'news');
        break;
      case 'couple.formed':
        emote(e.actors[1], '❤️');
        put(e.actors[0], e.text, 'news');
        break;
      case 'agent.opinion':
        emote(e.actors[0], Number(p.after) > Number(p.before) ? '💚' : '💢');
        break;
      case 'life.hobby':
        emote(e.actors[0], String(e.text).split(' ')[0]);
        break;
      case 'life.trade':
        emote(e.actors[0], p.item === 'bois' ? '🪵' : p.gift ? '🤲' : '🥖');
        break;
      case 'life.work':
      case 'health.sick':
      case 'health.healed':
      case 'repair.done':
      case 'crime.theft':
      case 'crime.investigate':
      case 'trial.opened':
      case 'trial.verdict':
        put(e.actors[0], e.text.replace(/^\S+\s/, ''), e.type.startsWith('trial') || e.type === 'crime.theft' ? 'news' : 'think');
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

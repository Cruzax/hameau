import { roadLength, type Agent, type Gazette, type House, type Message, type MessageKind, type Road, type SimEvent, type WorldState } from '@hameau/shared';
import { appendEvents, useHameau } from './store';
import { resync } from './socket';

const STEP_MS = 100;
/** Ticks laissés après le dernier événement pour que les messagers en route arrivent. */
const END_GRACE_TICKS = 40;

interface ReplayState {
  events: SimEvent[];
  cursor: number;
  tick: number;
  endTick: number;
  speed: number;
  paused: boolean;
  timer?: ReturnType<typeof setInterval>;
}

let rp: ReplayState | null = null;

/** Monde tel qu'il était juste avant `startSeq`, en défaisant ce qui a changé depuis (au mieux). */
function worldBefore(current: WorldState, events: SimEvent[], startSeq: number): WorldState {
  const w: WorldState = structuredClone(current);
  const later = events.filter((e) => e.seq >= startSeq);
  for (const e of [...later].reverse()) {
    const p = e.payload as Record<string, unknown>;
    const roadId = p.roadId as string | undefined;
    if (e.type === 'road.cut' && roadId && w.roads[roadId]) w.roads[roadId].status = 'open';
    if (e.type === 'road.added' && roadId && w.roads[roadId]) w.roads[roadId].status = 'cut';
    if (e.type === 'road.built' && roadId) delete w.roads[roadId];
    if (e.type === 'mayor.elected' && !p.kept && e.actors[1]) w.mayorId = e.actors[1];
    if (e.type === 'agent.added' && p.agentId) {
      const id = p.agentId as string;
      delete w.houses[w.agents[id]?.houseId ?? `h-${id}`];
      delete w.agents[id];
    }
  }
  const start = later[0];
  w.messages = {};
  w.effects = [];
  w.gazettes = w.gazettes.filter((g) => !start || (g.publishedTick ?? 0) < start.tick);
  w.votes = w.votes.filter((v) => !start || v.openedTick < start.tick);
  if (start) w.clock = { ...w.clock, tick: start.tick, day: start.day, paused: false };
  return w;
}

/** Rejoue un événement sur le monde (même logique que le serveur, côté rendu seulement). */
function apply(w: WorldState, e: SimEvent) {
  const p = e.payload as Record<string, unknown>;
  switch (e.type) {
    case 'message.sent': {
      const id = p.messageId as string;
      const from = e.actors[0];
      const route = (p.route as string[] | undefined) ?? (p.roadId ? [p.roadId as string] : []);
      if (!route.length || route.some((r) => !w.roads[r]) || !w.agents[from]) return;
      const msg: Message = {
        id, from, to: e.actors[1], route, leg: 0, roadId: route[0], legFrom: w.agents[from].houseId,
        kind: p.kind as MessageKind, body: String(p.body ?? ''),
        createdTick: e.tick, progress: 0, speed: Number(p.speed ?? 0.5), status: 'walking',
      };
      w.messages = { ...w.messages, [id]: msg };
      break;
    }
    case 'message.delivered':
    case 'message.returned':
    case 'message.lost': {
      const id = p.messageId as string | undefined;
      if (id && w.messages[id]) {
        const { [id]: _, ...rest } = w.messages;
        w.messages = rest;
      }
      break;
    }
    case 'road.cut':
    case 'road.added':
    case 'road.built': {
      const road = p.road as Road | undefined;
      if (road) w.roads = { ...w.roads, [road.id]: { ...road, status: e.type === 'road.cut' ? 'cut' : 'open' } };
      break;
    }
    case 'mayor.elected':
      if (!p.kept) w.mayorId = e.actors[0];
      break;
    case 'gazette.published':
      if (p.gazette) w.gazettes = [...w.gazettes, p.gazette as Gazette];
      break;
    case 'agent.opinion': {
      const [who, about] = e.actors;
      if (w.agents[who] && typeof p.after === 'number') {
        w.agents = { ...w.agents, [who]: { ...w.agents[who], opinions: { ...w.agents[who].opinions, [about]: p.after } } };
      }
      break;
    }
    case 'world.effect': {
      const fx = p.effect as WorldState['effects'][number] | undefined;
      if (fx) w.effects = p.phase === 'start' ? [...(w.effects ?? []), fx] : (w.effects ?? []).filter((x) => x.id !== fx.id);
      break;
    }
    case 'agent.born':
      if (p.agent) w.agents = { ...w.agents, [(p.agent as Agent).id]: p.agent as Agent };
      break;
    case 'house.built':
      if (p.house) {
        const h = p.house as House;
        w.houses = { ...w.houses, [h.id]: h };
        if (w.agents[e.actors[0]]) w.agents = { ...w.agents, [e.actors[0]]: { ...w.agents[e.actors[0]], houseId: h.id } };
      }
      break;
    case 'agent.added':
      if (p.agent && p.house) {
        const a = p.agent as Agent;
        const h = p.house as House;
        w.agents = { ...w.agents, [a.id]: a };
        w.houses = { ...w.houses, [h.id]: h };
      }
      break;
  }
}

function step() {
  if (!rp || rp.paused) return;
  const s = useHameau.getState();
  const w: WorldState = { ...s.world };
  rp.tick += (STEP_MS / w.clock.tickMs) * rp.speed;
  const due: SimEvent[] = [];
  while (rp.cursor < rp.events.length && rp.events[rp.cursor].tick <= rp.tick) due.push(rp.events[rp.cursor++]);
  for (const e of due) apply(w, e);

  // Avancement des messagers d'après le temps écoulé depuis leur départ.
  const msgs: Record<string, Message> = {};
  for (const m of Object.values(w.messages)) {
    // Distance parcourue depuis le départ, répartie sur les étapes de l'itinéraire.
    let left = (rp.tick - m.createdTick) * m.speed;
    let legFrom = w.agents[m.from]?.houseId ?? m.legFrom;
    let placed: Message | null = null;
    for (let leg = 0; leg < m.route.length; leg++) {
      const road = w.roads[m.route[leg]];
      if (!road) break;
      const len = Math.max(1, roadLengthOf(w, road));
      if (left <= len || leg === m.route.length - 1) {
        placed = { ...m, leg, roadId: road.id, legFrom, progress: Math.min(1, left / len) };
        break;
      }
      left -= len;
      legFrom = road.a === legFrom ? road.b : road.a;
    }
    if (placed) msgs[m.id] = placed;
  }
  w.messages = msgs;
  w.clock = { ...w.clock, tick: Math.floor(rp.tick), day: due.length ? due[due.length - 1].day : w.clock.day, speed: rp.speed, paused: false };
  useHameau.setState({ world: w, tickAt: performance.now(), replay: { tick: rp.tick, endTick: rp.endTick, speed: rp.speed, paused: rp.paused } });
  if (due.length) appendEvents(due);
  // Fin : tout est rejoué et les derniers messagers sont arrivés (ou on a assez attendu).
  const done = rp.cursor >= rp.events.length;
  if (done && (!Object.keys(w.messages).length || rp.tick > rp.endTick + END_GRACE_TICKS)) stopReplay();
}

const roadLengthOf = (w: WorldState, r: Road) => roadLength(r, w.houses);

/** Lance le replay à partir de l'événement `startSeq` (par défaut le début du journal fourni). */
export function startReplay(events: SimEvent[], startSeq?: number) {
  stopReplay(false);
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const from = startSeq ?? sorted[0]?.seq ?? 0;
  const list = sorted.filter((e) => e.seq >= from);
  if (!list.length) return;
  const s = useHameau.getState();
  const base = worldBefore(s.world, sorted, from);
  rp = { events: list, cursor: 0, tick: list[0].tick - 2, endTick: list[list.length - 1].tick, speed: 1, paused: false };
  useHameau.setState({
    mode: 'replay',
    world: base,
    events: sorted.filter((e) => e.seq < from).slice(-50),
    bubbles: {},
    replay: { tick: rp.tick, endTick: rp.endTick, speed: 1, paused: false },
  });
  rp.timer = setInterval(step, STEP_MS);
}

export function setReplaySpeed(speed: number) {
  if (rp) rp.speed = speed;
}

export function toggleReplayPause() {
  if (!rp) return;
  rp.paused = !rp.paused;
  useHameau.setState((s) => ({ replay: s.replay && { ...s.replay, paused: rp!.paused } }));
}

/** Fin du replay : retour au direct (nouvel instantané du serveur). */
export function stopReplay(backToLive = true) {
  if (rp?.timer) clearInterval(rp.timer);
  rp = null;
  if (backToLive && useHameau.getState().mode === 'replay') {
    useHameau.setState({ mode: 'live', replay: null, bubbles: {} });
    resync();
  }
}

/** Charge un journal exporté (.json) et le rejoue depuis le début. */
export async function replayFile(file: File) {
  const events = JSON.parse(await file.text()) as SimEvent[];
  if (Array.isArray(events)) startReplay(events);
}

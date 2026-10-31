import {
  createSeedWorld,
  roadLength,
  type Agent,
  type AgentId,
  type Ballot,
  type ClientToServer,
  type Gazette,
  type Message,
  type MessageKind,
  type ServerToClient,
  type SimEvent,
  type VoteSession,
  type WorldState,
} from '@hameau/shared';
import { Journal } from '../store/journal';
import { nextHop, roadBetween } from './graph';
import { Politics } from './politics';
import { Life } from './life';
import { Daily } from './daily';
import { effectsFromText, isActive, startEffect, STORM_SLOWDOWN, tickEffects } from './effects';
import { neighbors } from './graph';
import { addAgent, buildRoad, cutOrReopenRoad, exileAgent } from './god';

/** Unités de monde parcourues par un messager à chaque tick. */
const WALK_SPEED = 0.5;
const SHORT_MEMORY = 12;
const RELAY_DELAY = 4;

export type Action =
  | { type: 'send'; to: AgentId; kind: MessageKind; body: string; replyTo?: string }
  | { type: 'think'; text: string }
  | { type: 'publish'; gazette: Omit<Gazette, 'day' | 'publishedTick'> }
  | { type: 'opinion'; about: AgentId; delta: number; reason: string }
  | { type: 'ballot'; ballot: Omit<Ballot, 'tick' | 'voterId'> };

/** Ce qui décide du comportement des agents (LLMProvider : mock, Anthropic ou Ollama). */
export interface Brain {
  onDayStart(sim: Sim): void;
  onMessage(sim: Sim, agent: Agent, msg: Message): void;
  onTick?(sim: Sim): void;
  onDayEnd?(sim: Sim): void;
  onInject?(sim: Sim, text: string): void;
  /** Un vote de destitution s'ouvre : chaque agent doit envoyer un bulletin (action 'ballot'). */
  onVoteOpened?(sim: Sim, vote: VoteSession): void;
}

/** Variation d'opinion à partir de laquelle on l'inscrit au journal. */
const NOTABLE_OPINION = 0.15;

interface Pending { due: number; agentId: AgentId; actions: Action[]; relay?: Message; deliverSelf?: Message }

export class Sim {
  readonly world: WorldState = createSeedWorld();
  private readonly pending: Pending[] = [];
  private outbox: SimEvent[] = [];
  private agentsDirty = false;
  private llmDirty = false;
  private timer: NodeJS.Timeout | null = null;
  readonly politics = new Politics();
  readonly life = new Life();
  /** Vie quotidienne : besoins, métiers, déplacements, rumeurs, justice. */
  readonly daily = new Daily();
  /** Vie du village (couples, naissances, constructions…). Désactivable avec LIFE_ENABLED=false. */
  lifeEnabled = process.env.LIFE_ENABLED !== 'false';
  private nextMsgId = 1;

  constructor(
    readonly brain: Brain,
    readonly journal: Journal,
    private readonly broadcast: (msg: ServerToClient) => void,
  ) {}

  get clock() {
    return this.world.clock;
  }

  get dayTick() {
    return this.clock.tick % this.clock.ticksPerDay;
  }

  agent(id: AgentId) {
    return this.world.agents[id];
  }

  // ─── Boucle ────────────────────────────────────────────────────────────────

  start() {
    this.startDay();
    this.flush();
    this.schedule();
  }

  private schedule() {
    this.timer = setTimeout(() => {
      this.tick();
      this.schedule();
    }, this.clock.tickMs / this.clock.speed);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
  }

  tick() {
    if (this.clock.paused) return;
    this.clock.tick++;
    if (this.dayTick === 0) {
      this.endDay();
      this.clock.day++;
      this.world.llm.budget.callsToday = 0;
      this.touchLLM();
      this.startDay();
    }
    this.advanceMessages();
    this.runPending();
    this.politics.onTick(this);
    this.daily.onTick(this);
    tickEffects(this);
    this.brain.onTick?.(this);
    this.flush();
  }

  private startDay() {
    this.emit('day.start', [], `☀️ Jour ${this.clock.day} — le village se réveille.`);
    this.brain.onDayStart(this);
  }

  private endDay() {
    const published = this.world.gazettes.some((g) => g.day === this.clock.day);
    this.brain.onDayEnd?.(this);
    this.politics.onDayEnd(this, published);
    if (this.lifeEnabled) {
      // Le voisinage rapproche : un peu d'estime en plus entre voisins directs, chaque soir.
      for (const a of Object.values(this.world.agents)) for (const n of neighbors(this.world, a.id)) this.adjustOpinion(a.id, n, 0.02);
      this.life.onDayEnd(this);
    }
    this.emit('day.end', [], published ? `🌙 Fin du jour ${this.clock.day}.` : `🌙 Fin du jour ${this.clock.day} — pas de gazette ce soir.`, { published });
  }

  /** Envoie au client tout ce qui a changé pendant ce tick. */
  private flush() {
    this.broadcast({ type: 'tick', clock: this.clock, messages: Object.values(this.world.messages) });
    if (this.outbox.length) {
      this.broadcast({ type: 'events', events: this.outbox });
      this.outbox = [];
    }
    if (this.agentsDirty) {
      this.broadcast({ type: 'patch', world: { agents: this.world.agents, mayorId: this.world.mayorId } });
      this.agentsDirty = false;
    }
    if (this.llmDirty) {
      this.broadcast({ type: 'patch', world: { llm: this.world.llm } });
      this.llmDirty = false;
    }
  }

  /** Agents (activité, opinions, rôles, maire) modifiés : renvoyés au prochain flush. */
  touchAgents() {
    this.agentsDirty = true;
  }

  /** Votes modifiés : envoyés tout de suite (rares). */
  touchVotes() {
    this.broadcast({ type: 'patch', world: { votes: this.world.votes } });
  }

  /** Compteurs LLM modifiés (appels, tokens) : à renvoyer au client au prochain flush. */
  touchLLM() {
    this.llmDirty = true;
  }

  // ─── Journal ───────────────────────────────────────────────────────────────

  emit(type: SimEvent['type'], actors: AgentId[], text: string, payload: Record<string, unknown> = {}) {
    const e = this.journal.append({ tick: this.clock.tick, day: this.clock.day, type, actors, text, payload });
    this.outbox.push(e);
    return e;
  }

  // ─── Actions des agents ────────────────────────────────────────────────────

  /** Programme des actions pour un agent après un temps de réflexion (en ticks). */
  plan(agentId: AgentId, delay: number, actions: Action[]) {
    this.pending.push({ due: this.clock.tick + Math.max(1, delay), agentId, actions });
    this.setActivity(agentId, 'thinking');
  }

  private runPending() {
    const due = this.pending.filter((p) => p.due <= this.clock.tick);
    if (!due.length) return;
    for (const p of due) this.pending.splice(this.pending.indexOf(p), 1);
    for (const p of due) {
      if (!this.agent(p.agentId)) continue;
      if (p.relay) this.relay(p.agentId, p.relay);
      if (p.deliverSelf) this.receive(p.deliverSelf);
      for (const a of p.actions) this.apply(p.agentId, a);
      if (!this.pending.some((q) => q.agentId === p.agentId)) this.setActivity(p.agentId, 'idle');
    }
  }

  private apply(agentId: AgentId, a: Action) {
    const me = this.agent(agentId);
    switch (a.type) {
      case 'think':
        this.emit('agent.thought', [agentId], `💭 ${me.name} : ${a.text}`, { text: a.text });
        break;
      case 'send':
        this.send(agentId, a.to, a.kind, a.body, { replyTo: a.replyTo });
        break;
      case 'publish': {
        const g: Gazette = { ...a.gazette, day: this.clock.day, publishedTick: this.clock.tick, approvedBy: agentId };
        this.world.gazettes.push(g);
        this.emit('gazette.published', [agentId], `📰 La Gazette du jour ${g.day} paraît : « ${g.headline} »`, { gazette: g });
        this.daily.payGazette(this);
        this.broadcast({ type: 'patch', world: { gazettes: this.world.gazettes } });
        break;
      }
      case 'opinion':
        this.adjustOpinion(agentId, a.about, a.delta, a.reason);
        break;
      case 'ballot':
        this.politics.cast(this, agentId, a.ballot);
        break;
    }
  }

  setActivity(id: AgentId, activity: Agent['activity']) {
    const a = this.agent(id);
    if (a && a.activity !== activity) {
      a.activity = activity;
      this.agentsDirty = true;
    }
  }

  /** Opinion de `who` sur `about`, bornée à [-1, 1]. Les changements marquants vont au journal. */
  adjustOpinion(who: AgentId, about: AgentId, delta: number, reason = '') {
    const a = this.agent(who);
    if (!a || !this.agent(about) || who === about || !delta) return;
    const before = a.opinions[about] ?? 0;
    const after = Math.max(-1, Math.min(1, before + delta));
    a.opinions[about] = Math.round(after * 100) / 100;
    this.agentsDirty = true;
    if (Math.abs(delta) >= NOTABLE_OPINION) {
      const verb = delta > 0 ? '💚 gagne en estime pour' : '💔 perd confiance en';
      this.emit('agent.opinion', [who, about], `${a.name} ${verb} ${this.agent(about).name}${reason ? ` : « ${reason} »` : '.'}`, {
        before, after: a.opinions[about], reason,
      });
    }
  }

  /**
   * Envoie un message vers `finalTo`. S'il n'y a pas de route directe, le messager part
   * vers le premier voisin du plus court chemin, qui relaiera. Sans chemin : message perdu.
   */
  send(from: AgentId, finalTo: AgentId, kind: MessageKind, body: string, opts: { origin?: AgentId; replyTo?: string; ballot?: Ballot } = {}) {
    const sender = this.agent(from);
    const target = this.agent(finalTo);
    if (!sender || !target) return null;
    // Même toit (soi-même, ou parent et enfant) : pas besoin de messager.
    if (from === finalTo || sender.houseId === target.houseId) return this.sendInHouse(from, finalTo, kind, body, opts.ballot);
    const hop = roadBetween(this.world, from, finalTo) ? finalTo : nextHop(this.world, from, finalTo);
    if (!hop) {
      this.emit('message.lost', [from, finalTo], `🚫 ${sender.name} ne peut pas joindre ${target.name} : aucune route.`, { kind, body });
      return null;
    }
    const road = roadBetween(this.world, from, hop)!;
    const msg: Message = {
      id: `m${this.nextMsgId++}`,
      from,
      to: hop,
      roadId: road.id,
      finalTo: hop === finalTo ? undefined : finalTo,
      origin: opts.origin,
      kind,
      body,
      replyTo: opts.replyTo,
      ballot: opts.ballot,
      createdTick: this.clock.tick,
      progress: 0,
      speed: WALK_SPEED,
      status: 'walking',
    };
    this.world.messages[msg.id] = msg;
    const via = hop === finalTo ? '' : ` (via ${this.agent(hop).name})`;
    this.emit('message.sent', [from, finalTo], `${sender.name} → ${target.name}${via} : « ${body} »`, {
      messageId: msg.id, kind, body, hop, roadId: road.id, speed: WALK_SPEED, finalTo,
    });
    return msg;
  }

  private relay(by: AgentId, msg: Message) {
    const finalTo = msg.finalTo!;
    const origin = msg.origin ?? msg.from;
    const relayer = this.agent(by);
    this.life.noteRelay(origin, finalTo);
    this.emit('message.relayed', [by, origin, finalTo],
      `🔁 ${relayer.name} relaie à ${this.agent(finalTo).name} le message de ${this.agent(origin).name}.`, { messageId: msg.id });
    this.send(by, finalTo, msg.kind, msg.body, { origin, replyTo: msg.replyTo, ballot: msg.ballot });
  }

  private advanceMessages() {
    for (const msg of Object.values(this.world.messages)) {
      const road = this.world.roads[msg.roadId];
      if (!road || road.status === 'cut') {
        delete this.world.messages[msg.id];
        msg.status = msg.progress < 0.5 ? 'returned' : 'lost';
        const verb = msg.status === 'returned' ? 'rebrousse chemin' : 'est bloqué au milieu de la route';
        this.emit(msg.status === 'returned' ? 'message.returned' : 'message.lost', [msg.from, msg.to],
          `✂️ La route est coupée : le messager de ${this.agent(msg.from).name} ${verb}.`, { messageId: msg.id });
        continue;
      }
      const speed = isActive(this, 'storm') ? msg.speed * STORM_SLOWDOWN : msg.speed;
      msg.progress = Math.min(1, msg.progress + speed / roadLength(road, this.world.houses));
      if (msg.progress >= 1) this.deliver(msg);
    }
  }

  private deliver(msg: Message) {
    delete this.world.messages[msg.id];
    msg.status = 'delivered';
    const to = this.agent(msg.to);
    this.emit('message.delivered', [msg.from, msg.to], `📨 ${to.name} reçoit le message de ${this.agent(msg.origin ?? msg.from).name}.`, {
      messageId: msg.id,
    });
    this.remember(msg.from, msg.to, 'out', msg.body);
    this.remember(msg.to, msg.from, 'in', msg.body);

    if (msg.finalTo && msg.finalTo !== msg.to) {
      this.pending.push({ due: this.clock.tick + RELAY_DELAY, agentId: msg.to, actions: [], relay: msg });
      return;
    }
    this.receive(msg);
  }

  private receive(msg: Message) {
    if (msg.kind === 'ballot') this.politics.receive(this, msg);
    else this.brain.onMessage(this, this.agent(msg.to), msg);
  }

  /**
   * Message sans messager : à soi-même (un agent qui cumule deux rôles, ex. maire et éclaireur)
   * ou à quelqu'un qui vit sous le même toit.
   */
  private sendInHouse(from: AgentId, to: AgentId, kind: MessageKind, body: string, ballot?: Ballot) {
    const msg: Message = {
      id: `m${this.nextMsgId++}`, from, to, roadId: '', kind, body, ballot,
      createdTick: this.clock.tick, progress: 1, speed: 0, status: 'delivered',
    };
    if (from !== to) this.emit('message.sent', [from, to], `${this.agent(from).name} → ${this.agent(to).name} (à la maison) : « ${body} »`, { messageId: msg.id, kind, body });
    this.pending.push({ due: this.clock.tick + RELAY_DELAY, agentId: to, actions: [], deliverSelf: msg });
    return msg;
  }

  remember(id: AgentId, other: AgentId, direction: 'in' | 'out', text: string) {
    const m = this.agent(id).memory.short;
    m.push({ tick: this.clock.tick, day: this.clock.day, with: other, direction, text });
    if (m.length > SHORT_MEMORY) m.shift();
  }

  // ─── Commandes « Dieu » ───────────────────────────────────────────────────

  command(c: ClientToServer) {
    switch (c.type) {
      case 'god.pause':
        this.clock.paused = true;
        this.emit('sim.paused', [], '⏸ Pause.');
        break;
      case 'god.resume':
        this.clock.paused = false;
        this.emit('sim.resumed', [], '▶ Reprise.');
        break;
      case 'god.speed':
        this.clock.speed = Math.min(Math.max(c.speed, 0.25), 16);
        this.emit('sim.speed', [], `⏩ Vitesse ×${this.clock.speed}.`, { speed: this.clock.speed });
        break;
      case 'god.road.cut':
        cutOrReopenRoad(this, c.roadId);
        break;
      case 'god.road.add':
        buildRoad(this, c.a, c.b, c.waypoints);
        break;
      case 'god.inject':
        this.emit('god.inject', c.targets ?? [], `⚡ Événement : ${c.text}`, { text: c.text });
        for (const kind of effectsFromText(c.text)) startEffect(this, kind);
        this.brain.onInject?.(this, c.text);
        break;
      case 'god.effect': {
        const text = { storm: 'Un violent orage s’abat sur le village', flood: 'La rivière déborde', well: 'Le puits de la place s’illumine mystérieusement' }[c.kind];
        startEffect(this, c.kind);
        this.brain.onInject?.(this, text);
        break;
      }
      case 'llm.config':
        // Géré par index.ts (qui possède le fournisseur) ; voir onLLMConfig.
        this.onLLMConfig?.(c);
        break;
      case 'god.agent.add':
        addAgent(this, c);
        break;
      case 'god.agent.exile':
        exileAgent(this, c.agentId);
        break;
      case 'god.vote.force':
        if (!this.politics.current(this)) this.politics.open(this, true);
        break;
      case 'god.opinion':
        this.adjustOpinion(c.who, c.about, c.delta, c.delta < 0 ? 'Une petite voix me souffle de m’en méfier…' : 'Une petite voix me dit de lui faire confiance.');
        break;
    }
    this.flush();
  }

  /** Branché par index.ts pour changer de fournisseur LLM en direct. */
  onLLMConfig?: (c: Extract<ClientToServer, { type: 'llm.config' }>) => void;

  broadcastPatch(world: Partial<WorldState>) {
    this.broadcast({ type: 'patch', world });
  }
}

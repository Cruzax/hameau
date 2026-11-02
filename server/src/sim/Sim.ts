import {
  createSeedWorld,
  dayFraction,
  type VillagePreset,
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
import { buildNetwork, neighbors, route } from './network';
import { Politics } from './politics';
import { Life } from './life';
import { Daily } from './daily';
import { Economy } from './economy';
import { clearNews, pushNews } from '../content/news';
import { effectsFromText, isActive, startEffect, STORM_SLOWDOWN, tickEffects } from './effects';
import { addAgent, buildRoad, cutOrReopenRoad, exileAgent } from './god';

/** Unités de monde parcourues par un messager à chaque tick. */
const WALK_SPEED = 0.5;
const SHORT_MEMORY = 12;
const RELAY_DELAY = 4;
/** Les bulletins de vote sont portés au pas de course, pour arriver avant la clôture. */
const BALLOT_SPEEDUP = 1.8;
/** Les textes de la gazette voyagent aussi plus vite, pour paraître avant le soir. */
const GAZETTE_SPEEDUP = 1.5;
const GAZETTE_KINDS: MessageKind[] = ['task', 'topic', 'draft', 'edit', 'review'];
/** Heures où l'on rappelle au maire que la gazette n'est pas parue. */
const DEADLINE_HOURS = [16, 19];

export type Action =
  | { type: 'send'; to: AgentId; kind: MessageKind; body: string; replyTo?: string }
  | { type: 'think'; text: string }
  | { type: 'publish'; gazette: Omit<Gazette, 'day' | 'publishedTick'> }
  | { type: 'opinion'; about: AgentId; delta: number; reason: string }
  /** Aller à pied : 'place', 'foret', 'riviere', ou chez un habitant (son id). */
  | { type: 'go'; place: string }
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
  /** 19 h et pas de gazette : dernier rappel au maire. */
  onDeadline?(sim: Sim): void;
}

/** Ce qui mérite d'être proposé comme sujet de gazette. */
const NEWSWORTHY = new Set<SimEvent['type']>([
  'village.event', 'crime.theft', 'trial.verdict', 'couple.formed', 'agent.born', 'world.effect', 'party',
  'health.sick', 'repair.done', 'mayor.elected', 'agent.left', 'agent.added', 'house.built',
]);

/** Variation d'opinion à partir de laquelle on l'inscrit au journal. */
const NOTABLE_OPINION = 0.15;

interface Pending { due: number; agentId: AgentId; actions: Action[]; deliverSelf?: Message }

export class Sim {
  readonly world: WorldState = createSeedWorld();
  private readonly pending: Pending[] = [];
  private outbox: SimEvent[] = [];
  private agentsDirty = false;
  private llmDirty = false;
  private timer: NodeJS.Timeout | null = null;
  politics = new Politics();
  life = new Life();
  /** Vie quotidienne : besoins, métiers, déplacements, rumeurs, justice. */
  daily = new Daily();
  /** Emplois, salaires, lieux de travail. */
  economy = new Economy();
  /** Vie du village (couples, naissances, constructions…). Désactivable avec LIFE_ENABLED=false. */
  lifeEnabled = process.env.LIFE_ENABLED !== 'false';
  private nextMsgId = 1;

  constructor(
    readonly brain: Brain,
    readonly journal: Journal,
    private readonly broadcast: (msg: ServerToClient) => void,
  ) {
    // Le monde de départ n'a que la place et les ponts : on y raccorde les maisons, sans bruit.
    buildNetwork(this, { silent: true });
  }

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
    this.begin();
    this.schedule();
  }

  /** Premier matin, sans minuterie : sert aussi aux simulations sans écran. */
  begin() {
    this.startDay();
    this.flush();
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
    if (DEADLINE_HOURS.some((h) => this.dayTick === Math.round(this.clock.ticksPerDay * dayFraction(h)))) this.brain.onDeadline?.(this);
    this.daily.onTick(this);
    tickEffects(this);
    this.brain.onTick?.(this);
    this.flush();
  }

  private startDay() {
    this.emit('day.start', [], `☀️ Jour ${this.clock.day} — le village se réveille.`);
    this.world.gazetteDraft = { day: this.clock.day };
    this.daily.morning(this);
    this.economy.morning(this);
    this.brain.onDayStart(this);
  }

  private endDay() {
    const published = this.world.gazettes.some((g) => g.day === this.clock.day);
    this.economy.evening(this);
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
    if (NEWSWORTHY.has(type) && payload.phase !== 'end' && !payload.kept) pushNews(text);
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
        const dossier = this.world.gazetteDraft;
        const article = a.gazette.articles[0];
        const body = dossier?.edited ?? dossier?.draft;
        if (article && body && (article.body ?? '').length < body.length * 0.6) article.body = body;
        if (article && dossier) Object.assign(article, { topicBy: dossier.topicBy, writtenBy: dossier.draftBy, editedBy: dossier.editedBy });
        const g: Gazette = {
          ...a.gazette,
          review: a.gazette.review ?? dossier?.review,
          day: this.clock.day,
          publishedTick: this.clock.tick,
          approvedBy: agentId,
        };
        this.world.gazettes.push(g);
        this.emit('gazette.published', [agentId], `📰 La Gazette du jour ${g.day} paraît : « ${g.headline} »`, { gazette: g });
        this.daily.payGazette(this);
        this.broadcast({ type: 'patch', world: { gazettes: this.world.gazettes } });
        break;
      }
      case 'opinion':
        this.adjustOpinion(agentId, a.about, a.delta, a.reason);
        break;
      case 'go': {
        const nature = ['place', 'foret', 'riviere'].includes(a.place);
        const target = nature ? a.place : this.agent(a.place)?.houseId;
        if (!target || me.location?.kind === 'walking') break;
        if (!this.daily.trip(this, me, target, nature ? 'promenade' : 'visite', 1.5)) {
          this.emit('agent.thought', [agentId], `💭 ${me.name} : Aucune route ouverte pour y aller…`, { text: 'Aucune route ouverte pour y aller…' });
        }
        break;
      }
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
   * Envoie un message à `to` : le messager suit le plus court itinéraire par les routes, pont compris,
   * jusqu'à la porte du destinataire. Sans itinéraire : message perdu.
   */
  send(from: AgentId, to: AgentId, kind: MessageKind, body: string, opts: { replyTo?: string; ballot?: Ballot } = {}) {
    const sender = this.agent(from);
    const target = this.agent(to);
    if (!sender || !target) return null;
    // Même toit (soi-même, ou parent et enfant) : pas besoin de messager.
    if (from === to || sender.houseId === target.houseId) return this.sendInHouse(from, to, kind, body, opts.ballot);
    const path = route(this.world, sender.houseId, target.houseId);
    if (!path || !path.roads.length) {
      this.emit('message.lost', [from, to], `🚫 ${sender.name} ne peut pas joindre ${target.name} : aucune route.`, { kind, body });
      return null;
    }
    const msg: Message = {
      id: `m${this.nextMsgId++}`,
      from,
      to,
      route: path.roads,
      leg: 0,
      roadId: path.roads[0],
      legFrom: sender.houseId,
      kind,
      body,
      replyTo: opts.replyTo,
      ballot: opts.ballot,
      createdTick: this.clock.tick,
      progress: 0,
      speed: kind === 'ballot' ? WALK_SPEED * BALLOT_SPEEDUP : GAZETTE_KINDS.includes(kind) ? WALK_SPEED * GAZETTE_SPEEDUP : WALK_SPEED,
      status: 'walking',
    };
    this.world.messages[msg.id] = msg;
    this.emit('message.sent', [from, to], `${sender.name} → ${target.name} : « ${body} »`, {
      messageId: msg.id, kind, body, route: msg.route, roadId: msg.roadId, speed: msg.speed,
    });
    return msg;
  }

  private advanceMessages() {
    for (const msg of Object.values(this.world.messages)) {
      // L'expéditeur ou le destinataire a quitté le village : la lettre se perd.
      if ([msg.from, msg.to].some((id) => !this.agent(id))) {
        delete this.world.messages[msg.id];
        continue;
      }
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
      if (msg.progress < 1) continue;
      if (msg.leg < msg.route.length - 1) {
        // Étape suivante : on repart du bout de la route qu'on vient de parcourir.
        msg.legFrom = road.a === msg.legFrom ? road.b : road.a;
        msg.leg++;
        msg.roadId = msg.route[msg.leg];
        msg.progress = 0;
      } else this.deliver(msg);
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
    this.receive(msg);
  }

  /** Le dossier de la gazette se remplit quand le sujet, le brouillon, la correction ou l'avis arrivent. */
  private fileGazette(msg: Message) {
    const d = (this.world.gazetteDraft ??= { day: this.clock.day });
    const by = msg.origin ?? msg.from;
    if (msg.kind === 'topic') Object.assign(d, { topic: msg.body.replace(/^Sujet\s*:\s*/i, ''), topicBy: by });
    if (msg.kind === 'draft') Object.assign(d, { draft: msg.body, draftBy: by });
    if (msg.kind === 'edit') Object.assign(d, { edited: msg.body.replace(/^Version corrigée\s*:\s*/i, ''), editedBy: by });
    // L'avis ne compte que s'il vient du lecteur (ou, faute de lecteur, de quelqu'un d'autre que le maire).
    const hasReader = Object.values(this.world.agents).some((a) => a.role === 'LECTEUR');
    const fromReader = hasReader ? this.agent(by)?.role === 'LECTEUR' : by !== this.world.mayorId;
    if (msg.kind === 'review' && fromReader) {
      const raw = msg.body.match(/(\d+(?:[.,]\d+)?)\s*(?:\/|sur)\s*5\b/)?.[1];
      const score = raw ? Math.min(5, Number(raw.replace(',', '.'))) : 3;
      d.review = { by, score, text: msg.body };
    }
    if (['topic', 'draft', 'edit', 'review'].includes(msg.kind)) this.broadcast({ type: 'patch', world: { gazetteDraft: d } });
  }

  private receive(msg: Message) {
    this.fileGazette(msg);
    if (msg.kind === 'ballot') this.politics.receive(this, msg);
    else this.brain.onMessage(this, this.agent(msg.to), msg);
  }

  /**
   * Message sans messager : à soi-même (un agent qui cumule deux rôles, ex. maire et éclaireur)
   * ou à quelqu'un qui vit sous le même toit.
   */
  private sendInHouse(from: AgentId, to: AgentId, kind: MessageKind, body: string, ballot?: Ballot) {
    const msg: Message = {
      id: `m${this.nextMsgId++}`, from, to, route: [], leg: 0, roadId: '', legFrom: this.agent(from).houseId, kind, body, ballot,
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
      case 'god.reset':
        this.reset(c.preset);
        return;
      case 'god.opinion':
        this.adjustOpinion(c.who, c.about, c.delta, c.delta < 0 ? 'Une petite voix me souffle de m’en méfier…' : 'Une petite voix me dit de lui faire confiance.');
        break;
    }
    this.flush();
  }

  /** Branché par index.ts pour changer de fournisseur LLM en direct. */
  onLLMConfig?: (c: Extract<ClientToServer, { type: 'llm.config' }>) => void;

  /**
   * Histoire vierge : village de départ (complet ou d'origine), jour 1 à 6 h, journal neuf.
   * Le choix de l'IA et ses garde-fous sont conservés ; les compteurs repartent à zéro.
   */
  reset(preset: VillagePreset) {
    const fresh = createSeedWorld(preset);
    const llm = this.world.llm;
    const voteEveryDays = this.world.voteEveryDays;
    const speed = this.clock.speed;
    for (const k of Object.keys(this.world)) delete (this.world as unknown as Record<string, unknown>)[k];
    Object.assign(this.world, fresh, {
      voteEveryDays,
      llm: { ...llm, budget: { ...llm.budget, callsToday: 0, tokensIn: 0, tokensOut: 0 } },
    });
    this.clock.speed = speed;
    this.pending.length = 0;
    this.outbox = [];
    this.nextMsgId = 1;
    this.politics = new Politics();
    this.life = new Life();
    this.daily = new Daily();
    this.economy = new Economy();
    this.journal.restart();
    clearNews();
    buildNetwork(this, { silent: true });
    this.broadcast({ type: 'snapshot', world: this.world, events: [] });
    this.emit('god.inject', [], preset === 'origine'
      ? '🔄 Nouvelle histoire : le hameau d’origine, ses cinq habitants et sa gazette.'
      : '🔄 Nouvelle histoire : le village au complet.', { reset: preset });
    // Le journal repart de zéro : on y note quel cerveau anime les agents.
    this.emit('llm.config', [], `🧠 Cerveau des agents : ${llm.provider === 'mock' ? 'gratuit (réponses scriptées)' : `${llm.provider} · ${llm.model ?? '?'}`}.`, {
      provider: llm.provider, model: llm.model, ok: true,
    });
    this.startDay();
    this.flush();
  }

  broadcastPatch(world: Partial<WorldState>) {
    this.broadcast({ type: 'patch', world });
  }
}

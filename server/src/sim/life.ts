import { env } from '../env';
import { attracted, isDwelling, mulberry32, randomOrientation, ROLE_LABEL, type Agent, type AgentId, type Role } from '@hameau/shared';
import type { Sim } from './Sim';
import { connectNode, neighbors } from './network';
import { newHouse, slug } from './god';
import { WAGES } from './economyConfig';

// Vie du village : le monde évolue tout seul, chaque soir, selon les relations entre habitants.
// Règles simples et gratuites (aucun appel LLM) ; les agents en sont informés par leur mémoire.

const MAX_POPULATION = Number(env.MAX_POPULATION ?? 50);
const COUPLE_OPINION = 0.4;       // estime mutuelle minimale pour se mettre en couple…
const COUPLE_DAYS = 2;            // …pendant ce nombre de soirs d'affilée
const SPLIT_OPINION = 0.05;       // en dessous, le couple se sépare
const BIRTH_AFTER_DAYS = 4;       // ancienneté du couple avant un premier enfant
const BIRTH_CHANCE = 0.15;
const ADULT_AFTER_DAYS = 7;       // un enfant construit sa maison au bout de ces jours
const NEWCOMER_CHANCE = 0.3;
const LEAVE_CHANCE = 0.3;

const NAMES = [
  'Léa', 'Hugo', 'Jade', 'Nathan', 'Chloé', 'Lucas', 'Emma', 'Tom', 'Zoé', 'Noah', 'Sacha', 'Lina', 'Gabin', 'Rose', 'Malo', 'Nina', 'Théo', 'Alba',
  'Camille', 'Louis', 'Inès', 'Jules', 'Manon', 'Arthur', 'Lou', 'Paul', 'Margaux', 'Victor', 'Alice', 'Raphaël', 'Elsa', 'Adam', 'Iris', 'Martin',
  'Louise', 'Simon', 'Anna', 'Basile', 'Clara', 'Émile', 'Juliette', 'Léon', 'Maëlle', 'Oscar', 'Agathe', 'Marius', 'Romane', 'Félix', 'Mila', 'Gaspard',
  'Capucine', 'Augustin', 'Suzanne', 'Barnabé', 'Héloïse', 'Lazare', 'Apolline', 'Célestin', 'Éloïse', 'Achille', 'Margot', 'Aimé', 'Bérénice', 'Ernest',
  'Colette', 'Firmin', 'Odile', 'Gaston', 'Mathilde', 'Hector', 'Blanche', 'Ambroise', 'Jeanne', 'Clovis', 'Lucie', 'Anatole', 'Adèle', 'Eugène',
  'Constance', 'Fernand', 'Albane', 'Octave', 'Philippine', 'Valentin', 'Sixtine', 'Edgar', 'Garance', 'Honoré', 'Ysée', 'Joseph', 'Aurore', 'Bastien',
  'Céleste', 'Dorian', 'Fleur', 'Gauthier', 'Hortense', 'Ilan', 'Joséphine', 'Kylian', 'Livia', 'Mathis', 'Noémie', 'Pierre', 'Salomé', 'Tristan',
  'Ange', 'Charlie', 'Morgan', 'Alix', 'Eden', 'Maxime', 'Andréa', 'Dominique', 'Claude', 'Lou-Ann', 'Noa', 'Sasha', 'Yaël', 'Élie', 'Swann',
];
const TRAITS = ['rêveur', 'têtu', 'généreux', 'jaloux', 'drôle', 'anxieux', 'rusé', 'tendre', 'bavard', 'secret', 'courageux', 'paresseux'];

/** Où bâtir une maison neuve : près d'un lieu de travail qui embauche (les quartiers se forment), sinon près de la place. */
function homeSite(sim: Sim) {
  const w = sim.world;
  const hiring = Object.values(w.workplaces).filter((wp) => wp.workers.length < wp.slots).sort((x, y) => WAGES[y.kind] - WAGES[x.kind])[0];
  return (hiring && w.houses[hiring.houseId]?.position) ?? w.terrain.plaza.center;
}

const pairKey = (a: AgentId, b: AgentId) => [a, b].sort().join('|');
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export class Life {
  private readonly rand = mulberry32(Date.now() ^ 0x9e3779b9);
  /** Soirs consécutifs d'estime mutuelle forte, par paire. */
  private affinity = new Map<string, number>();
  /** Jour de formation des couples. */
  private coupledSince = new Map<string, number>();
  private isolatedDays = new Map<AgentId, number>();
  /** Tous les prénoms déjà portés au village, même par ceux qui sont partis : jamais deux fois le même. */
  private usedNames = new Set<string>();

  onDayEnd(sim: Sim) {
    this.couples(sim);
    this.births(sim);
    this.comingOfAge(sim);
    this.fillGazette(sim);
    this.departures(sim);
    this.newcomers(sim);
  }

  private pick<T>(xs: T[]): T {
    return xs[Math.floor(this.rand() * xs.length)];
  }

  /** Un prénom que personne n'a jamais porté ici ; si la liste est épuisée, un prénom composé. */
  private freshName(sim: Sim): string {
    for (const a of Object.values(sim.world.agents)) this.usedNames.add(a.name);
    const free = NAMES.filter((n) => !this.usedNames.has(n));
    let name = free.length ? this.pick(free) : '';
    while (!name || this.usedNames.has(name)) name = `${this.pick(NAMES)}-${this.pick(NAMES)}`;
    this.usedNames.add(name);
    return name;
  }

  private remember(a: Agent, line: string) {
    a.memory.long = [a.memory.long, line].filter(Boolean).join(' ').slice(-600);
  }

  private family(a: Agent) {
    a.family ??= { parentIds: [], childIds: [] };
    return a.family;
  }

  // ─── Couples ──────────────────────────────────────────────────────────────

  private couples(sim: Sim) {
    const w = sim.world;
    const list = Object.values(w.agents).filter((a) => !this.isChild(sim, a));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [list[i], list[j]];
        const k = pairKey(a.id, b.id);
        const together = a.family?.partnerId === b.id;
        const mutual = Math.min(a.opinions[b.id] ?? 0, b.opinions[a.id] ?? 0);
        if (together) {
          if (mutual < SPLIT_OPINION) this.split(sim, a, b);
          continue;
        }
        if (a.family?.partnerId || b.family?.partnerId || this.related(a, b)) continue;
        if (!attracted(a, b) || !attracted(b, a)) continue;
        const streak = mutual >= COUPLE_OPINION ? (this.affinity.get(k) ?? 0) + 1 : 0;
        this.affinity.set(k, streak);
        if (streak >= COUPLE_DAYS) this.pair(sim, a, b);
      }
    }
  }

  private related(a: Agent, b: Agent) {
    const fa = a.family;
    const fb = b.family;
    return !!(fa?.parentIds.includes(b.id) || fb?.parentIds.includes(a.id) || fa?.parentIds.some((p) => fb?.parentIds.includes(p)));
  }

  private pair(sim: Sim, a: Agent, b: Agent) {
    this.family(a).partnerId = b.id;
    this.family(b).partnerId = a.id;
    this.coupledSince.set(pairKey(a.id, b.id), sim.clock.day);
    this.affinity.delete(pairKey(a.id, b.id));
    sim.emit('couple.formed', [a.id, b.id], `💞 ${a.name} et ${b.name} forment un couple !`);
    sim.daily.scheduleParty(sim, `on célèbre le couple de ${a.name} et ${b.name}`);
    this.remember(a, `J${sim.clock.day} : je suis en couple avec ${b.name}.`);
    this.remember(b, `J${sim.clock.day} : je suis en couple avec ${a.name}.`);
    sim.touchAgents();
  }

  private split(sim: Sim, a: Agent, b: Agent) {
    delete this.family(a).partnerId;
    delete this.family(b).partnerId;
    this.coupledSince.delete(pairKey(a.id, b.id));
    sim.emit('couple.split', [a.id, b.id], `💔 ${a.name} et ${b.name} se séparent.`);
    this.remember(a, `J${sim.clock.day} : rupture avec ${b.name}.`);
    this.remember(b, `J${sim.clock.day} : rupture avec ${a.name}.`);
    sim.adjustOpinion(a.id, b.id, -0.2);
    sim.adjustOpinion(b.id, a.id, -0.2);
    sim.touchAgents();
  }

  // ─── Naissances et passage à l'âge adulte ─────────────────────────────────

  private isChild(sim: Sim, a: Agent) {
    return !!a.family?.parentIds.length && a.bornDay !== undefined && sim.clock.day - a.bornDay < ADULT_AFTER_DAYS;
  }

  private births(sim: Sim) {
    const w = sim.world;
    for (const [k, since] of this.coupledSince) {
      if (Object.keys(w.agents).length >= MAX_POPULATION) return;
      const [a, b] = k.split('|').map((id) => w.agents[id]);
      if (!a || !b || sim.clock.day - since < BIRTH_AFTER_DAYS || this.rand() > BIRTH_CHANCE) continue;
      if (this.family(a).childIds.some((c) => w.agents[c] && this.isChild(sim, w.agents[c]))) continue; // un enfant à la fois
      this.birth(sim, a, b);
    }
  }

  private birth(sim: Sim, a: Agent, b: Agent) {
    const w = sim.world;
    const name = this.freshName(sim);
    const id = slug(sim, name);
    const inherited = [...a.personality.traits, ...b.personality.traits].filter(() => this.rand() < 0.35).slice(0, 2);
    const child: Agent = {
      id, name, role: 'CITOYEN', houseId: a.houseId,
      personality: {
        traits: [...new Set([...inherited, this.pick(TRAITS)])],
        tone: this.pick([a.personality.tone, b.personality.tone]),
        honesty: clamp01((a.personality.honesty + b.personality.honesty) / 2 + (this.rand() - 0.5) * 0.3),
        ambition: clamp01((a.personality.ambition + b.personality.ambition) / 2 + (this.rand() - 0.5) * 0.4),
      },
      goals: ['Grandir et trouver sa place au village', `Rendre fiers ${a.name} et ${b.name}`],
      memory: { short: [], long: `Je suis l’enfant de ${a.name} et ${b.name}.` },
      opinions: {},
      inbox: [],
      activity: 'idle',
      lastActionTick: sim.clock.tick,
      bornDay: sim.clock.day,
      family: { parentIds: [a.id, b.id], childIds: [] },
      sex: this.rand() < 0.5 ? 'M' : 'F',
      orientation: randomOrientation(this.rand()),
    };
    for (const other of Object.values(w.agents)) {
      const parent = other.id === a.id || other.id === b.id;
      child.opinions[other.id] = parent ? 0.6 : 0;
      other.opinions[id] = parent ? 0.7 : 0.1;
    }
    w.agents[id] = child;
    this.family(a).childIds.push(id);
    this.family(b).childIds.push(id);
    // Un couple de même sexe adopte ; sinon, c'est une naissance.
    const adopted = !!a.sex && a.sex === b.sex;
    sim.emit('agent.born', [id, a.id, b.id], adopted
      ? `🏡 ${a.name} et ${b.name} adoptent ${name} !`
      : `👶 Naissance de ${name} chez ${a.name} et ${b.name} !`, { agentId: id, agent: child, adopted });
    sim.daily.scheduleParty(sim, `on fête la naissance de ${name}`);
    sim.touchAgents();
  }

  /** Un poste de la gazette reste vide (bannissement, départ) ? Un habitant sans métier s'y propose. */
  private fillGazette(sim: Sim) {
    const w = sim.world;
    for (const role of ['ECLAIREUR', 'ECRIVAIN', 'EDITEUR', 'LECTEUR'] as Role[]) {
      if (Object.values(w.agents).some((x) => x.role === role)) continue;
      const free = Object.values(w.agents).filter((x) => x.role === 'CITOYEN' && w.houses[x.houseId]?.ownerId === x.id);
      const who = free.sort((x, y) => (y.opinions[w.mayorId] ?? 0) - (x.opinions[w.mayorId] ?? 0))[0];
      if (!who) continue;
      who.role = role;
      sim.emit('life.work', [who.id], `📰 La gazette manquait de bras : ${who.name} devient ${ROLE_LABEL[role].toLowerCase()}.`, { work: 'role', agentId: who.id, role });
      this.remember(who, `J${sim.clock.day} : je travaille désormais pour la gazette.`);
      sim.touchAgents();
    }
  }

  private comingOfAge(sim: Sim) {
    const w = sim.world;
    for (const a of Object.values(w.agents)) {
      if (!a.family?.parentIds.length || a.bornDay === undefined) continue;
      const home = w.houses[a.houseId];
      if (sim.clock.day - a.bornDay < ADULT_AFTER_DAYS || home?.ownerId === a.id) continue;
      // Un métier vacant dans la gazette ? L'enfant le reprend.
      const vacant = (['ECLAIREUR', 'ECRIVAIN', 'EDITEUR', 'LECTEUR'] as Role[]).find((r) => !Object.values(w.agents).some((x) => x.role === r));
      // Le métier (le travail) se trouve ensuite à l'embauche ; le rôle sert à la gazette.
      const role: Role = vacant ?? 'CITOYEN';
      const house = newHouse(sim, a.id, homeSite(sim), role);
      if (!house) continue;
      w.houses[house.id] = house;
      a.houseId = house.id;
      a.role = role;
      sim.emit('house.built', [a.id], `🏠 ${a.name} est adulte et construit sa maison${role !== 'CITOYEN' ? ` — nouveau métier : ${ROLE_LABEL[role].toLowerCase()}` : ''} !`, { agentId: a.id, house });
      this.remember(a, `J${sim.clock.day} : j’ai construit ma propre maison.`);
      sim.broadcastPatch({ houses: w.houses });
      sim.touchAgents();
      connectNode(sim, house.id);
    }
  }

  // ─── Départs et arrivées ──────────────────────────────────────────────────

  private departures(sim: Sim) {
    const w = sim.world;
    if (Object.keys(w.agents).length <= 4) return;
    for (const a of Object.values(w.agents)) {
      const isolated = neighbors(w, a.id).length === 0 && !Object.values(w.agents).some((x) => x.id !== a.id && x.houseId === a.houseId);
      const days = isolated ? (this.isolatedDays.get(a.id) ?? 0) + 1 : 0;
      this.isolatedDays.set(a.id, days);
      const others = Object.values(w.agents).filter((x) => x.id !== a.id);
      const welcome = others.reduce((s, x) => s + (x.opinions[a.id] ?? 0), 0) / Math.max(1, others.length);
      const unhappy = days >= 2 || welcome < -0.4;
      if (!unhappy || a.id === w.mayorId || this.rand() > LEAVE_CHANCE) continue;
      delete w.agents[a.id];
      const house = w.houses[a.houseId];
      if (house?.ownerId === a.id) house.ownerId = null;
      for (const o of Object.values(w.agents)) {
        delete o.opinions[a.id];
        if (o.family?.partnerId === a.id) delete o.family.partnerId;
      }
      sim.emit('agent.left', [a.id], `🧳 ${a.name} quitte le village${days >= 2 ? ', faute de route pour rejoindre les autres' : ', faute d’amis ici'}.`, { agentId: a.id });
      sim.broadcastPatch({ houses: w.houses });
      sim.touchAgents();
      return; // un départ par soir au plus
    }
  }

  private newcomers(sim: Sim) {
    const w = sim.world;
    if (Object.keys(w.agents).length >= MAX_POPULATION || this.rand() > NEWCOMER_CHANCE) return;
    const name = this.freshName(sim);
    const id = slug(sim, name);
    const r = this.rand();
    const role: Role = r < 0.12 ? 'MENTEUR' : r < 0.24 ? 'VOLEUR' : 'CITOYEN';
    const empty = Object.values(w.houses).find((h) => !h.ownerId && isDwelling(h));
    const house = empty ?? newHouse(sim, id, homeSite(sim), role);
    if (!house) return;
    house.ownerId = id;
    w.houses[house.id] = house;
    const agent: Agent = {
      id, name, role, houseId: house.id,
      personality: {
        traits: [this.pick(TRAITS), this.pick(TRAITS)],
        tone: role === 'MENTEUR' ? 'mielleux, plein de sous-entendus' : 'curieux, un peu timide',
        honesty: role === 'MENTEUR' || role === 'VOLEUR' ? 0.15 : 0.3 + this.rand() * 0.6,
        ambition: this.rand(),
      },
      goals: role === 'MENTEUR' ? ['Semer la zizanie sans se faire prendre'] : ['Se faire accepter au village'],
      sex: this.rand() < 0.5 ? 'M' : 'F',
      orientation: randomOrientation(this.rand()),
      memory: { short: [], long: '' },
      opinions: {},
      inbox: [],
      activity: 'idle',
      lastActionTick: sim.clock.tick,
      bornDay: sim.clock.day,
    };
    for (const o of Object.values(w.agents)) {
      agent.opinions[o.id] = 0;
      o.opinions[id] = -0.05; // on se méfie un peu des étrangers
    }
    w.agents[id] = agent;
    const where = empty ? `reprend la maison vide` : `s’installe dans une maison neuve`;
    sim.emit('agent.added', [id], `🚶 Quelqu’un de nouveau au village : ${name} ${where}.`, { agentId: id, role, agent, house });
    sim.broadcastPatch({ houses: w.houses });
    sim.touchAgents();
    if (!empty) connectNode(sim, house.id);
  }
}

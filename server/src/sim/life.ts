import { env } from '../env';
import { ageOf, attracted, de, isDwelling, lifespanOf, mulberry32, randomOrientation, ROLE_LABEL, type Agent, type AgentId, type Role, type WorldState } from '@hameau/shared';
import type { Sim } from './Sim';
import { connectNode, neighbors } from './network';
import { newHouse, slug } from './god';
import { NAMES_BY_SEX } from '@hameau/shared';
import { WAGES } from './economyConfig';
import { isAdult } from './economy';

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
/** Sans travail et sans le sou ce nombre de soirs d'affilée : on part tenter sa chance ailleurs. */
const BROKE_LEAVE_DAYS = 2;
const BROKE_LEAVE_CHANCE = 0.5;
/** « Sans le sou » : moins que le prix de quelques pains… */
const BROKE_PIECES = 3;
/** …ou, dans un village presque plein où le travail manque, trop peu pour voir venir. */
const CROWDED = 0.8;
const CROWDED_BROKE_PIECES = 12;
/** Le ventre vide (satiété sous ce seuil) ce nombre de soirs d'affilée : on part aussi. */
const HUNGRY_BELOW = 0.2;
const HUNGRY_LEAVE_DAYS = 2;
/** Arrivé au bout de sa vie, chaque soir, cette chance de s'éteindre. */
const DEATH_CHANCE = 0.35;
/** Les esprits voyageurs partent parfois voir le monde, même quand tout va bien. */
const WANDER_CHANCE = 0.004;
const WANDER_MIN_POP = 20;
const WANDERERS = /r[eê]veur|ambitieux|curieux|courageux/;
/** La rancune s'efface d'elle-même, un peu chaque soir… */
const GRUDGE_BELOW = -0.3;
const GRUDGE_HEAL = 0.01;
/** …et parfois deux ennemis se réconcilient d'un coup. */
const RECONCILE_CHANCE = 0.15;

const TRAITS = ['rêveur', 'têtu', 'généreux', 'jaloux', 'drôle', 'anxieux', 'rusé', 'tendre', 'bavard', 'secret', 'courageux', 'paresseux'];

/** Où bâtir une maison neuve : près d'un lieu de travail qui embauche (les quartiers se forment), sinon près de la place. */
function homeSite(sim: Sim) {
  const w = sim.world;
  const hiring = Object.values(w.workplaces).filter((wp) => wp.workers.length < wp.slots).sort((x, y) => WAGES[y.kind] - WAGES[x.kind])[0];
  return (hiring && w.houses[hiring.houseId]?.position) ?? w.terrain.plaza.center;
}

const pairKey = (a: AgentId, b: AgentId) => [a, b].sort().join('|');
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Ceux que ces départs rendent tristes : la famille et les proches qui restent. */
export function mourners(w: WorldState, leaving: Agent[]): AgentId[] {
  const ids = new Set(leaving.map((a) => a.id));
  return Object.values(w.agents)
    .filter((o) => !ids.has(o.id))
    .filter((o) => leaving.some((a) => (o.opinions[a.id] ?? 0) > 0.35 || o.family?.partnerId === a.id || o.family?.parentIds.includes(a.id) || o.family?.childIds.includes(a.id)))
    .map((o) => o.id);
}

export class Life {
  private readonly rand = mulberry32(Date.now() ^ 0x9e3779b9);
  /** Soirs consécutifs d'estime mutuelle forte, par paire. */
  private affinity = new Map<string, number>();
  /** Jour de formation des couples. */
  private coupledSince = new Map<string, number>();
  private isolatedDays = new Map<AgentId, number>();
  /** Soirs d'affilée sans travail ni argent, par habitant. */
  private brokeDays = new Map<AgentId, number>();
  /** Soirs d'affilée le ventre vide, par habitant. */
  private hungryDays = new Map<AgentId, number>();
  /** Tous les prénoms déjà portés au village, même par ceux qui sont partis : jamais deux fois le même. */
  private usedNames = new Set<string>();

  onDayEnd(sim: Sim) {
    this.couples(sim);
    this.births(sim);
    this.comingOfAge(sim);
    this.oldAge(sim);
    this.fillGazette(sim);
    this.healGrudges(sim);
    this.departures(sim);
    this.wanderlust(sim);
    this.newcomers(sim);
  }

  // ─── Le temps qui passe ───────────────────────────────────────────────────

  /** Au bout de sa vie, un ancien s'éteint paisiblement (un par soir au plus). */
  private oldAge(sim: Sim) {
    const w = sim.world;
    if (Object.keys(w.agents).length <= 4) return;
    for (const a of Object.values(w.agents)) {
      if (ageOf(a, sim.clock.day) < lifespanOf(a) || this.rand() > DEATH_CHANCE) continue;
      this.die(sim, a);
      return;
    }
  }

  /** Un décès : héritage, commerces et maison transmis, obsèques le lendemain sur la place. */
  die(sim: Sim, a: Agent) {
    const w = sim.world;
    const age = ageOf(a, sim.clock.day);
    const partner = a.family?.partnerId ? w.agents[a.family.partnerId] : undefined;
    const kids = (a.family?.childIds ?? []).map((id) => w.agents[id]).filter((k): k is Agent => !!k);
    const heirs = partner ? [partner] : kids;
    const purse = a.inventory?.pieces ?? 0;
    const inv = (x: Agent) => (x.inventory ??= { pain: 1, bois: 1, outils: 0, pieces: 5 });
    if (heirs.length) for (const h of heirs) inv(h).pieces += Math.floor(purse / heirs.length);
    else {
      const shop = Object.values(w.workplaces).sort((x, y) => x.till - y.till)[0];
      if (shop) shop.till += purse;
    }
    const heir = partner ?? kids.find((k) => isAdult(w, k));
    for (const wp of Object.values(w.workplaces)) if (wp.ownerId === a.id) wp.ownerId = heir?.id ?? null;
    const house = w.houses[a.houseId];
    const stays = Object.values(w.agents).find((x) => x.id !== a.id && x.houseId === a.houseId && isAdult(w, x));
    const sad = mourners(w, [a]);
    const wasMayor = w.mayorId === a.id;
    this.leave(sim, a);
    if (house && !house.ownerId && stays) house.ownerId = stays.id;
    const gone = a.sex === 'F' ? 'éteinte' : 'éteint';
    const legacy = heirs.length && purse ? ` ${heirs.map((h) => h.name).join(' et ')} hérite${heirs.length > 1 ? 'nt' : ''} de ses économies.` : '';
    sim.emit('agent.died', [a.id, ...heirs.map((h) => h.id)], `🕊 ${a.name} s’est ${gone} paisiblement, à ${age} jours.${legacy}`, { agentId: a.id, age, sad });
    if (wasMayor) {
      const esteem = (id: AgentId) => Object.values(w.agents).reduce((s, x) => s + (x.opinions[id] ?? 0), 0);
      const next = Object.values(w.agents).filter((x) => isAdult(w, x)).sort((x, y) => esteem(y.id) - esteem(x.id))[0];
      if (next) {
        w.mayorId = next.id;
        sim.politics.succeed(sim);
        sim.emit('mayor.elected', [next.id], `👑 ${next.name} reprend l’écharpe ${de(a.name)}.`);
      }
    }
    sim.daily.scheduleParty(sim, `on dit adieu à ${a.name}`, 'obseques');
    sim.broadcastPatch({ houses: w.houses, workplaces: w.workplaces, mayorId: w.mayorId });
    sim.touchAgents();
  }

  /** La rancune s'use avec le temps ; de loin en loin, deux ennemis enterrent la hache de guerre. */
  private healGrudges(sim: Sim) {
    const w = sim.world;
    const feuds: [Agent, Agent][] = [];
    for (const a of Object.values(w.agents)) {
      for (const [id, op] of Object.entries(a.opinions)) {
        if (op >= GRUDGE_BELOW) continue;
        a.opinions[id] = op + GRUDGE_HEAL;
        const b = w.agents[id];
        if (b && a.id < b.id && (b.opinions[a.id] ?? 0) < GRUDGE_BELOW) feuds.push([a, b]);
      }
    }
    if (!feuds.length || this.rand() > RECONCILE_CHANCE) return;
    const [a, b] = this.pick(feuds);
    a.opinions[b.id] = 0.1;
    b.opinions[a.id] = 0.1;
    sim.emit('life.reconcile', [a.id, b.id], `🤝 ${a.name} et ${b.name} enterrent la hache de guerre.`);
    sim.touchAgents();
  }

  /** Un esprit voyageur, libre de toute attache, part parfois voir le monde. */
  private wanderlust(sim: Sim) {
    const w = sim.world;
    if (Object.keys(w.agents).length < WANDER_MIN_POP) return;
    for (const a of Object.values(w.agents)) {
      if (a.id === w.mayorId || a.family?.partnerId || !isAdult(w, a) || !WANDERERS.test(a.personality.traits.join(' '))) continue;
      if ((a.family?.childIds ?? []).some((k) => w.agents[k] && !isAdult(w, w.agents[k]))) continue;
      if (this.rand() > WANDER_CHANCE) continue;
      const sad = mourners(w, [a]);
      this.leave(sim, a);
      sim.emit('agent.left', [a.id], `🎒 ${a.name} a des fourmis dans les jambes : départ pour voir le monde !`, { agentId: a.id, wander: true, sad });
      sim.broadcastPatch({ houses: w.houses });
      sim.touchAgents();
      return;
    }
  }

  private pick<T>(xs: T[]): T {
    return xs[Math.floor(this.rand() * xs.length)];
  }

  /** Un prénom qui va avec le sexe et que personne n'a jamais porté ici ; si la liste est épuisée, un prénom composé. */
  private freshName(sim: Sim, sex: 'M' | 'F'): string {
    for (const a of Object.values(sim.world.agents)) this.usedNames.add(a.name);
    const pool = [...NAMES_BY_SEX[sex], ...NAMES_BY_SEX.X];
    const free = pool.filter((n) => !this.usedNames.has(n));
    let name = free.length ? this.pick(free) : '';
    while (!name || this.usedNames.has(name)) name = `${this.pick(NAMES_BY_SEX[sex])}-${this.pick(pool)}`;
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

  /** Un coup de foudre possible entre ces deux-là ? (libres, pas de la même famille, attirance réciproque) */
  canFallInLove(a: Agent, b: Agent) {
    return a.id !== b.id && !a.family?.partnerId && !b.family?.partnerId && !this.related(a, b) && attracted(a, b) && attracted(b, a);
  }

  pair(sim: Sim, a: Agent, b: Agent) {
    this.family(a).partnerId = b.id;
    this.family(b).partnerId = a.id;
    this.coupledSince.set(pairKey(a.id, b.id), sim.clock.day);
    this.affinity.delete(pairKey(a.id, b.id));
    sim.emit('couple.formed', [a.id, b.id], `💞 ${a.name} et ${b.name} forment un couple !`);
    sim.daily.scheduleParty(sim, `on célèbre le couple de ${a.name} et ${b.name}`, 'mariage', [a.id, b.id]);
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
    const sex = this.rand() < 0.5 ? 'M' : 'F';
    const name = this.freshName(sim, sex);
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
      sex,
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
    sim.daily.scheduleParty(sim, `on fête la naissance de ${name}`, 'bapteme', [id]);
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
    this.brokeDepartures(sim);
    if (Object.keys(w.agents).length <= 4) return;
    for (const a of Object.values(w.agents)) {
      const isolated = neighbors(w, a.id).length === 0 && !Object.values(w.agents).some((x) => x.id !== a.id && x.houseId === a.houseId);
      const days = isolated ? (this.isolatedDays.get(a.id) ?? 0) + 1 : 0;
      this.isolatedDays.set(a.id, days);
      const others = Object.values(w.agents).filter((x) => x.id !== a.id);
      const welcome = others.reduce((s, x) => s + (x.opinions[a.id] ?? 0), 0) / Math.max(1, others.length);
      const unhappy = days >= 2 || welcome < -0.4;
      if (!unhappy || a.id === w.mayorId || this.rand() > LEAVE_CHANCE) continue;
      const sad = mourners(w, [a]);
      delete w.agents[a.id];
      const house = w.houses[a.houseId];
      if (house?.ownerId === a.id) house.ownerId = null;
      for (const o of Object.values(w.agents)) {
        delete o.opinions[a.id];
        if (o.family?.partnerId === a.id) delete o.family.partnerId;
      }
      sim.emit('agent.left', [a.id], `🧳 ${a.name} quitte le village${days >= 2 ? ', faute de route pour rejoindre les autres' : ', faute d’amis ici'}.`, { agentId: a.id, sad });
      sim.broadcastPatch({ houses: w.houses });
      sim.touchAgents();
      return; // un départ par soir au plus
    }
  }

  /**
   * Plus un sou et pas de travail depuis quelques soirs : on fait son baluchon. Les célibataires sans enfant
   * à charge partent seuls ; un couple part ensemble si les deux sont fauchés. Au plus un foyer par soir.
   */
  private brokeDepartures(sim: Sim) {
    const w = sim.world;
    const crowded = Object.keys(w.agents).length >= MAX_POPULATION * CROWDED;
    const limit = crowded ? CROWDED_BROKE_PIECES : BROKE_PIECES;
    const broke = (a: Agent) => isAdult(w, a) && !a.job && (a.inventory?.pieces ?? 0) < limit;
    const hungry = (a: Agent) => isAdult(w, a) && (a.needs?.satiete ?? 1) < HUNGRY_BELOW;
    for (const a of Object.values(w.agents)) {
      this.brokeDays.set(a.id, broke(a) ? (this.brokeDays.get(a.id) ?? 0) + 1 : 0);
      this.hungryDays.set(a.id, hungry(a) ? (this.hungryDays.get(a.id) ?? 0) + 1 : 0);
    }
    for (const m of [this.brokeDays, this.hungryDays]) for (const id of [...m.keys()]) if (!w.agents[id]) m.delete(id);
    const starving = (a: Agent) => (this.hungryDays.get(a.id) ?? 0) >= HUNGRY_LEAVE_DAYS;
    const struggling = (a: Agent) => (this.brokeDays.get(a.id) ?? 0) >= BROKE_LEAVE_DAYS || starving(a);
    for (const a of Object.values(w.agents)) {
      if (!struggling(a) || a.id === w.mayorId || this.rand() > BROKE_LEAVE_CHANCE) continue;
      const partner = a.family?.partnerId ? w.agents[a.family.partnerId] : undefined;
      if (partner && (!(broke(partner) || hungry(partner)) || partner.id === w.mayorId)) continue; // l'autre fait vivre le foyer
      const leaving = [a, ...(partner ? [partner] : [])];
      // Les enfants encore à la maison suivent leurs parents.
      const kids = leaving.flatMap((p) => p.family?.childIds ?? []).map((k) => w.agents[k]).filter((k): k is Agent => !!k && !isAdult(w, k));
      const all = [...new Set([...leaving, ...kids])];
      if (Object.keys(w.agents).length - all.length < 4) return;
      const sad = mourners(w, all);
      for (const x of all) this.leave(sim, x);
      const names = leaving.map((x) => x.name).join(' et ');
      const withKids = kids.length ? `, avec ${kids.length > 1 ? 'les enfants' : kids[0].name}` : '';
      const why = starving(a) ? 'Le ventre vide depuis des jours' : 'Plus un sou et pas de travail';
      sim.emit('agent.left', all.map((x) => x.id),
        `🧳 ${why} : ${names} ${leaving.length > 1 ? 'partent tenter leur' : 'part tenter sa'} chance ailleurs${withKids}.`, { agentId: a.id, broke: true, hungry: starving(a), sad });
      sim.broadcastPatch({ houses: w.houses });
      sim.touchAgents();
      return;
    }
  }

  /** Retire un habitant du village (sa maison se libère, on oublie ce qu'on pensait de lui). */
  private leave(sim: Sim, a: Agent) {
    const w = sim.world;
    delete w.agents[a.id];
    const house = w.houses[a.houseId];
    if (house?.ownerId === a.id) house.ownerId = null;
    for (const o of Object.values(w.agents)) {
      delete o.opinions[a.id];
      if (o.family?.partnerId === a.id) delete o.family.partnerId;
      if (o.lodging === a.houseId && !Object.values(w.agents).some((x) => x.houseId === a.houseId)) delete o.lodging;
    }
  }

  private newcomers(sim: Sim) {
    const w = sim.world;
    if (Object.keys(w.agents).length >= MAX_POPULATION || this.rand() > NEWCOMER_CHANCE) return;
    const sex = this.rand() < 0.5 ? 'M' : 'F';
    const name = this.freshName(sim, sex);
    const id = slug(sim, name);
    const r = this.rand();
    const role: Role = r < 0.12 ? 'MENTEUR' : r < 0.24 ? 'VOLEUR' : 'CITOYEN';
    const empty = Object.values(w.houses).find((h) => !h.ownerId && !h.ruined && isDwelling(h));
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
      sex,
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

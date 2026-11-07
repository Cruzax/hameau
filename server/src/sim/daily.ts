import {
  dayFraction,
  que,
  isNight,
  villageHour,
  type Agent,
  type AgentId,
  type Needs,
  type PlaceId,
  type Role,
  type TripPurpose,
  type EffectKind,
  type PartyKind,
  isElder,
  seasonOf,
} from '@hameau/shared';
import type { Sim } from './Sim';
import { isAdult, placeName as workplaceName } from './economy';
import { PRICES, WORK_HOURS } from './economyConfig';
import { homeOf } from './disasters';
import { mourners } from './life';
import { isActive } from './effects';
import { findPath } from './paths';
import { createRumor, hottestRumor, rumorToShare, SLANDERS, tellRumor } from './rumors';
import { Justice } from './justice';
import { chooseExchange, coldShoulder, MUSINGS } from '../content/dialogue';
import { CALENDAR, dayName, EVENTS, helpers, type VillageEvent } from '../content/events';
import { CRIER_EXTRAS, SONGS } from '../content/verses';

// Vie quotidienne : besoins, métiers, commerce, déplacements à pied, rencontres, fêtes, chansons.
// Tout est réglé par des règles simples et gratuites : aucun appel à l'IA ici.

const WALK_SPEED = 0.7;           // unités de monde par tick (un peu plus vite qu'un messager chargé)
const DECIDE_EVERY = 12;          // chaque habitant réfléchit à son emploi du temps tous les N ticks
const MEET_EVERY = 42;            // une conversation par lieu fréquenté, tous les N ticks en moyenne (≈ 26 s à ×1)
/** Moins de conversations, mais chacune compte d'autant plus : les liens se font au même rythme qu'avant. */
const BOND_SCALE = 3;
/** Délai avant la réponse (ticks) : les répliques s'affichent chacune à leur tour. */
const REPLY_DELAY = 2; // ≈ 1,25 s à ×1
const NEEDS_PATCH_EVERY = 8;      // fréquence d'envoi des besoins au site
const TAX_THRESHOLD = 6;          // au-delà de cette somme, on paie une pièce d'impôt chaque matin
const CARE_PRICE = 2;
const TAVERN_PRICE = 1;
const HUNGER_PER_DAY = 0.9;       // satiété perdue par jour
const BREAD_FILLS = 0.6;          // satiété rendue par un pain
const RETRY_TICKS = 60;           // après un achat raté, on attend avant de retenter


const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Envie de voler cette nuit (probabilité par décision nocturne) : le vagabond par habitude, l'affamé sans le sou
 * s'il est peu honnête, et le pauvre malhonnête par envie des plus riches.
 */
export function theftUrge(a: Agent, s: { satiete: number; pain: number; pieces: number; richest?: number }): number {
  if (a.role === 'VOLEUR') return s.satiete < 0.6 ? 0.5 : 0.2;
  const honesty = a.personality.honesty;
  if (honesty < 0.55 && s.satiete < 0.3 && s.pain === 0 && s.pieces < PRICES.pain) return 0.35;
  if (honesty < 0.4 && s.pieces < 3) return 0.06;
  // La jalousie : même sans avoir faim, un malhonnête finit par lorgner sur la bourse des riches.
  if (honesty < 0.4 && (s.richest ?? 0) >= ENVY_RICH && s.pieces * 4 < (s.richest ?? 0)) return ENVY_URGE;
  return 0;
}

/** Fortune qui rend jaloux, et envie de voler par tick de nuit (≈ 8 % par nuit). */
const ENVY_RICH = 80;
const ENVY_URGE = 0.002;

/** Pain gardé d'avance à la maison, et heure limite pour aller en acheter. */
const BREAD_RESERVE = 3;
const SHOP_UNTIL = 21;

/**
 * Faut-il aller à la boulangerie ? On garde une petite réserve (les salariés n'ont que le matin et le soir),
 * et un affamé sans le sou y va quand même : on lui offrira peut-être un pain.
 */
export function wantsBread(n: { satiete: number }, inv: { pain: number; pieces: number }, hour: number): boolean {
  if (hour < 6 || hour >= SHOP_UNTIL) return false;
  const broke = inv.pieces < PRICES.pain && n.satiete < 0.25 && inv.pain === 0;
  return (inv.pain < BREAD_RESERVE && inv.pieces >= PRICES.pain) || broke;
}

/** Ce qui s'est passé ces trois derniers jours, relu une fois par tick (le journal peut être très long). */
interface RecentNews {
  deaths: { name: string; sad: AgentId[] }[];
  departures: { name: string; sad: AgentId[]; wander: boolean }[];
  weddings: string[];
  baptisms: string[];
  tornado: { victims: AgentId[]; names: string }[];
  treasure: { finder: AgentId; name: string }[];
  mishaps: { owner: AgentId; text: string }[];
  closedJobs: AgentId[];
  reconciled: [AgentId, AgentId][];
  newMayor?: AgentId;
  taxHelp: boolean;
  adopted: AgentId[];
}
let newsCache: { tick: number; news: RecentNews } | null = null;

function recentNews(sim: Sim): RecentNews {
  if (newsCache?.tick === sim.clock.tick) return newsCache.news;
  const news: RecentNews = { deaths: [], departures: [], weddings: [], baptisms: [], tornado: [], treasure: [], mishaps: [], closedJobs: [], reconciled: [], taxHelp: false, adopted: [] };
  const events = sim.journal.events;
  const day = sim.clock.day;
  const name = (id?: AgentId) => (id && sim.world.agents[id]?.name) || '';
  for (let i = events.length - 1; i >= 0 && events[i].day >= day - 3; i--) {
    const e = events[i];
    const p = (e.payload ?? {}) as Record<string, unknown>;
    const first = e.text.replace(/^[^\p{L}]+/u, '').split(/[ ,]/)[0];
    if (e.type === 'agent.died') news.deaths.push({ name: first, sad: (p.sad as AgentId[]) ?? [] });
    else if (e.type === 'agent.left') news.departures.push({ name: e.text.match(/: ([^ ]+) (part|partent)|🎒 ([^ ]+)/)?.slice(1).find(Boolean) ?? first, sad: (p.sad as AgentId[]) ?? [], wander: !!p.wander });
    else if (e.type === 'party' && p.kind === 'mariage' && e.actors.length === 2) news.weddings.push(`${name(e.actors[0])} et ${name(e.actors[1])}`);
    else if (e.type === 'party' && p.kind === 'bapteme' && e.actors[0]) news.baptisms.push(name(e.actors[0]));
    else if (e.type === 'house.destroyed') news.tornado.push({ victims: e.actors, names: e.actors.map(name).filter(Boolean).join(' et ') });
    else if (e.type === 'treasure.found' && e.actors[0]) news.treasure.push({ finder: e.actors[0], name: name(e.actors[0]) });
    else if (e.type === 'village.event' && p.mishap && e.actors[0]) news.mishaps.push({ owner: e.actors[0], text: e.text });
    else if (e.type === 'job.changed' && p.lost && /ferme ses portes/.test(e.text)) news.closedJobs.push(...e.actors);
    else if (e.type === 'life.reconcile' && e.actors.length === 2) news.reconciled.push([e.actors[0], e.actors[1]]);
    else if (e.type === 'mayor.elected' && !p.kept && !news.newMayor && e.day >= day - 2) news.newMayor = e.actors[0];
    else if (e.type === 'village.event' && p.helped && e.day >= day - 1) news.taxHelp = true;
    else if (e.type === 'village.event' && p.adopted) news.adopted.push(String(p.adopted));
  }
  newsCache = { tick: sim.clock.tick, news };
  return news;
}

/** Ce qui arrive vraiment à celui qui parle : son travail, son couple, sa maison, ses proches, la saison… */
function talkSituation(sim: Sim, speaker: Agent, listener: Agent) {
  const w = sim.world;
  const job = sim.economy.jobOf(w, speaker.id);
  const listenerJob = sim.economy.jobOf(w, listener.id);
  const recent = w.gazettes.at(-1);
  const partner = speaker.family?.partnerId ? w.agents[speaker.family.partnerId]?.name : undefined;
  const news = recentNews(sim);
  const nameOf = (id?: AgentId | null) => (id ? w.agents[id]?.name : undefined);
  const richest = Object.values(w.agents).sort((x, y) => (y.inventory?.pieces ?? 0) - (x.inventory?.pieces ?? 0))[0];
  const jealous = speaker.personality.honesty < 0.45 || speaker.personality.traits.some((t) => /jaloux|avare|grincheux/.test(t));
  const guests = Object.values(w.agents).filter((x) => x.lodging === speaker.houseId).map((x) => x.name);
  const mishap = news.mishaps.find((m) => job && m.owner === job.ownerId);
  return {
    job: job && workplaceName(job),
    listenerJob: listenerJob && workplaceName(listenerJob),
    jobless: !speaker.job && isAdult(w, speaker),
    headline: recent && w.clock.day - recent.day <= 1 ? recent.headline : undefined,
    partner,
    season: seasonOf(w.clock.day),
    grief: news.deaths.find((d) => d.sad.includes(speaker.id))?.name,
    missed: news.departures.find((d) => d.sad.includes(speaker.id))?.name,
    wanderer: news.departures.find((d) => d.wander)?.name,
    wedding: news.weddings[0],
    baptism: news.baptisms[0],
    funeral: w.festivity?.kind === 'obseques',
    lodgingWith: speaker.lodging ? nameOf(w.houses[speaker.lodging]?.ownerId) ?? 'des voisins' : undefined,
    hosting: guests.length ? guests.join(' et ') : undefined,
    tornadoVictims: news.tornado.find((t) => !t.victims.includes(speaker.id))?.names || undefined,
    envyOf: jealous && richest && richest.id !== speaker.id && (richest.inventory?.pieces ?? 0) >= 100 ? richest.name : undefined,
    treasureFinder: news.treasure.find((t) => t.finder !== speaker.id)?.name,
    foundTreasure: news.treasure.some((t) => t.finder === speaker.id),
    mishap: mishap?.text.replace(/^[^\p{L}]+/u, '').split(/[:.]/)[0],
    closedDown: news.closedJobs.includes(speaker.id),
    reconciled: news.reconciled.some(([a, b]) => (a === speaker.id && b === listener.id) || (b === speaker.id && a === listener.id)),
    newMayor: news.newMayor && news.newMayor !== speaker.id ? nameOf(news.newMayor) : undefined,
    justElected: news.newMayor === speaker.id,
    elder: isElder(speaker, w.clock.day),
    child: !isAdult(w, speaker),
    taxHelped: news.taxHelp && (speaker.inventory?.pieces ?? 0) < 10,
    adopted: news.adopted.includes(speaker.id),
    catName: w.catName,
    dogOwner: nameOf(w.mayorId),
  };
}

/** La fête ou le marché du calendrier pour ce jour de la semaine, s'il y en a un. */
function calendarEvent(today: string): VillageEvent | undefined {
  const cal = CALENDAR[today];
  if (!cal) return undefined;
  return {
    id: `calendrier-${today}`,
    weight: 0,
    run: (_s, h) => {
      h.gather(cal.hour, cal.until);
      h.moodAll(cal.mood);
      return cal.text;
    },
  };
}

export class Daily {
  readonly justice = new Justice();
  private lastNeedsPatch = 0;
  /** Fête prévue : on rassemble le village sur la place à cette heure. */
  private party: { day: number; hour: number; reason: string; kind: PartyKind; honorees: AgentId[] } | null = null;
  private sangToday = false;
  /** Tant que la forêt est « fermée » (loup), personne n'y va. */
  forestClosedUntil = 0;
  /** Le phénomène météo prévu aujourd'hui (tiré le matin), s'il y en a un. */
  weatherPlan: { kind: EffectKind; hour: number } | null = null;
  /** Événements du jour, avec leur heure. */
  private todays: { hour: number; ev: VillageEvent; done: boolean }[] = [];
  /** Qui est déjà allé couper du bois aujourd'hui. */
  private cutToday = new Set<AgentId>();
  /** Prochain tick où l'habitant peut retenter un achat ou se plaindre de la faim. */
  private nextShop = new Map<AgentId, number>();
  private nextComplaint = new Map<AgentId, number>();

  // ─── Outils ───────────────────────────────────────────────────────────────

  private hour(sim: Sim) {
    return villageHour(sim.clock.tick, sim.clock.ticksPerDay);
  }

  private at(sim: Sim, hour: number) {
    return sim.dayTick === Math.round(sim.clock.ticksPerDay * dayFraction(hour));
  }

  /** Lieu où se trouve l'habitant, ou null s'il marche. */
  placeOf(a: Agent): PlaceId | null {
    const l = a.location ?? { kind: 'home' };
    if (l.kind === 'home') return homeOf(a);
    if (l.kind === 'at') return l.place;
    return null;
  }

  private isHome(a: Agent) {
    return !a.location || a.location.kind === 'home';
  }

  private needs(a: Agent): Needs {
    a.needs ??= { satiete: 0.8, energie: 0.9, humeur: 0.7, sante: 1 };
    return a.needs;
  }

  private inv(a: Agent) {
    a.inventory ??= { pain: 1, bois: 1, outils: 0, pieces: 5 };
    return a.inventory;
  }

  private byRole(sim: Sim, role: Role) {
    return Object.values(sim.world.agents).find((a) => a.role === role);
  }

  /** Départ à pied vers un lieu ; renvoie false si aucune route ouverte n'y mène. */
  trip(sim: Sim, a: Agent, to: PlaceId, purpose: TripPurpose, stayHours: number): boolean {
    const from = this.placeOf(a);
    if (!from || from === to) return false;
    const path = findPath(sim.world, from, to);
    if (!path) return false;
    const stay = Math.round((stayHours / 24) * sim.clock.ticksPerDay);
    a.location = { kind: 'walking', to, purpose, path: path.points, startTick: sim.clock.tick, speed: WALK_SPEED, length: path.length };
    this.stays.set(a.id, stay);
    a.asleep = false;
    sim.emit('life.trip', [a.id], `🚶 ${a.name} part ${this.purposeText(sim, purpose, to)}.`, { to, purpose });
    sim.touchAgents();
    return true;
  }
  private stays = new Map<AgentId, number>();
  /** Réponses qui attendent leur tour dans une conversation en cours. */
  private replies: { due: number; speaker: AgentId; listener: AgentId; text: string; place: PlaceId }[] = [];

  private placeName(sim: Sim, place: PlaceId) {
    if (place === 'place') return 'la place';
    if (place === 'foret') return 'la forêt';
    if (place === 'riviere') return 'la rivière';
    const wp = Object.values(sim.world.workplaces).find((x) => x.houseId === place);
    if (wp) return workplaceName(wp);
    const owner = sim.world.houses[place]?.ownerId;
    const o = owner ? sim.agent(owner) : undefined;
    if (!o) return 'une maison vide';
    const shop: Partial<Record<Role, string>> = { BOULANGER: 'la boulangerie', FORGERON: 'la forge', AUBERGISTE: 'l’auberge', HERBORISTE: 'l’échoppe de l’herboriste', MAIRE: 'la mairie' };
    return shop[o.role] ?? `chez ${o.name}`;
  }

  private purposeText(sim: Sim, purpose: TripPurpose, to: PlaceId) {
    const where = this.placeName(sim, to);
    const aWhere = where.startsWith('chez') ? where : `à ${where}`;
    const what: Record<TripPurpose, string> = {
      acheter: `faire des courses ${aWhere}`, vendre: `vendre du bois ${aWhere}`, visite: `rendre visite ${where.startsWith('chez') ? where : `à ${where}`}`,
      taverne: `boire un verre ${aWhere}`, fete: `se rendre sur ${where}`, travail: `travailler ${aWhere}`, soin: `se faire soigner ${aWhere}`,
      annonce: `crier les nouvelles sur ${where}`, vol: `en douce vers ${where}`, enquete: `enquêter ${where.startsWith('chez') ? where : `à ${where}`}`,
      reparer: `réparer la route près de ${where}`, retour: 'rentrer chez soi', promenade: `se promener ${aWhere}`,
    };
    return what[purpose];
  }

  /** Retour à la maison (ou on reste sur place si la route est coupée). */
  private goHome(sim: Sim, a: Agent) {
    if (this.isHome(a)) return;
    if (!this.trip(sim, a, homeOf(a), 'retour', 0)) {
      const l = a.location;
      if (l?.kind === 'at') l.until = sim.clock.tick + 20; // bloqué : on réessaiera
    }
  }

  // ─── Boucle ───────────────────────────────────────────────────────────────

  onTick(sim: Sim) {
    const hour = this.hour(sim);
    const night = isNight(sim.clock);
    const agents = Object.values(sim.world.agents);

    for (const t of this.todays) {
      if (t.done || !this.at(sim, t.hour)) continue;
      t.done = true;
      if (t.ev.when && !t.ev.when(sim)) continue;
      const text = t.ev.run(sim, helpers(sim));
      if (text) sim.emit('village.event', [], text, { event: t.ev.id });
    }
    if (this.party && this.party.day === sim.clock.day && this.at(sim, this.party.hour)) this.startParty(sim);
    if (sim.world.festivity && sim.clock.tick >= sim.world.festivity.until) {
      delete sim.world.festivity;
      sim.broadcastPatch({ festivity: undefined });
    }

    for (const a of agents) {
      this.updateNeeds(sim, a, night);
      this.updateTrip(sim, a);
    }

    // Chacun décide de son emploi du temps, en décalé pour étaler la charge.
    for (const [i, a] of agents.entries()) {
      if ((sim.clock.tick + i * 3) % DECIDE_EVERY === 0) this.decide(sim, a, hour, night);
    }

    this.deliverReplies(sim);
    this.meetings(sim);
    if (this.at(sim, 20)) this.tavernSong(sim);
    this.justice.onTick(sim, hour, this.byRole(sim, 'GARDE')?.id);

    if (sim.clock.tick - this.lastNeedsPatch >= NEEDS_PATCH_EVERY) {
      this.lastNeedsPatch = sim.clock.tick;
      sim.touchAgents();
    }
  }

  private updateNeeds(sim: Sim, a: Agent, night: boolean) {
    const n = this.needs(a);
    const inv = this.inv(a);
    const perDay = sim.clock.ticksPerDay;
    n.satiete = clamp01(n.satiete - HUNGER_PER_DAY / perDay);
    if (a.asleep) n.energie = clamp01(n.energie + 2.4 / perDay);
    else n.energie = clamp01(n.energie - (night ? 1.6 : 0.9) / perDay);
    n.sante = clamp01(n.sante + 0.25 / perDay);
    const target = 0.25 + 0.5 * ((n.satiete + n.energie + n.sante) / 3);
    n.humeur = clamp01(n.humeur + (target - n.humeur) * 0.004);

    // On mange quand on a faim et qu'on a du pain.
    if (n.satiete < 0.5 && inv.pain > 0) {
      inv.pain--;
      n.satiete = clamp01(n.satiete + BREAD_FILLS);
    }
    if (n.satiete < 0.12 && sim.clock.tick >= (this.nextComplaint.get(a.id) ?? 0)) {
      this.nextComplaint.set(a.id, sim.clock.tick + Math.round(perDay / 6));
      sim.emit('life.need', [a.id], `😩 ${a.name} meurt de faim et n’a plus rien à manger.`, { need: 'faim' });
      n.humeur = clamp01(n.humeur - 0.05);
      sim.adjustOpinion(a.id, sim.world.mayorId, -0.03);
    }
  }

  private updateTrip(sim: Sim, a: Agent) {
    const l = a.location;
    if (!l) return;
    if (l.kind === 'walking' && (sim.clock.tick - l.startTick) * l.speed >= l.length) {
      if (l.to === homeOf(a)) a.location = { kind: 'home' };
      else a.location = { kind: 'at', place: l.to, purpose: l.purpose, until: sim.clock.tick + (this.stays.get(a.id) ?? 20) };
      sim.touchAgents();
      this.arrive(sim, a, l.to, l.purpose);
    } else if (l.kind === 'at' && sim.clock.tick >= l.until) {
      this.goHome(sim, a);
    }
  }

  // ─── Matin : production ───────────────────────────────────────────────────

  /** Appelé par la simulation à chaque début de journée (6 h), y compris au tout premier jour. */
  morning(sim: Sim) {
    const mayor = sim.agent(sim.world.mayorId);
    if (mayor) this.inv(mayor).pieces += 3; // le domaine du village rapporte un peu chaque jour
    for (const a of Object.values(sim.world.agents)) {
      a.asleep = false;
      const inv = this.inv(a);
      // Impôt progressif : un dixième de ce qui dépasse le seuil, versé au maire (qui paie les salaires).
      if (mayor && a.id !== mayor.id && inv.pieces > TAX_THRESHOLD) {
        const tax = Math.ceil((inv.pieces - TAX_THRESHOLD) / 10);
        inv.pieces -= tax;
        this.inv(mayor).pieces += tax;
      }
    }
    // Maladies du jour (plus fréquentes après un orage).
    for (const a of Object.values(sim.world.agents)) {
      if (Math.random() < 0.03) this.fallSick(sim, a);
    }
    // Les menteurs et le vagabond lancent une fausse rumeur sur quelqu'un qu'ils n'aiment pas.
    for (const a of Object.values(sim.world.agents)) {
      if ((a.role === 'MENTEUR' || a.role === 'VOLEUR') && Math.random() < 0.5) {
        const target = Object.keys(a.opinions).sort((x, y) => (a.opinions[x] ?? 0) - (a.opinions[y] ?? 0))[0];
        const others = Object.keys(sim.world.agents).filter((id) => id !== target);
        if (target) createRumor(sim, a.id, SLANDERS[Math.floor(Math.random() * SLANDERS.length)], target, false, others[Math.floor(Math.random() * others.length)]);
      }
    }
    this.justice.onMorning(sim);
    this.sangToday = false;
    this.planDay(sim);
  }

  /** Une gazette parue : le maire verse une pièce à chacun de ceux qui l'ont faite. */
  payGazette(sim: Sim) {
    const mayor = sim.agent(sim.world.mayorId);
    if (!mayor) return;
    const mi = this.inv(mayor);
    for (const a of Object.values(sim.world.agents)) {
      if (!['ECLAIREUR', 'ECRIVAIN', 'EDITEUR', 'LECTEUR'].includes(a.role) || a.id === mayor.id || mi.pieces < 2) continue;
      mi.pieces -= 2;
      this.inv(a).pieces += 2;
    }
  }

  fallSick(sim: Sim, a: Agent) {
    const n = this.needs(a);
    if (n.sante < 0.6) return;
    n.sante = 0.35;
    sim.emit('health.sick', [a.id], `🤒 ${a.name} tombe malade.`);
    createRumor(sim, a.id, 'malade', a.id, true);
  }

  // ─── Emploi du temps ──────────────────────────────────────────────────────

  private decide(sim: Sim, a: Agent, hour: number, night: boolean) {
    if (a.location?.kind === 'walking') return;
    const n = this.needs(a);
    const inv = this.inv(a);
    const home = this.isHome(a);

    // La nuit, on rentre et on dort… sauf le vagabond, qui a d'autres projets.
    if (night) {
      // Le vagabond vole par habitude ; un habitant peu honnête et affamé, sans pain ni sou, peut craquer.
      const richest = Math.max(0, ...Object.values(sim.world.agents).filter((x) => x.id !== a.id).map((x) => x.inventory?.pieces ?? 0));
      const urge = theftUrge(a, { satiete: n.satiete, pain: inv.pain, pieces: inv.pieces, richest });
      if (urge && home && hour >= 1 && hour < 3 && Math.random() < urge) {
        const target = this.richestHouse(sim, a);
        if (target && this.trip(sim, a, target, 'vol', 0.3)) return;
      }
      if (!home && a.location?.kind === 'at' && a.location.purpose !== 'vol') this.goHome(sim, a);
      if (home && !a.asleep) {
        a.asleep = true;
        sim.touchAgents();
      }
      return;
    }
    if (!home || a.activity === 'thinking') return;

    // Épuisé : petite sieste à la maison.
    if (n.energie < 0.12) {
      a.asleep = true;
      return;
    }
    if (a.asleep) a.asleep = false;
    const canShop = sim.clock.tick >= (this.nextShop.get(a.id) ?? 0);

    // Malade : chez l'herboriste.
    const healer = this.byRole(sim, 'HERBORISTE');
    if (n.sante < 0.5 && healer && healer.id !== a.id && this.trip(sim, a, healer.houseId, 'soin', 0.7)) return;

    // Faim et plus de pain : à la boulangerie.
    const bakery = sim.economy.bestBakery(sim.world);
    if (canShop && bakery && wantsBread(n, inv, hour)) {
      this.nextShop.set(a.id, sim.clock.tick + 30);
      if (this.trip(sim, a, bakery.houseId, 'acheter', 0.4)) return;
    }

    // L'aubergiste va chercher le pain du soir à 8 h.
    if (a.role === 'AUBERGISTE' && canShop && hour >= 8 && hour < 10 && inv.pain < 3 && bakery && inv.pieces >= 2 * PRICES.pain) {
      this.nextShop.set(a.id, sim.clock.tick + 200);
      if (this.trip(sim, a, bakery.houseId, 'acheter', 0.4)) return;
    }

    // Le crieur annonce les nouvelles sur la place à 9 h.
    if (a.role === 'CRIEUR' && hour >= 9 && hour < 10 && this.trip(sim, a, 'place', 'annonce', 0.8)) return;

    // Le garde enquête l'après-midi.
    if (a.role === 'GARDE' && hour >= 9 && hour < 16) {
      const suspect = this.justice.nextSuspect(sim, a.id);
      if (suspect && Math.random() < 0.4 && this.trip(sim, a, sim.agent(suspect).houseId, 'enquete', 0.5)) return;
    }

    // Le forgeron répare les routes emportées par la crue.
    if (a.role === 'FORGERON' && inv.outils > 0) {
      const broken = this.floodRoads(sim)[0];
      const road = broken && sim.world.roads[broken];
      if (road && Math.random() < 0.5) {
        for (const end of [road.a, road.b]) if (this.trip(sim, a, end, 'reparer', 1)) return;
      }
    }

    // Le soir, à l'auberge.
    const inn = this.byRole(sim, 'AUBERGISTE');
    if (hour >= 18 && hour < 21 && inn && inn.id !== a.id) {
      const goes = a.role === 'BARDE' || (n.humeur > 0.3 && n.energie > 0.3 && inv.pieces >= TAVERN_PRICE && Math.random() < 0.3);
      if (goes && this.trip(sim, a, inn.houseId, 'taverne', 21.5 - hour)) return;
    }

    // Les salariés présents partent au travail à 8 h et y restent jusqu'à 17 h.
    const job = sim.economy.jobOf(sim.world, a.id);
    if (job && sim.economy.isPresent(a.id) && hour >= WORK_HOURS[0] && hour < WORK_HOURS[0] + 1 && !this.cutToday.has(a.id)) {
      this.cutToday.add(a.id);
      if (this.trip(sim, a, job.houseId, 'travail', WORK_HOURS[1] - hour)) return;
    }

    // L'après-midi, chacun son loisir : pêche, cueillette, promenade… ou une pensée à la fenêtre.
    if (hour >= 14 && hour < 17 && Math.random() < 0.1) {
      const hobby = this.hobby(a);
      if (hobby === 'peche' && this.trip(sim, a, 'riviere', 'promenade', 1.5)) return;
      if ((hobby === 'cueillette' || hobby === 'promenade') && sim.clock.tick >= this.forestClosedUntil && this.trip(sim, a, 'foret', 'promenade', 1.2)) return;
      const musings = MUSINGS[a.role];
      if (musings && Math.random() < 0.4) sim.emit('agent.thought', [a.id], `💭 ${a.name} : ${musings[Math.floor(Math.random() * musings.length)]}`, { text: musings[Math.floor(Math.random() * musings.length)] });
    }

    // L'après-midi, une visite à quelqu'un qu'on apprécie (ou à son ou sa partenaire).
    if (hour >= 13 && hour < 18 && Math.random() < 0.08) {
      const friend = a.family?.partnerId ?? Object.entries(a.opinions).sort((x, y) => y[1] - x[1])[0]?.[0];
      const f = friend && sim.agent(friend);
      if (f && f.houseId !== a.houseId) this.trip(sim, a, f.houseId, 'visite', 1.2);
    }
  }

  private richestHouse(sim: Sim, thief: Agent): PlaceId | undefined {
    const victims = Object.values(sim.world.agents).filter((x) => x.id !== thief.id && x.houseId !== thief.houseId);
    return victims.sort((x, y) => this.inv(y).pain * 2 + this.inv(y).pieces - (this.inv(x).pain * 2 + this.inv(x).pieces))[0]?.houseId;
  }

  private floodRoads(sim: Sim) {
    return sim.world.effects.flatMap((e) => e.cutRoads ?? []);
  }

  // ─── Arrivées ─────────────────────────────────────────────────────────────

  private ownerAt(sim: Sim, place: PlaceId) {
    const id = sim.world.houses[place]?.ownerId;
    return id ? sim.agent(id) : undefined;
  }

  private arrive(sim: Sim, a: Agent, place: PlaceId, purpose: TripPurpose) {
    const owner = this.ownerAt(sim, place);
    const inv = this.inv(a);
    switch (purpose) {
      case 'acheter': {
        const got = sim.economy.buyBread(sim, a);
        if (!got) {
          sim.emit('life.trade', [a.id], `😠 Plus de pain à la boulangerie ! ${a.name} repart le ventre vide.`, { item: 'pain', qty: 0 });
          this.nextShop.set(a.id, sim.clock.tick + RETRY_TICKS);
        }
        break;
      }
      case 'soin': {
        if (!owner) break;
        const n = this.needs(a);
        const paid = inv.pieces >= CARE_PRICE;
        if (paid) {
          inv.pieces -= CARE_PRICE;
          this.inv(owner).pieces += CARE_PRICE;
        } else sim.adjustOpinion(owner.id, a.id, -0.1, 'Encore un qui ne paie pas ses remèdes');
        n.sante = clamp01(n.sante + 0.6);
        sim.emit('health.healed', [owner.id, a.id], `🌿 ${owner.name} soigne ${a.name}${paid ? '' : ' (à crédit…)'}.`);
        sim.adjustOpinion(a.id, owner.id, 0.1);
        break;
      }
      case 'taverne': {
        if (owner && inv.pieces >= TAVERN_PRICE) {
          inv.pieces -= TAVERN_PRICE;
          this.inv(owner).pieces += TAVERN_PRICE;
          // Un repas chaud si l'aubergiste a du pain.
          const oi = this.inv(owner);
          if (oi.pain > 0) {
            oi.pain--;
            this.needs(a).satiete = clamp01(this.needs(a).satiete + 0.35);
          }
        }
        this.needs(a).humeur = clamp01(this.needs(a).humeur + 0.1);
        break;
      }
      case 'annonce':
        this.announce(sim, a);
        break;
      case 'enquete':
        if (owner) this.justice.investigate(sim, a.id, owner.id);
        break;
      case 'reparer': {
        const id = this.floodRoads(sim).find((r) => sim.world.roads[r] && (sim.world.roads[r].a === place || sim.world.roads[r].b === place));
        if (!id || inv.outils < 1) break;
        inv.outils--;
        for (const e of sim.world.effects) e.cutRoads = e.cutRoads?.filter((r) => r !== id);
        sim.world.roads[id].status = 'open';
        sim.broadcastPatch({ roads: sim.world.roads, effects: sim.world.effects });
        sim.emit('repair.done', [a.id], `🔨 ${a.name} a réparé une route emportée par la crue.`, { roadId: id });
        for (const x of Object.values(sim.world.agents)) if (x.id !== a.id) sim.adjustOpinion(x.id, a.id, 0.03);
        break;
      }
      case 'vol': {
        if (!owner) break;
        const oi = this.inv(owner);
        let loss = '';
        if (oi.pain > 0) {
          const qty = Math.min(3, oi.pain);
          oi.pain -= qty;
          inv.pain += qty;
          loss = qty > 1 ? `${qty} pains ont disparu` : 'un pain a disparu';
        } else if (oi.pieces > 0) {
          const qty = Math.min(3, oi.pieces);
          oi.pieces -= qty;
          inv.pieces += qty;
          loss = qty > 1 ? `${qty} pièces ont disparu` : 'une pièce a disparu';
        }
        if (loss) this.justice.recordTheft(sim, a.id, owner.id, loss);
        break;
      }
      case 'travail':
        if (place === 'foret') {
          const qty = 1 + (Math.random() < 0.5 ? 1 : 0) + (inv.outils > 0 ? 1 : 0);
          inv.bois += qty;
          sim.emit('life.work', [a.id], `🪓 ${a.name} coupe ${qty} bûche${qty > 1 ? 's' : ''} en forêt.`, { work: 'bois', qty });
        }
        break;
      case 'promenade': {
        const n = this.needs(a);
        n.humeur = clamp01(n.humeur + 0.1);
        if (place === 'riviere' && Math.random() < 0.55) {
          const fish = ['une truite', 'un brochet', 'trois goujons', 'une anguille', 'une vieille botte'][Math.floor(Math.random() * 5)];
          if (fish !== 'une vieille botte') n.satiete = clamp01(n.satiete + 0.35);
          sim.emit('life.hobby', [a.id], `🎣 ${a.name} pêche ${fish} dans la rivière.`, { hobby: 'peche' });
        } else if (place === 'foret' && a.role === 'HERBORISTE') {
          inv.pieces += 1;
          sim.emit('life.hobby', [a.id], `🌿 ${a.name} cueille des herbes rares en forêt.`, { hobby: 'cueillette' });
        } else if (place === 'foret' && Math.random() < 0.35) {
          const find = ['des champignons', 'des mûres', 'une plume de geai', 'des noisettes', 'un nid abandonné'][Math.floor(Math.random() * 5)];
          sim.emit('life.hobby', [a.id], `🍄 ${a.name} trouve ${find} en se promenant en forêt.`, { hobby: 'promenade' });
        }
        break;
      }
      case 'visite':
        this.needs(a).humeur = clamp01(this.needs(a).humeur + 0.05);
        break;
      default:
        break;
    }
  }

  // ─── Crieur, rencontres, chansons, fêtes ──────────────────────────────────

  /** Seul le crieur parle à tout le village d'un coup : nouvelles du jour et rumeur en vogue. */
  private announce(sim: Sim, crier: Agent) {
    const w = sim.world;
    const lastGazette = w.gazettes[w.gazettes.length - 1];
    const rumor = hottestRumor(sim);
    const today = dayName(sim.clock.day);
    const roll = Math.random();
    const news =
      CALENDAR[today] && roll < 0.3
        ? `nous sommes ${today}, et c’est ${today === 'mercredi' ? 'jour de marché' : 'pique-nique sur la place'} !`
        : rumor && roll < 0.55
          ? `on raconte ${que(rumor.text)} !`
          : lastGazette && roll < 0.8
            ? `la gazette du jour ${lastGazette.day} titre : « ${lastGazette.headline} » !`
            : `${CRIER_EXTRAS[Math.floor(Math.random() * CRIER_EXTRAS.length)]} !`;
    sim.emit('rumor.announce', [crier.id], `📯 ${crier.name} : « OYEZ, OYEZ ! ${news.toUpperCase()} »`, { body: news });
    for (const a of Object.values(w.agents)) {
      if (a.id === crier.id) continue;
      sim.remember(a.id, crier.id, 'in', `Le crieur a annoncé : ${news}`);
      if (rumor && news.includes(rumor.text) && !rumor.knownBy.includes(a.id)) rumor.knownBy.push(a.id);
    }
  }

  /** Qui se trouve où en ce moment (hors marcheurs). */
  private presence(sim: Sim) {
    const by = new Map<PlaceId, Agent[]>();
    for (const a of Object.values(sim.world.agents)) {
      if (a.asleep) continue;
      const p = this.placeOf(a);
      if (p) by.set(p, [...(by.get(p) ?? []), a]);
    }
    return by;
  }

  /** Deux personnes au même endroit se parlent : rumeurs, petites phrases, disputes. */
  /** Les réponses en attente, dites quand leur tour vient (si l'autre est toujours là). */
  private deliverReplies(sim: Sim) {
    const due = this.replies.filter((r) => sim.clock.tick >= r.due);
    if (!due.length) return;
    this.replies = this.replies.filter((r) => sim.clock.tick < r.due);
    for (const r of due) {
      const [speaker, listener] = [sim.agent(r.speaker), sim.agent(r.listener)];
      if (!speaker || !listener || this.placeOf(speaker) !== r.place || this.placeOf(listener) !== r.place) continue;
      sim.emit('life.meet', [speaker.id, listener.id], `🗨 ${speaker.name} répond : « ${r.text} »`, { body: r.text, place: r.place });
      sim.remember(listener.id, speaker.id, 'in', r.text);
    }
  }

  /**
   * Les conversations : chaque lieu a sa chance à chaque tick (une tous les MEET_EVERY ticks en moyenne),
   * pour qu'elles s'étalent au lieu de partir toutes en même temps. Qui attend une réponse ne lance rien.
   */
  private meetings(sim: Sim) {
    const busy = new Set(this.replies.flatMap((r) => [r.speaker, r.listener]));
    for (const [place, all] of this.presence(sim)) {
      const people = all.filter((a) => !busy.has(a.id));
      if (people.length < 2 || Math.random() >= 1 / MEET_EVERY) continue;
      const i = Math.floor(Math.random() * people.length);
      const speaker = people[i];
      const listener = people[(i + 1 + Math.floor(Math.random() * (people.length - 1))) % people.length];
      const where = this.placeName(sim, place);
      const mutual = Math.min(speaker.opinions[listener.id] ?? 0, listener.opinions[speaker.id] ?? 0);
      const rumor = rumorToShare(sim, speaker, listener);
      let line: string;
      let mood: string | undefined;
      if (mutual < -0.4) {
        line = coldShoulder();
        mood = 'hostile';
        sim.adjustOpinion(speaker.id, listener.id, -0.04 * BOND_SCALE);
        sim.adjustOpinion(listener.id, speaker.id, -0.04 * BOND_SCALE);
      } else if (rumor && Math.random() < 0.7) {
        const told = tellRumor(sim, speaker, listener, rumor);
        line = `Tu sais quoi ? Il paraît ${que(told.text)}.`;
        sim.emit('rumor.spread', [speaker.id, listener.id], `🗣 ${speaker.name} glisse à ${listener.name} ${que(told.text)}.`, { rumorId: told.id, body: line, true: told.true });
      } else {
        const ex = chooseExchange({
          speaker, listener, mutual, place: where, dayName: dayName(sim.clock.day),
          night: isNight(sim.clock), storm: isActive(sim, 'storm'), flood: isActive(sim, 'flood'),
          mayorName: sim.agent(sim.world.mayorId)?.name ?? '', mayorOpinion: speaker.opinions[sim.world.mayorId] ?? 0,
          ...talkSituation(sim, speaker, listener),
        });
        line = ex.line;
        mood = ex.mood;
        sim.adjustOpinion(speaker.id, listener.id, ex.bond * BOND_SCALE);
        sim.adjustOpinion(listener.id, speaker.id, ex.bond * BOND_SCALE);
        if (ex.reply) {
          // La réponse viendra un peu plus tard, quand la première bulle aura été lue.
          this.replies.push({ due: sim.clock.tick + REPLY_DELAY, speaker: listener.id, listener: speaker.id, text: ex.reply, place });
        }
      }
      sim.emit('life.meet', [speaker.id, listener.id], `🗨 ${speaker.name} à ${listener.name} (${where}) : « ${line} »`, { body: line, place, mood });
      sim.remember(listener.id, speaker.id, 'in', line);
    }
  }

  /** Le moment le plus marquant de la journée, pour le barde. */
  private highlight(sim: Sim): string {
    const today = sim.journal.events.filter((e) => e.day === sim.clock.day);
    const pick = (types: string[]) => [...today].reverse().find((e) => types.includes(e.type));
    const e = pick(['trial.verdict', 'mayor.elected', 'crime.theft', 'couple.formed', 'agent.born', 'world.effect', 'village.event', 'party']);
    if (!e) return 'rien ne s’est passé, et c’est déjà beaucoup';
    // Première phrase seulement, coupée proprement à un mot.
    const sentence = e.text.replace(/^[^\p{L}]+/u, '').replace(/[«»"]/g, '').split(/[!.:]/)[0].trim().toLowerCase();
    return sentence.length <= 70 ? sentence : sentence.slice(0, sentence.lastIndexOf(' ', 70));
  }

  private tavernSong(sim: Sim) {
    const bard = this.byRole(sim, 'BARDE');
    if (!bard || this.sangToday || bard.asleep || this.placeOf(bard) === bard.houseId) return;
    this.sangToday = true;
    const song = SONGS[Math.floor(Math.random() * SONGS.length)](this.highlight(sim));
    sim.emit('song', [bard.id], `${bard.name} chante : ${song}`, { body: song });
    for (const a of this.presence(sim).get(this.placeOf(bard)!) ?? []) this.needs(a).humeur = clamp01(this.needs(a).humeur + 0.08);
  }

  /** Loisir attitré de chaque habitant (stable : déduit de son identifiant). */
  private hobby(a: Agent): 'peche' | 'cueillette' | 'promenade' | 'maison' {
    if (a.role === 'HERBORISTE') return 'cueillette';
    const list = ['peche', 'promenade', 'maison', 'peche', 'cueillette', 'maison'] as const;
    let h = 0;
    for (const ch of a.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return list[h % list.length];
  }

  /** Programme les événements du jour et le rendez-vous du calendrier. */
  private planDay(sim: Sim) {
    this.cutToday.clear();
    const pool = EVENTS.filter((e) => !e.when || e.when(sim));
    const count = 1 + (Math.random() < 0.6 ? 1 : 0) + (Math.random() < 0.25 ? 1 : 0);
    this.todays = [];
    for (let i = 0; i < count && pool.length; i++) {
      const total = pool.reduce((s, e) => s + e.weight, 0);
      let r = Math.random() * total;
      const ev = pool.find((e) => (r -= e.weight) <= 0) ?? pool[0];
      pool.splice(pool.indexOf(ev), 1);
      this.todays.push({ hour: ev.hour ?? 8 + Math.floor(Math.random() * 12), ev, done: false });
    }
    const today = dayName(sim.clock.day);
    const cal = CALENDAR[today];
    sim.emit('calendar', [], `📅 ${today[0].toUpperCase()}${today.slice(1)}, jour ${sim.clock.day}.`, { dayName: today });
    if (cal) this.todays.push({ hour: cal.hour, done: false, ev: calendarEvent(today)! });
  }

  /** Le programme du jour pour une sauvegarde : les événements par leur nom (pas de fonctions). */
  todaysForSave() {
    return this.todays.map((t) => ({ hour: t.hour, done: t.done, id: t.ev.id }));
  }

  /** Après une reprise : retrouve chaque événement du programme à partir de son nom. */
  relinkTodays() {
    const saved = this.todays as unknown as { hour: number; done: boolean; id: string }[];
    this.todays = saved.flatMap((t) => {
      const ev = EVENTS.find((e) => e.id === t.id) ?? calendarEvent(t.id.replace(/^calendrier-/, ''));
      return ev ? [{ hour: t.hour, done: t.done, ev }] : [];
    });
  }

  /** Une fête sur la place le lendemain à 17 h : mariage d'un nouveau couple, baptême d'un bébé, ou simple fête. */
  scheduleParty(sim: Sim, reason: string, kind: PartyKind = 'fete', honorees: AgentId[] = []) {
    this.party = { day: sim.clock.day + 1, hour: 17, reason, kind, honorees };
  }

  private startParty(sim: Sim) {
    const reason = this.party?.reason ?? 'rien de spécial';
    const kind = this.party?.kind ?? 'fete';
    const honorees = (this.party?.honorees ?? []).filter((id) => sim.agent(id));
    this.party = null;
    const names = honorees.map((id) => sim.agent(id).name);
    const text = kind === 'mariage' && names.length === 2
      ? `💒 Mariage de ${names[0]} et ${names[1]} sur la place ! Guirlandes, musique, tout le village est invité.`
      : kind === 'bapteme' && names.length
        ? `🍼 Baptême de ${names[0]} sur la place ! On trinque au petit dernier du village.`
        : kind === 'obseques'
          ? `🕯 Obsèques sur la place : ${reason}. Tout le village se recueille.`
          : `🎉 Fête sur la place : ${reason} ! Tout le village est invité.`;
    sim.emit('party', honorees, text, { reason, kind });
    // Les guirlandes restent jusqu'à la fin de la fête (19 h 30).
    sim.world.festivity = { kind, honorees, until: sim.clock.tick + Math.round((sim.clock.ticksPerDay * 2.5) / 24) };
    sim.broadcastPatch({ festivity: sim.world.festivity });
    this.gather(sim, 'fete', 17, 19);
    this.sangToday = false; // le barde chantera sur la place
  }

  /** Rassemble le village sur la place (fête, procès) de `from` à `to` heures. */
  gather(sim: Sim, why: 'fete' | 'proces', from: number, to: number) {
    for (const a of Object.values(sim.world.agents)) {
      if (this.needs(a).sante < 0.4 || a.location?.kind === 'walking') continue;
      if (this.placeOf(a) === 'place') continue;
      this.trip(sim, a, 'place', 'fete', Math.max(0.5, to - from));
      if (why === 'fete') this.needs(a).humeur = clamp01(this.needs(a).humeur + 0.15);
    }
  }

  /** Bannissement après un procès : l'habitant quitte le village. */
  banish(sim: Sim, id: AgentId) {
    const w = sim.world;
    const a = w.agents[id];
    if (!a) return;
    delete w.agents[id];
    const house = w.houses[a.houseId];
    if (house?.ownerId === id) house.ownerId = null;
    for (const o of Object.values(w.agents)) {
      delete o.opinions[id];
      if (o.family?.partnerId === id) delete o.family.partnerId;
    }
    sim.emit('agent.left', [id], `🧳 ${a.name} quitte le village après le verdict.`, { agentId: id, sad: mourners(w, [a]) });
    if (w.mayorId === id) {
      const next = Object.values(w.agents)[0];
      if (next) w.mayorId = next.id;
    }
    sim.broadcastPatch({ houses: w.houses, mayorId: w.mayorId });
    sim.touchAgents();
  }
}

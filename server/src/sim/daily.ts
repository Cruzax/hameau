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
} from '@hameau/shared';
import type { Sim } from './Sim';
import { placeName as workplaceName } from './economy';
import { WORK_HOURS } from './economyConfig';
import { isActive } from './effects';
import { findPath } from './paths';
import { createRumor, hottestRumor, rumorToShare, SLANDERS, tellRumor } from './rumors';
import { Justice } from './justice';
import { chooseExchange, MUSINGS } from '../content/dialogue';
import { CALENDAR, dayName, EVENTS, helpers, type VillageEvent } from '../content/events';
import { CRIER_EXTRAS, SONGS } from '../content/verses';

// Vie quotidienne : besoins, métiers, commerce, déplacements à pied, rencontres, fêtes, chansons.
// Tout est réglé par des règles simples et gratuites : aucun appel à l'IA ici.

const WALK_SPEED = 0.7;           // unités de monde par tick (un peu plus vite qu'un messager chargé)
const DECIDE_EVERY = 12;          // chaque habitant réfléchit à son emploi du temps tous les N ticks
const MEET_EVERY = 14;            // une conversation par lieu fréquenté, tous les N ticks
const NEEDS_PATCH_EVERY = 8;      // fréquence d'envoi des besoins au site
const BREAD_PRICE = 1;
const WOOD_PRICE = 2;
const BAKER_RESERVE = 2;          // la boulangère garde toujours deux pains pour elle
const TAX_THRESHOLD = 6;          // au-delà de cette somme, on paie une pièce d'impôt chaque matin
const CARE_PRICE = 2;
const TAVERN_PRICE = 1;
const BREAD_PER_WOOD = 6;         // une bûche cuit six pains
const BAKES_PER_BATCH = 3;        // bûches enfournées le matin (et 2 de plus à midi)
const HUNGER_PER_DAY = 0.9;       // satiété perdue par jour
const BREAD_FILLS = 0.6;          // satiété rendue par un pain
const RETRY_TICKS = 60;           // après un achat raté, on attend avant de retenter

/** Qui coupe du bois le matin (les métiers sans production propre). */
const WOODCUTTERS: Role[] = ['CITOYEN', 'ECLAIREUR', 'LECTEUR', 'VOLEUR', 'MENTEUR', 'BARDE', 'ECRIVAIN', 'EDITEUR'];

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export class Daily {
  readonly justice = new Justice();
  private lastNeedsPatch = 0;
  /** Fête prévue : on rassemble le village sur la place à cette heure. */
  private party: { day: number; hour: number; reason: string } | null = null;
  private sangToday = false;
  /** Tant que la forêt est « fermée » (loup), personne n'y va. */
  forestClosedUntil = 0;
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
    if (l.kind === 'home') return a.houseId;
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
    if (!this.trip(sim, a, a.houseId, 'retour', 0)) {
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
    if (this.at(sim, 12)) {
      for (const b of Object.values(sim.world.agents)) if (b.role === 'BOULANGER') this.bake(sim, b, Math.ceil(this.batchSize(sim) / 2));
    }
    if (this.party && this.party.day === sim.clock.day && this.at(sim, this.party.hour)) this.startParty(sim);

    for (const a of agents) {
      this.updateNeeds(sim, a, night);
      this.updateTrip(sim, a);
    }

    // Chacun décide de son emploi du temps, en décalé pour étaler la charge.
    for (const [i, a] of agents.entries()) {
      if ((sim.clock.tick + i * 3) % DECIDE_EVERY === 0) this.decide(sim, a, hour, night);
    }

    if (sim.clock.tick % MEET_EVERY === 0) this.meetings(sim);
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
      if (l.to === a.houseId) a.location = { kind: 'home' };
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
    // Sans boulangerie (village d'origine), chacun vit de son potager.
    const hasBaker = Object.values(sim.world.agents).some((x) => x.role === 'BOULANGER');
    if (!hasBaker) for (const x of Object.values(sim.world.agents)) this.inv(x).pain += 2;
    for (const a of Object.values(sim.world.agents)) {
      a.asleep = false;
      const inv = this.inv(a);
      if (a.role === 'BOULANGER') {
        if (inv.bois > 0) {
          this.bake(sim, a, this.batchSize(sim));
        } else {
          sim.emit('life.work', [a.id], `🪵 Pas de bois chez ${a.name} : pas de pain ce matin !`, { work: 'pain', failed: true });
          this.needs(a).humeur = clamp01(this.needs(a).humeur - 0.15);
        }
      } else if (a.role === 'FORGERON' && inv.bois > 0 && inv.outils < 5) {
        inv.bois--;
        inv.outils++;
      } else if (WOODCUTTERS.includes(a.role) && Math.random() < 0.15) {
        inv.bois++; // une bûche ramassée près de chez soi
      }
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

  /** La boulangère enfourne jusqu'à `maxWood` bûches. */
  private bake(sim: Sim, a: Agent, maxWood: number) {
    const inv = this.inv(a);
    const wood = Math.min(maxWood, inv.bois);
    if (!wood) return;
    inv.bois -= wood;
    inv.pain += wood * BREAD_PER_WOOD;
    sim.emit('life.work', [a.id], `🍞 ${a.name} sort ${wood * BREAD_PER_WOOD} pains du four.`, { work: 'pain', qty: wood * BREAD_PER_WOOD });
  }

  /** Bûches enfournées le matin : assez pour nourrir tout le village (6 pains par bûche). */
  private batchSize(sim: Sim) {
    const bakers = Object.values(sim.world.agents).filter((a) => a.role === 'BOULANGER').length || 1;
    return Math.max(BAKES_PER_BATCH, Math.ceil(Object.keys(sim.world.agents).length / (4 * bakers)));
  }

  /** La boulangerie la mieux fournie (s'il y en a plusieurs). */
  private bestBaker(sim: Sim, buyer: Agent) {
    return Object.values(sim.world.agents)
      .filter((b) => b.role === 'BOULANGER' && b.id !== buyer.id)
      .sort((x, y) => this.inv(y).pain - this.inv(x).pain)[0];
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
      const desperate = a.personality.honesty < 0.55 && n.satiete < 0.3 && inv.pain === 0 && inv.pieces < BREAD_PRICE;
      const urge = a.role === 'VOLEUR' ? (n.satiete < 0.6 ? 0.5 : 0.2) : desperate ? 0.35 : 0;
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
    const baker = this.bestBaker(sim, a);
    const broke = inv.pieces < BREAD_PRICE && n.satiete < 0.25;
    if (canShop && n.satiete < 0.55 && inv.pain === 0 && (inv.pieces >= BREAD_PRICE || broke) && baker && baker.id !== a.id && hour < 19) {
      this.nextShop.set(a.id, sim.clock.tick + 30);
      if (this.trip(sim, a, baker.houseId, 'acheter', 0.4)) return;
    }

    // Boulanger et forgeron à court de bois : ils vont en acheter.
    const lowWood = a.role === 'BOULANGER' ? inv.bois < this.batchSize(sim) : inv.bois === 0;
    if (canShop && (a.role === 'BOULANGER' || a.role === 'FORGERON') && lowWood && inv.pieces >= 2 * WOOD_PRICE && hour < 17) {
      this.nextShop.set(a.id, sim.clock.tick + 30);
      const seller = Object.values(sim.world.agents)
        .filter((x) => x.id !== a.id && x.role !== 'BOULANGER' && x.role !== 'FORGERON' && this.inv(x).bois >= 2).sort((x, y) => this.inv(y).bois - this.inv(x).bois)[0];
      if (seller && this.trip(sim, a, seller.houseId, 'acheter', 0.4)) return;
    }

    // Sans le sou pour acheter du bois, le boulanger va le couper lui-même.
    if (a.role === 'BOULANGER' && lowWood && inv.pieces < 2 * WOOD_PRICE && hour >= 8 && hour < 15 && !this.cutToday.has(a.id) && sim.clock.tick >= this.forestClosedUntil) {
      this.cutToday.add(a.id);
      if (this.trip(sim, a, 'foret', 'travail', 1.5)) return;
    }

    // L'aubergiste va chercher le pain du soir à 8 h.
    if (a.role === 'AUBERGISTE' && canShop && hour >= 8 && hour < 10 && inv.pain < 3 && baker && inv.pieces >= 3) {
      this.nextShop.set(a.id, sim.clock.tick + 200);
      if (this.trip(sim, a, baker.houseId, 'acheter', 0.4)) return;
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

    // Le matin, les bûcherons partent en forêt.
    if (WOODCUTTERS.includes(a.role) && hour >= 7 && hour < 11 && !this.cutToday.has(a.id) && sim.clock.tick >= this.forestClosedUntil && Math.random() < 0.35) {
      this.cutToday.add(a.id);
      if (this.trip(sim, a, 'foret', 'travail', 1.5)) return;
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
        if (!owner) break;
        const oi = this.inv(owner);
        if (owner.role === 'BOULANGER') {
          const wanted = a.role === 'AUBERGISTE' ? 4 : 2;
          const qty = Math.min(wanted, oi.pain - BAKER_RESERVE, Math.floor(inv.pieces / BREAD_PRICE));
          if (qty <= 0 && inv.pieces < BREAD_PRICE && oi.pain > BAKER_RESERVE && (owner.opinions[a.id] ?? 0) > -0.1) {
            oi.pain--;
            inv.pain++;
            sim.emit('life.trade', [owner.id, a.id], `🤲 ${owner.name} offre un pain à ${a.name}, qui n’a plus un sou.`, { item: 'pain', qty: 1, gift: true });
            sim.adjustOpinion(a.id, owner.id, 0.15, 'Du pain offert quand je n’avais rien');
            break;
          }
          if (qty > 0) {
            oi.pain -= qty;
            inv.pain += qty;
            inv.pieces -= qty * BREAD_PRICE;
            oi.pieces += qty * BREAD_PRICE;
            sim.emit('life.trade', [a.id, owner.id], `🥖 ${a.name} achète ${qty} pain${qty > 1 ? 's' : ''} chez ${owner.name}.`, { item: 'pain', qty });
          } else {
            sim.emit('life.trade', [a.id, owner.id], `😠 Plus de pain chez ${owner.name} ! ${a.name} repart le ventre vide.`, { item: 'pain', qty: 0 });
            sim.adjustOpinion(a.id, owner.id, -0.05);
            this.nextShop.set(a.id, sim.clock.tick + RETRY_TICKS);
          }
        } else {
          // Achat de bois chez un bûcheron.
          const qty = Math.min(4, oi.bois - 1, Math.floor(inv.pieces / WOOD_PRICE));
          if (qty > 0) {
            oi.bois -= qty;
            inv.bois += qty;
            inv.pieces -= qty * WOOD_PRICE;
            oi.pieces += qty * WOOD_PRICE;
            sim.emit('life.trade', [a.id, owner.id], `🪵 ${a.name} achète ${qty} bûche${qty > 1 ? 's' : ''} à ${owner.name}.`, { item: 'bois', qty });
          }
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
          loss = `${qty} pain${qty > 1 ? 's' : ''} ont disparu`;
        } else if (oi.pieces > 0) {
          const qty = Math.min(3, oi.pieces);
          oi.pieces -= qty;
          inv.pieces += qty;
          loss = `${qty} pièce${qty > 1 ? 's' : ''} ont disparu`;
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
  private meetings(sim: Sim) {
    for (const [place, people] of this.presence(sim)) {
      if (people.length < 2) continue;
      const i = Math.floor(Math.random() * people.length);
      const speaker = people[i];
      const listener = people[(i + 1 + Math.floor(Math.random() * (people.length - 1))) % people.length];
      const where = this.placeName(sim, place);
      const mutual = Math.min(speaker.opinions[listener.id] ?? 0, listener.opinions[speaker.id] ?? 0);
      const rumor = rumorToShare(sim, speaker, listener);
      let line: string;
      if (mutual < -0.4) {
        line = 'Toi, je ne te parle pas.';
        sim.adjustOpinion(speaker.id, listener.id, -0.04);
        sim.adjustOpinion(listener.id, speaker.id, -0.04);
      } else if (rumor && Math.random() < 0.7) {
        const told = tellRumor(sim, speaker, listener, rumor);
        line = `Tu sais quoi ? Il paraît ${que(told.text)}.`;
        sim.emit('rumor.spread', [speaker.id, listener.id], `🗣 ${speaker.name} glisse à ${listener.name} ${que(told.text)}.`, { rumorId: told.id, body: line, true: told.true });
      } else {
        const ex = chooseExchange({
          speaker, listener, mutual, place: where, dayName: dayName(sim.clock.day),
          night: isNight(sim.clock), storm: isActive(sim, 'storm'), flood: isActive(sim, 'flood'),
          mayorName: sim.agent(sim.world.mayorId)?.name ?? '', mayorOpinion: speaker.opinions[sim.world.mayorId] ?? 0,
        });
        line = ex.line;
        sim.adjustOpinion(speaker.id, listener.id, ex.bond);
        sim.adjustOpinion(listener.id, speaker.id, ex.bond);
        if (ex.reply) {
          sim.emit('life.meet', [speaker.id, listener.id], `🗨 ${speaker.name} à ${listener.name} (${where}) : « ${line} »`, { body: line, place });
          line = '';
          sim.emit('life.meet', [listener.id, speaker.id], `🗨 ${listener.name} répond : « ${ex.reply} »`, { body: ex.reply, place });
          sim.remember(listener.id, speaker.id, 'in', ex.line);
          continue;
        }
      }
      sim.emit('life.meet', [speaker.id, listener.id], `🗨 ${speaker.name} à ${listener.name} (${where}) : « ${line} »`, { body: line, place });
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
    if (cal) {
      this.todays.push({
        hour: cal.hour,
        done: false,
        ev: {
          id: `calendrier-${today}`,
          weight: 0,
          run: (_s, h) => {
            h.gather(cal.hour, cal.until);
            h.moodAll(cal.mood);
            return cal.text;
          },
        },
      });
    }
  }

  /** Une fête sur la place le lendemain à 17 h (mariage, naissance…). */
  scheduleParty(sim: Sim, reason: string) {
    this.party = { day: sim.clock.day + 1, hour: 17, reason };
  }

  private startParty(sim: Sim) {
    const reason = this.party?.reason ?? 'rien de spécial';
    this.party = null;
    sim.emit('party', [], `🎉 Fête sur la place : ${reason} ! Tout le village est invité.`, { reason });
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
    sim.emit('agent.left', [id], `🧳 ${a.name} quitte le village après le verdict.`, { agentId: id });
    if (w.mayorId === id) {
      const next = Object.values(w.agents)[0];
      if (next) w.mayorId = next.id;
    }
    sim.broadcastPatch({ houses: w.houses, mayorId: w.mayorId });
    sim.touchAgents();
  }
}

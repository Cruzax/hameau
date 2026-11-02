import type { Agent, AgentId, Good, WorldState, Workplace, WorkplaceKind } from '@hameau/shared';
import type { Sim } from './Sim';
import { newWorkplace } from './god';
import {
  BAKERY_RESERVE, BREAD_PER_FLOUR, BREAD_PER_PURCHASE, BREAD_PER_WOOD, FIRE_AFTER_ABSENCES, FIRE_AFTER_UNPAID_DAYS, GIFTS_PER_DAY,
  OUTPUT_PER_WORKER, PRICES, SUBSISTENCE_BREAD, SWITCH_IF_BETTER_BY, TILL_FLOAT, WAGES,
  OUTPUT_GOOD, OWNER_KEEPS, OWNER_REFILL, STOCK_CAP, VILLAGE_TILL_FLOOR,
  BANKRUPT_AFTER_DAYS, BREAD_NEED_PER_PERSON, BREAD_PER_SLOT, ESSENTIAL, FOUNDING_COST, GROWTH_WEIGHT,
} from './economyConfig';

/** Qui achète quoi à qui, et combien par employé (stock visé). */
const SUPPLY: { buyer: WorkplaceKind; good: Good; seller: WorkplaceKind; perWorker: number }[] = [
  { buyer: 'moulin', good: 'ble', seller: 'ferme', perWorker: OUTPUT_PER_WORKER.farine },
  { buyer: 'boulangerie', good: 'farine', seller: 'moulin', perWorker: OUTPUT_PER_WORKER.pain / BREAD_PER_FLOUR },
  { buyer: 'boulangerie', good: 'bois', seller: 'scierie', perWorker: OUTPUT_PER_WORKER.pain / BREAD_PER_WOOD },
  { buyer: 'forge', good: 'bois', seller: 'scierie', perWorker: OUTPUT_PER_WORKER.outils },
];

const invOf = (a: Agent) => (a.inventory ??= { pain: 1, bois: 1, outils: 0, pieces: 5 });

// Emplois et salaires : on gagne sa vie dans un lieu de travail, le patron garde le surplus.

const NAMES: Record<string, string> = {
  ferme: 'la ferme', moulin: 'le moulin', scierie: 'la scierie', forge: 'la forge',
  boulangerie: 'la boulangerie', auberge: 'l’auberge', herboristerie: 'l’herboristerie',
};
export const placeName = (wp: Workplace) => NAMES[wp.kind] ?? wp.kind;
const atPlace = (wp: Workplace) => placeName(wp).replace(/^le /, 'au ').replace(/^la /, 'à la ').replace(/^l’/, 'à l’');

/** Un adulte : fondateur, arrivant, ou enfant qui a construit sa maison. */
export function isAdult(w: WorldState, a: Agent) {
  return !a.family?.parentIds.length || w.houses[a.houseId]?.ownerId === a.id;
}

export class Economy {
  /** Présents au travail aujourd'hui (tiré le matin selon l'ardeur). */
  private present = new Set<AgentId>();
  /** Jours d'absence récents, par habitant. */
  private absences = new Map<AgentId, number[]>();
  /** Payés ce soir (pour l'humeur envers le maire). */
  readonly paidToday = new Set<AgentId>();
  /** Soirs d'affilée sans de quoi payer le moindre salaire, par lieu. */
  private brokeDays = new Map<string, number>();
  /** Pains offerts aujourd'hui, par boulangerie. */
  private gifts = new Map<string, number>();

  constructor(
    private readonly rand: () => number = Math.random,
    /** Ouvrir de nouveaux lieux de travail le soir (désactivé dans certains tests). */
    private readonly growth = true,
  ) {}

  jobOf(w: WorldState, agentId: AgentId): Workplace | undefined {
    const id = w.agents[agentId]?.job?.workplaceId;
    return id ? w.workplaces[id] : undefined;
  }

  isPresent(agentId: AgentId) {
    return this.present.has(agentId);
  }

  hire(sim: Sim, agentId: AgentId, workplaceId: string): boolean {
    const w = sim.world;
    const a = w.agents[agentId];
    const wp = w.workplaces[workplaceId];
    if (!a || !wp || wp.workers.length >= wp.slots || wp.workers.includes(agentId)) return false;
    const previous = this.jobOf(w, agentId);
    if (previous) previous.workers = previous.workers.filter((id) => id !== agentId);
    wp.workers.push(agentId);
    a.job = { workplaceId, since: w.clock.day, wage: WAGES[wp.kind] };
    this.absences.delete(agentId);
    const text = previous
      ? `💼 ${a.name} quitte ${placeName(previous)} pour ${placeName(wp)} (${a.job.wage} pièces par jour).`
      : `💼 ${a.name} trouve du travail ${atPlace(wp)} (${a.job.wage} pièces par jour).`;
    sim.emit('job.changed', [agentId], text, { agentId, workplaceId, wage: a.job.wage, hired: true });
    sim.touchAgents();
    return true;
  }

  /** Perte d'emploi (renvoi, faillite, départ). */
  quit(sim: Sim, agentId: AgentId, reason: string) {
    const w = sim.world;
    const a = w.agents[agentId];
    const wp = this.jobOf(w, agentId);
    if (!a) return;
    if (wp) wp.workers = wp.workers.filter((id) => id !== agentId);
    delete a.job;
    this.present.delete(agentId);
    sim.emit('job.changed', [agentId], `📉 ${a.name} perd son emploi${wp ? ` ${atPlace(wp)}` : ''} : ${reason}.`, { agentId, workplaceId: wp?.id, lost: true });
    sim.touchAgents();
  }

  /** Le matin : embauches, changements d'emploi, puis qui va travailler aujourd'hui. */
  morning(sim: Sim) {
    const w = sim.world;
    const day = w.clock.day;
    // Un lieu vide passe avant tout (sinon personne ne va à la ferme, la moins payée), puis le meilleur salaire.
    const open = () => Object.values(w.workplaces).filter((wp) => wp.workers.length < wp.slots)
      .sort((x, y) => Number(y.workers.length === 0) - Number(x.workers.length === 0) || WAGES[y.kind] - WAGES[x.kind]);
    for (const a of Object.values(w.agents)) {
      if (!isAdult(w, a)) continue;
      const current = this.jobOf(w, a.id);
      if (a.job && !current) continue; // emploi hors des lieux de travail (cas des tests) : on n'y touche pas
      const best = open()[0];
      if (!best) continue;
      // On ne laisse pas un lieu sans personne pour gagner un peu plus ailleurs.
      const canLeave = current && current.workers.length > 1;
      if (!current || (canLeave && WAGES[best.kind] >= WAGES[current.kind] + SWITCH_IF_BETTER_BY)) this.hire(sim, a.id, best.id);
    }
    // Le potager : un pain par jour pour qui n'a pas d'emploi (enfants compris).
    for (const a of Object.values(w.agents)) if (!a.job) invOf(a).pain += SUBSISTENCE_BREAD;
    this.gifts.clear();
    this.present.clear();
    for (const wp of Object.values(w.workplaces)) {
      for (const id of [...wp.workers]) {
        const a = w.agents[id];
        if (!a) {
          wp.workers = wp.workers.filter((x) => x !== id);
          continue;
        }
        if (this.rand() < 0.6 + 0.4 * (a.personality.diligence ?? 0.5)) {
          this.present.add(id);
          continue;
        }
        const recent = [...(this.absences.get(id) ?? []).filter((d) => d > day - 7), day];
        this.absences.set(id, recent);
        if (recent.length >= FIRE_AFTER_ABSENCES) this.quit(sim, id, 'renvoi pour absences répétées');
      }
    }
  }

  /** Boulangerie la mieux fournie. */
  bestBakery(w: WorldState): Workplace | undefined {
    return Object.values(w.workplaces).filter((wp) => wp.kind === 'boulangerie').sort((x, y) => (y.stock.pain ?? 0) - (x.stock.pain ?? 0))[0];
  }

  /** Achat de pain à la boulangerie la mieux fournie ; un affamé sans le sou reçoit un pain. Rend le nombre de pains obtenus. */
  buyBread(sim: Sim, a: Agent): number {
    const bakery = this.bestBakery(sim.world);
    if (!bakery) return 0;
    const inv = invOf(a);
    const stock = bakery.stock.pain ?? 0;
    const qty = Math.min(BREAD_PER_PURCHASE, stock - BAKERY_RESERVE, Math.floor(inv.pieces / PRICES.pain));
    if (qty > 0) {
      bakery.stock.pain = stock - qty;
      inv.pain += qty;
      inv.pieces -= qty * PRICES.pain;
      bakery.till += qty * PRICES.pain;
      sim.emit('life.trade', [a.id], `🥖 ${a.name} achète ${qty} pain${qty > 1 ? 's' : ''} à la boulangerie.`, { item: 'pain', qty, workplaceId: bakery.id });
      return qty;
    }
    const given = this.gifts.get(bakery.id) ?? 0;
    const starving = (a.needs?.satiete ?? 1) < 0.25 && inv.pieces < PRICES.pain;
    if (starving && stock > BAKERY_RESERVE && given < GIFTS_PER_DAY) {
      bakery.stock.pain = stock - 1;
      inv.pain++;
      this.gifts.set(bakery.id, given + 1);
      const baker = bakery.workers.map((id) => sim.world.agents[id]).find(Boolean);
      sim.emit('life.trade', [a.id, ...(baker ? [baker.id] : [])], `🤲 ${baker ? baker.name : 'La boulangerie'} offre un pain à ${a.name}, qui n’a plus un sou.`, { item: 'pain', qty: 1, gift: true });
      if (baker) sim.adjustOpinion(a.id, baker.id, 0.15, 'Du pain offert quand je n’avais rien');
      return 1;
    }
    return 0;
  }

  /**
   * Pour que l'argent ne reste pas coincé dans les poches : le village renfloue ses propres lieux,
   * et un patron renfloue le sien de sa poche (une mauvaise affaire l'appauvrit).
   */
  refinance(sim: Sim) {
    const w = sim.world;
    for (const wp of Object.values(w.workplaces)) {
      const owner = wp.ownerId ? w.agents[wp.ownerId] : undefined;
      if (!owner) {
        if (wp.till < VILLAGE_TILL_FLOOR) wp.till = VILLAGE_TILL_FLOOR;
        continue;
      }
      const purse = invOf(owner);
      const put = Math.min(OWNER_REFILL - wp.till, purse.pieces - OWNER_KEEPS);
      if (put > 0) {
        purse.pieces -= put;
        wp.till += put;
      }
    }
  }

  /** Les lieux de travail se fournissent les uns chez les autres, de caisse à caisse. */
  trade(sim: Sim) {
    const w = sim.world;
    for (const { buyer, good, seller, perWorker } of SUPPLY) {
      for (const b of Object.values(w.workplaces).filter((x) => x.kind === buyer)) {
        const want = Math.ceil(perWorker * Math.max(1, b.workers.length)) - (b.stock[good] ?? 0);
        for (const s of Object.values(w.workplaces).filter((x) => x.kind === seller).sort((x, y) => (y.stock[good] ?? 0) - (x.stock[good] ?? 0))) {
          const qty = Math.min(want, s.stock[good] ?? 0, Math.floor(b.till / PRICES[good]));
          if (qty <= 0) continue;
          s.stock[good] = (s.stock[good] ?? 0) - qty;
          b.stock[good] = (b.stock[good] ?? 0) + qty;
          b.till -= qty * PRICES[good];
          s.till += qty * PRICES[good];
          break;
        }
      }
    }
  }

  /** Fin de journée de travail : chaque lieu produit selon ses employés présents et ses réserves. */
  produce(sim: Sim) {
    const w = sim.world;
    for (const wp of Object.values(w.workplaces)) {
      const n = wp.workers.filter((id) => this.present.has(id)).length;
      if (!n) continue;
      const st = wp.stock;
      // Greniers pleins : on ne produit plus (le pain, lui, se garde selon la taille du village).
      const cap = wp.kind === 'boulangerie' ? Math.max(24, Object.keys(w.agents).length * 3) : STOCK_CAP;
      const output = OUTPUT_GOOD[wp.kind];
      if (output && (st[output] ?? 0) >= cap) continue;
      const add = (g: Good, q: number) => (st[g] = (st[g] ?? 0) + q);
      switch (wp.kind) {
        case 'ferme': add('ble', OUTPUT_PER_WORKER.ble * n); break;
        case 'scierie': add('bois', OUTPUT_PER_WORKER.bois * n); break;
        case 'moulin': {
          const q = Math.min(st.ble ?? 0, OUTPUT_PER_WORKER.farine * n);
          add('ble', -q);
          add('farine', q);
          break;
        }
        case 'boulangerie': {
          const q = Math.min(OUTPUT_PER_WORKER.pain * n, (st.farine ?? 0) * BREAD_PER_FLOUR, (st.bois ?? 0) * BREAD_PER_WOOD);
          if (q <= 0) break;
          add('farine', -Math.ceil(q / BREAD_PER_FLOUR));
          add('bois', -Math.ceil(q / BREAD_PER_WOOD));
          add('pain', q);
          sim.emit('life.work', wp.workers.filter((id) => this.present.has(id)), `🍞 La boulangerie sort ${q} pains du four.`, { work: 'pain', qty: q, workplaceId: wp.id });
          break;
        }
        case 'forge': {
          const q = Math.min(st.bois ?? 0, OUTPUT_PER_WORKER.outils * n);
          add('bois', -q);
          add('outils', q);
          break;
        }
      }
    }
  }

  /** Le soir : commerce, production, puis paie ; caisse vide trop longtemps = renvoi ; surplus au patron. */
  evening(sim: Sim) {
    const w = sim.world;
    this.refinance(sim);
    this.trade(sim);
    this.produce(sim);
    this.paidToday.clear();
    for (const wp of Object.values(w.workplaces)) {
      let unpaid = false;
      for (const id of wp.workers) {
        const a = w.agents[id];
        if (!a?.job || !this.present.has(id)) continue;
        if (wp.till >= a.job.wage) {
          wp.till -= a.job.wage;
          const inv = (a.inventory ??= { pain: 1, bois: 1, outils: 0, pieces: 5 });
          inv.pieces += a.job.wage;
          this.paidToday.add(id);
        } else unpaid = true;
      }
      wp.unpaidDays = unpaid ? wp.unpaidDays + 1 : 0;
      if (wp.unpaidDays >= FIRE_AFTER_UNPAID_DAYS && wp.workers.length) {
        this.quit(sim, wp.workers[wp.workers.length - 1], 'plus de quoi payer les salaires');
        wp.unpaidDays = 0;
      }
      // Le patron prend la moitié de ce qui dépasse le fonds de caisse ; un lieu du village garde tout.
      const boss = wp.ownerId ? w.agents[wp.ownerId] : undefined;
      if (boss && wp.till > TILL_FLOAT) {
        const share = Math.floor((wp.till - TILL_FLOAT) / 2);
        invOf(boss).pieces += share;
        wp.till -= share;
      }
      // Caisse vide trop longtemps : faillite.
      const broke = wp.till < Math.min(...Object.values(WAGES)) ? (this.brokeDays.get(wp.id) ?? 0) + 1 : 0;
      this.brokeDays.set(wp.id, broke);
      if (broke >= BANKRUPT_AFTER_DAYS) this.close(sim, wp);
    }
    if (this.growth) this.grow(sim);
  }

  /** Faillite : tout le monde perd son emploi, le bâtiment reste vide (un futur lieu pourra le reprendre). */
  close(sim: Sim, wp: Workplace) {
    const w = sim.world;
    for (const id of [...wp.workers]) this.quit(sim, id, `${placeName(wp)} ferme ses portes`);
    delete w.workplaces[wp.id];
    this.brokeDays.delete(wp.id);
    sim.emit('workplace.closed', wp.ownerId ? [wp.ownerId] : [], `🔒 Faillite : ${placeName(wp)} ferme ses portes, faute d’argent.`, { workplaceId: wp.id, kind: wp.kind });
    sim.broadcastPatch({ workplaces: w.workplaces });
  }

  /**
   * Un lieu de travail de plus, au plus un par soir : d'abord ce qui manque pour faire du pain,
   * puis, s'il y a trop de sans-emploi et plus de place nulle part, le métier le moins représenté.
   */
  grow(sim: Sim) {
    const w = sim.world;
    const count = (k: WorkplaceKind) => Object.values(w.workplaces).filter((x) => x.kind === k).length;
    let kind = ESSENTIAL.find((k) => !count(k));
    // Pas assez de pain possible pour tout le monde : le maillon le plus faible de la chaîne s'agrandit.
    if (!kind) {
      const need = Object.keys(w.agents).length * BREAD_NEED_PER_PERSON;
      const capacity = (k: WorkplaceKind) => Object.values(w.workplaces).filter((x) => x.kind === k).reduce((n, x) => n + x.slots, 0) * BREAD_PER_SLOT[k]!;
      const weakest = ESSENTIAL.map((k) => ({ k, ratio: capacity(k) / need })).sort((a, b) => a.ratio - b.ratio)[0];
      if (weakest.ratio < 1) kind = weakest.k;
    }
    if (!kind) {
      const jobless = Object.values(w.agents).filter((a) => isAdult(w, a) && !a.job).length;
      const openSlot = Object.values(w.workplaces).some((x) => x.workers.length < x.slots);
      if (jobless > 2 && !openSlot) kind = (Object.keys(GROWTH_WEIGHT) as WorkplaceKind[]).sort((x, y) => count(x) / GROWTH_WEIGHT[x]! - count(y) / GROWTH_WEIGHT[y]!)[0];
    }
    if (!kind) return;
    const founder = Object.values(w.agents).filter((a) => isAdult(w, a) && invOf(a).pieces >= FOUNDING_COST).sort((x, y) => invOf(y).pieces - invOf(x).pieces)[0];
    newWorkplace(sim, kind, founder?.id ?? null);
  }
}

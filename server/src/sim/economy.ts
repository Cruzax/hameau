import type { Agent, AgentId, WorldState, Workplace } from '@hameau/shared';
import type { Sim } from './Sim';
import { FIRE_AFTER_ABSENCES, FIRE_AFTER_UNPAID_DAYS, SWITCH_IF_BETTER_BY, TILL_FLOAT, WAGES } from './economyConfig';

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

  constructor(private readonly rand: () => number = Math.random) {}

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
    const open = () => Object.values(w.workplaces).filter((wp) => wp.workers.length < wp.slots).sort((x, y) => WAGES[y.kind] - WAGES[x.kind]);
    for (const a of Object.values(w.agents)) {
      if (!isAdult(w, a)) continue;
      const current = this.jobOf(w, a.id);
      if (a.job && !current) continue; // emploi hors des lieux de travail (cas des tests) : on n'y touche pas
      const best = open()[0];
      if (!best) continue;
      if (!current || WAGES[best.kind] >= WAGES[current.kind] + SWITCH_IF_BETTER_BY) this.hire(sim, a.id, best.id);
    }
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

  /** Le soir : chacun est payé s'il a travaillé ; caisse vide trop longtemps = renvoi ; surplus au patron. */
  evening(sim: Sim) {
    const w = sim.world;
    for (const wp of Object.values(w.workplaces)) {
      let unpaid = false;
      for (const id of wp.workers) {
        const a = w.agents[id];
        if (!a?.job || !this.present.has(id)) continue;
        if (wp.till >= a.job.wage) {
          wp.till -= a.job.wage;
          const inv = (a.inventory ??= { pain: 1, bois: 1, outils: 0, pieces: 5 });
          inv.pieces += a.job.wage;
        } else unpaid = true;
      }
      wp.unpaidDays = unpaid ? wp.unpaidDays + 1 : 0;
      if (wp.unpaidDays >= FIRE_AFTER_UNPAID_DAYS && wp.workers.length) {
        this.quit(sim, wp.workers[wp.workers.length - 1], 'plus de quoi payer les salaires');
        wp.unpaidDays = 0;
      }
      // Le patron (ou, pour un lieu du village, le maire) empoche le surplus.
      const bossId = wp.ownerId ?? w.mayorId;
      const boss = w.agents[bossId];
      if (boss && wp.till > TILL_FLOAT) {
        const inv = (boss.inventory ??= { pain: 1, bois: 1, outils: 0, pieces: 5 });
        inv.pieces += wp.till - TILL_FLOAT;
        wp.till = TILL_FLOAT;
      }
    }
  }
}

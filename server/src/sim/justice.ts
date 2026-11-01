import { dayFraction, type AgentId } from '@hameau/shared';
import type { Sim } from './Sim';
import { createRumor } from './rumors';

// Vols, enquête du garde et procès sur la place. Le coupable désigné n'est pas toujours le bon.

interface Case {
  id: string;
  victim: AgentId;
  loss: string;
  culprit: AgentId;           // la vérité, que personne ne connaît
  suspicion: Record<AgentId, number>;
  openedDay: number;
  status: 'enquete' | 'proces' | 'clos';
  accused?: AgentId;
}

const TRIAL_HOUR = 18;
const VERDICT_HOUR = 19;

export class Justice {
  cases: Case[] = [];

  get open() {
    return this.cases.find((c) => c.status !== 'clos');
  }

  /** Le voleur a frappé cette nuit ; des témoins ont peut-être vu quelque chose. */
  recordTheft(sim: Sim, thief: AgentId, victim: AgentId, loss: string) {
    const c: Case = { id: `c${this.cases.length + 1}`, victim, loss, culprit: thief, suspicion: {}, openedDay: sim.clock.day + 1, status: 'enquete' };
    const others = Object.keys(sim.world.agents).filter((id) => id !== thief && id !== victim);
    // Témoins : un garde en ronde, ou un voisin insomniaque. Ils peuvent se tromper.
    for (const id of Object.keys(sim.world.agents)) {
      if (id === thief || id === victim) continue;
      const a = sim.agent(id);
      const awake = a.role === 'GARDE' ? Math.random() < 0.3 : Math.random() < 0.08;
      if (!awake) continue;
      const seen = Math.random() < 0.6 ? thief : others[Math.floor(Math.random() * others.length)];
      if (!seen) continue;
      c.suspicion[seen] = (c.suspicion[seen] ?? 0) + 2;
      createRumor(sim, id, 'rodeur', seen, seen === thief, victim);
      sim.remember(id, id, 'in', `Cette nuit, j’ai vu ${sim.agent(seen)?.name} rôder près de chez ${sim.agent(victim)?.name}.`);
    }
    this.cases.push(c);
  }

  /** Au réveil, la victime découvre le vol. */
  onMorning(sim: Sim) {
    const c = this.cases.find((x) => x.status === 'enquete' && x.openedDay === sim.clock.day);
    if (!c) return;
    const victim = sim.agent(c.victim);
    if (!victim) return;
    sim.emit('crime.theft', [c.victim], `🚨 ${victim.name} a été volé·e cette nuit : ${c.loss} !`, { caseId: c.id });
    for (const a of Object.values(sim.world.agents)) a.needs && (a.needs.humeur = Math.max(0, a.needs.humeur - 0.05));
  }

  /** Visite d'enquête du garde chez un suspect. */
  investigate(sim: Sim, garde: AgentId, suspect: AgentId) {
    const c = this.open;
    if (!c || c.status !== 'enquete') return;
    const found = suspect === c.culprit ? Math.random() < 0.55 : Math.random() < 0.15;
    c.suspicion[suspect] = (c.suspicion[suspect] ?? 0) + (found ? 1.5 : 0.2);
    sim.emit('crime.investigate', [garde, suspect],
      `🔎 ${sim.agent(garde).name} fouille chez ${sim.agent(suspect).name}${found ? ' et trouve des miettes suspectes…' : ', sans rien trouver.'}`,
      { caseId: c.id, found });
  }

  /** Qui le garde va interroger : les plus suspects d'abord, puis ceux qu'il aime le moins. */
  nextSuspect(sim: Sim, garde: AgentId): AgentId | undefined {
    const c = this.open;
    if (!c || c.status !== 'enquete') return undefined;
    const g = sim.agent(garde);
    const ids = Object.keys(sim.world.agents).filter((id) => id !== garde && id !== c.victim);
    return ids.sort((a, b) => (c.suspicion[b] ?? 0) - (g.opinions[b] ?? 0) - ((c.suspicion[a] ?? 0) - (g.opinions[a] ?? 0)))[0];
  }

  /** Chaque heure : accusation, procès, verdict. */
  onTick(sim: Sim, hour: number, garde?: AgentId) {
    const c = this.open;
    if (!c) return;
    const h = Math.floor(hour);
    const atTick = (target: number) => sim.dayTick === Math.round(sim.clock.ticksPerDay * dayFraction(target));

    if (c.status === 'enquete' && sim.clock.day > c.openedDay && atTick(TRIAL_HOUR - 1)) {
      const [accused, score] = Object.entries(c.suspicion).sort((a, b) => b[1] - a[1])[0] ?? [];
      if (!accused || score < 1 || !sim.agent(accused)) {
        c.status = 'clos';
        sim.emit('trial.verdict', [garde ?? c.victim], `🤷 L’enquête sur le vol chez ${sim.agent(c.victim)?.name} n’aboutit pas.`, { caseId: c.id });
        return;
      }
      c.accused = accused;
      c.status = 'proces';
      sim.emit('trial.opened', [garde ?? c.victim, accused],
        `⚖️ ${garde ? sim.agent(garde).name : 'Le village'} accuse ${sim.agent(accused).name} du vol ! Procès sur la place à ${TRIAL_HOUR} h.`,
        { caseId: c.id, accused });
      sim.daily.gather(sim, 'proces', TRIAL_HOUR, VERDICT_HOUR + 0.5);
    }

    if (c.status === 'proces' && h === VERDICT_HOUR && atTick(VERDICT_HOUR)) this.verdict(sim, c, garde);
  }

  private verdict(sim: Sim, c: Case, garde?: AgentId) {
    const accused = c.accused && sim.agent(c.accused);
    c.status = 'clos';
    if (!accused) return;
    let guilty = 0;
    let voters = 0;
    for (const a of Object.values(sim.world.agents)) {
      if (a.id === accused.id) continue;
      voters++;
      const credibility = garde ? (a.opinions[garde] ?? 0) * 0.25 : 0;
      const heard = sim.world.rumors.some((r) => r.about === accused.id && r.knownBy.includes(a.id)) ? 0.2 : 0;
      const p = 0.45 - (a.opinions[accused.id] ?? 0) * 0.5 + heard + credibility + (c.suspicion[accused.id] ?? 0) * 0.05;
      if (Math.random() < p) guilty++;
    }
    const condemned = guilty > voters / 2;
    const truth = accused.id === c.culprit;
    sim.emit('trial.verdict', [accused.id, garde ?? accused.id],
      condemned
        ? `⚖️ ${accused.name} est jugé·e coupable (${guilty}/${voters}) et banni·e du village !`
        : `⚖️ ${accused.name} est acquitté·e (${guilty}/${voters}) et rentre chez soi, la tête haute.`,
      { caseId: c.id, condemned, truth });
    if (condemned) {
      if (!truth) for (const a of Object.values(sim.world.agents)) if (a.id === c.culprit) sim.remember(a.id, a.id, 'in', `Ils ont banni ${accused.name} à ma place…`);
      sim.daily.banish(sim, accused.id);
    } else if (garde) {
      sim.adjustOpinion(accused.id, garde, -0.4, 'On m’a accusé·e à tort');
    }
  }
}

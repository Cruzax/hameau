import { dayFraction, de, type AgentId, type Ballot, type Message, type VoteSession } from '@hameau/shared';
import type { Sim } from './Sim';
import { isAdult } from './economy';

/** Le conseil s'ouvre à 10 h et les bulletins doivent être arrivés avant 20 h. */
const OPEN_AT = dayFraction(10);
const CLOSE_AT = dayFraction(20);
/** En dessous de cette opinion du maire, un agent est prêt à proposer sa destitution. */
const MOTION_THRESHOLD = -0.05;

/**
 * Votes de destitution. Tous les N jours, l'agent le plus mécontent peut lancer une motion.
 * Chaque bulletin est porté par un messager jusqu'à la maison du maire (l'urne) : un bulletin
 * qui n'arrive pas à temps, ou qui ne trouve aucune route, ne compte pas.
 */
export class Politics {
  current(sim: Sim): VoteSession | undefined {
    return sim.world.votes.find((v) => v.status === 'open');
  }

  onTick(sim: Sim) {
    const { clock, voteEveryDays } = sim.world;
    const vote = this.current(sim);
    if (vote && clock.tick >= vote.closesTick) this.close(sim, vote);
    else if (!vote && clock.day % voteEveryDays === 0 && sim.dayTick === Math.round(clock.ticksPerDay * OPEN_AT)) this.open(sim);
  }

  /** Jour où le maire actuel a pris ses fonctions (pour l'usure du pouvoir). */
  private mayorSince = 1;
  private lastProposer: string | null = null;

  /** Humeur du village envers le maire, chaque soir : la gazette est son bilan, et le pouvoir use. */
  /**
   * Le soir, chacun juge le maire sur sa propre journée : avoir eu faim, être sans emploi, avoir été payé.
   * Un numéro paru rassure un peu ; une grosse affaire sans numéro passe pour étouffée. Le pouvoir use.
   */
  onDayEnd(sim: Sim, day: { issues: number; stifled: boolean; hungry: Set<string>; paid: Set<string> }) {
    const mayor = sim.world.mayorId;
    const tenure = sim.clock.day - this.mayorSince;
    // Au-delà de six jours, chaque jour de plus agace un peu plus (plafonné).
    const wear = tenure > 6 ? Math.min(0.05, (tenure - 6) * 0.005) : 0;
    for (const a of Object.values(sim.world.agents)) {
      if (a.id === mayor) continue;
      if (day.hungry.has(a.id)) sim.adjustOpinion(a.id, mayor, -0.04, 'J’ai eu faim, et le maire ne fait rien');
      if (!a.job && isAdult(sim.world, a)) sim.adjustOpinion(a.id, mayor, -0.03);
      if (day.paid.has(a.id)) sim.adjustOpinion(a.id, mayor, 0.02);
      if (day.issues) sim.adjustOpinion(a.id, mayor, 0.02 * day.issues);
      if (day.stifled) sim.adjustOpinion(a.id, mayor, -0.05, 'Le maire étouffe l’affaire');
      if (wear) sim.adjustOpinion(a.id, mayor, -wear);
      // Les ambitieux grignotent leur estime du maire, jour après jour.
      sim.adjustOpinion(a.id, mayor, -(a.personality.ambition - 0.3) * 0.1);
    }
  }

  open(sim: Sim, force = false) {
    const w = sim.world;
    const mayor = w.mayorId;
    const others = Object.values(w.agents).filter((a) => a.id !== mayor);
    // Parmi les mécontents, on tire au sort (en évitant le dernier à avoir lancé une motion).
    const unhappy = others.filter((a) => (a.opinions[mayor] ?? 0) <= MOTION_THRESHOLD);
    const pool = unhappy.length > 1 ? unhappy.filter((a) => a.id !== this.lastProposer) : unhappy;
    const proposer = force && !pool.length
      ? others.sort((a, b) => (a.opinions[mayor] ?? 0) - (b.opinions[mayor] ?? 0))[0]
      : pool[Math.floor(Math.random() * pool.length)];
    if (proposer) this.lastProposer = proposer.id;
    if (!proposer || (!force && (proposer.opinions[mayor] ?? 0) > MOTION_THRESHOLD)) {
      sim.emit('vote.opened', [], `🏛 Jour de conseil : personne ne conteste ${sim.agent(mayor).name}.`, { motion: false });
      return;
    }
    const vote: VoteSession = {
      id: `v${w.votes.length + 1}`,
      day: w.clock.day,
      proposerId: proposer.id,
      targetMayorId: mayor,
      candidates: others.map((a) => a.id),
      ballots: [],
      openedTick: w.clock.tick,
      closesTick: w.clock.tick + Math.round(w.clock.ticksPerDay * (CLOSE_AT - OPEN_AT)),
      status: 'open',
    };
    w.votes.push(vote);
    sim.emit('vote.opened', [proposer.id, mayor],
      `🗳️ ${proposer.name} demande la destitution ${de(sim.agent(mayor).name)} ! Les bulletins doivent arriver chez le maire avant 20 h.`,
      { voteId: vote.id });
    sim.touchVotes();
    sim.brain.onVoteOpened?.(sim, vote);
  }

  /** Un agent glisse son bulletin : un messager l'emporte vers l'urne (la maison du maire). */
  cast(sim: Sim, voterId: AgentId, b: Omit<Ballot, 'tick' | 'voterId'>) {
    const vote = this.current(sim);
    if (!vote || vote.ballots.some((x) => x.voterId === voterId)) return;
    const candidateId = b.destitute && b.candidateId && vote.candidates.includes(b.candidateId) ? b.candidateId : undefined;
    const ballot: Ballot = { voterId, destitute: b.destitute, candidateId, reason: b.reason.slice(0, 200), tick: sim.clock.tick };
    sim.emit('vote.cast', [voterId], `✉️ ${sim.agent(voterId).name} envoie son bulletin scellé.`, { voteId: vote.id });
    sim.send(voterId, vote.targetMayorId, 'ballot', '🗳️ Bulletin scellé', { ballot });
  }

  receive(sim: Sim, msg: Message) {
    const vote = this.current(sim);
    const b = msg.ballot;
    if (!b) return;
    const voter = sim.agent(b.voterId)?.name ?? 'Un ancien habitant';
    if (!vote || sim.clock.tick > vote.closesTick) {
      sim.emit('vote.cast', [b.voterId], `⌛ Le bulletin ${de(voter)} arrive trop tard : il ne compte pas.`, { late: true });
      return;
    }
    if (vote.ballots.some((x) => x.voterId === b.voterId)) return;
    vote.ballots.push(b);
    const n = Object.keys(sim.world.agents).length;
    sim.emit('vote.cast', [b.voterId], `📥 Le bulletin ${de(voter)} est dans l’urne (${vote.ballots.length}/${n}).`, { voteId: vote.id });
    sim.touchVotes();
  }

  close(sim: Sim, vote: VoteSession) {
    const w = sim.world;
    const n = Object.keys(w.agents).length;
    // Seuls comptent les bulletins des habitants encore présents (certains ont pu partir pendant le vote).
    const ballots = vote.ballots.filter((b) => w.agents[b.voterId]);
    const yes = ballots.filter((b) => b.destitute);
    const tally: Record<string, number> = { pour: yes.length, contre: ballots.length - yes.length, absents: Math.max(0, n - ballots.length) };
    for (const b of yes) if (b.candidateId) tally[b.candidateId] = (tally[b.candidateId] ?? 0) + 1;
    vote.status = 'closed';

    const old = sim.agent(vote.targetMayorId);
    // Le maire visé a quitté le village (banni) pendant le vote : il n'y a plus rien à trancher.
    if (!old) {
      vote.result = { destituted: false, tally };
      sim.emit('vote.closed', [], '🗳️ Le maire visé a quitté le village : le vote est annulé.', { voteId: vote.id, tally, cancelled: true });
      sim.touchAgents();
      return;
    }
    // Majorité absolue du village : un bulletin perdu en route compte comme un soutien au maire.
    const destituted = yes.length > n / 2;
    let newMayorId: AgentId | undefined;
    if (destituted) {
      const ranked = vote.candidates
        .filter((id) => w.agents[id]) // un candidat parti pendant le vote ne compte plus
        .map((id) => ({ id, votes: tally[id] ?? 0, esteem: this.esteem(sim, id) }))
        .sort((a, b) => b.votes - a.votes || b.esteem - a.esteem);
      newMayorId = ranked[0]?.id;
    }
    vote.result = { destituted: !!newMayorId, newMayorId, tally };

    sim.emit('vote.closed', [old.id], `🗳️ Dépouillement : ${yes.length} pour, ${tally.contre} contre, ${tally.absents} bulletin(s) manquant(s).`, { voteId: vote.id, tally });
    if (newMayorId) {
      const next = sim.agent(newMayorId);
      w.mayorId = newMayorId;
      this.mayorSince = w.clock.day;
      if (old.role === 'MAIRE') old.role = 'CITOYEN';
      sim.emit('mayor.elected', [newMayorId, old.id], `👑 ${next.name} devient maire ! ${old.name} perd l’écharpe.`, { voteId: vote.id });
      sim.adjustOpinion(old.id, newMayorId, -0.3, 'Usurpateur !');
      for (const b of yes) if (b.candidateId === newMayorId) sim.adjustOpinion(newMayorId, b.voterId, 0.1);
    } else {
      sim.emit('mayor.elected', [old.id], `👑 ${old.name} reste maire.`, { voteId: vote.id, kept: true });
      for (const b of yes) sim.adjustOpinion(old.id, b.voterId, -0.2, 'Je n’oublierai pas qui a voté contre moi.');
    }
    sim.touchAgents();
    sim.touchVotes();
  }

  /** Estime moyenne que le village porte à un agent (départage les égalités). */
  private esteem(sim: Sim, id: AgentId) {
    const xs = Object.values(sim.world.agents).filter((a) => a.id !== id).map((a) => a.opinions[id] ?? 0);
    return xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  }
}

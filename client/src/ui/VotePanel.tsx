import { ROLE_COLOR } from '@hameau/shared';
import { useHameau } from '../net/store';

/** Carte du vote en cours (ou du dernier résultat, le jour même) : qui a voté, résultat. */
export function VotePanel() {
  const votes = useHameau((s) => s.world.votes);
  const agents = useHameau((s) => s.world.agents);
  const day = useHameau((s) => s.world.clock.day);
  const vote = votes[votes.length - 1];
  if (!vote || (vote.status === 'closed' && vote.day !== day)) return null;

  const name = (id?: string) => (id ? agents[id]?.name ?? id : '');
  const arrived = new Set(vote.ballots.map((b) => b.voterId));
  const r = vote.result;

  return (
    <div className={`vote ${vote.status === 'open' ? 'vote--open' : ''}`}>
      <div className="vote__kicker">{vote.status === 'open' ? 'Conseil en cours' : 'Résultat du conseil'}</div>
      <div className="vote__title">
        {vote.status === 'open' ? (
          <>
            {name(vote.proposerId)} veut destituer {name(vote.targetMayorId)}
          </>
        ) : r?.destituted ? (
          <>👑 {name(r.newMayorId)} devient maire</>
        ) : (
          <>{name(vote.targetMayorId)} reste maire</>
        )}
      </div>
      <div className="vote__urn">
        {Object.values(agents).map((a) => (
          <span key={a.id} className={`vote__ballot ${arrived.has(a.id) ? 'is-in' : ''}`} style={{ borderColor: ROLE_COLOR[a.role] }} title={a.name}>
            {arrived.has(a.id) ? '✉️' : '…'} {a.name}
          </span>
        ))}
      </div>
      {r && (
        <div className="vote__tally">
          {r.tally.pour ?? 0} pour · {r.tally.contre ?? 0} contre · {r.tally.absents ?? 0} manquant(s)
        </div>
      )}
    </div>
  );
}

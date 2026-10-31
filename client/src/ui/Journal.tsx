import { useState } from 'react';
import { ROLE_COLOR, type SimEvent } from '@hameau/shared';
import { useHameau } from '../net/store';
import { SERVER_HTTP } from '../net/socket';
import { replayFile, startReplay } from '../net/replay';

/** Rejoue depuis un événement : on récupère le journal complet du serveur. */
async function replayFrom(seq: number) {
  const res = await fetch(`${SERVER_HTTP}/journal.json`);
  startReplay((await res.json()) as SimEvent[], seq);
}

const QUIET: SimEvent['type'][] = ['message.delivered', 'llm.call'];

/** Journal d'événements horodaté ; exportable en JSON pour scénariser les vidéos. */
export function Journal() {
  const events = useHameau((s) => s.events);
  const agents = useHameau((s) => s.world.agents);
  const gazettes = useHameau((s) => s.world.gazettes);
  const connected = useHameau((s) => s.connected);
  const mode = useHameau((s) => s.mode);
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const shown = events.filter((e) => showAll || !QUIET.includes(e.type)).slice(-80).reverse();
  const last = gazettes[gazettes.length - 1];

  return (
    <aside className={`journal ${open ? '' : 'journal--closed'}`}>
      <header className="journal__head">
        <button className="journal__toggle" onClick={() => setOpen(!open)}>
          {open ? '›' : '‹'} Journal
        </button>
        {open && (
          <>
            <label className="journal__opt">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> tout
            </label>
            <a className={`journal__export ${connected ? '' : 'is-disabled'}`} href={`${SERVER_HTTP}/journal.json`}>
              Exporter JSON
            </a>
            <label className="journal__import" title="Rejouer un journal exporté">
              📂
              <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && replayFile(e.target.files[0])} />
            </label>
          </>
        )}
      </header>
      {open && (
        <>
          {last && (
            <div className="journal__gazette">
              <div className="journal__gazette-kicker">Gazette du jour {last.day}</div>
              <div className="journal__gazette-title">{last.headline}</div>
              {last.articles[0]?.body && <div className="journal__gazette-body">{last.articles[0].body}</div>}
              {last.review && <div className="journal__gazette-review">« {last.review.text} »</div>}
            </div>
          )}
          <ol className="journal__list">
            {shown.map((e) => {
              const who = agents[e.actors[0]];
              return (
                <li key={e.seq} className={`journal__item journal__item--${e.type.split('.')[0]}`} style={{ borderLeftColor: who ? ROLE_COLOR[who.role] : undefined }}>
                  <span className="journal__time">J{e.day}·{e.tick}</span>
                  {e.text}
                  {connected && mode === 'live' && (
                    <button className="journal__replay" title="Rejouer à partir d’ici" onClick={() => replayFrom(e.seq)}>
                      ▶
                    </button>
                  )}
                </li>
              );
            })}
            {!shown.length && <li className="journal__empty">{connected ? 'En attente des premiers événements…' : 'Serveur hors ligne — lance « npm run dev ».'}</li>}
          </ol>
        </>
      )}
    </aside>
  );
}

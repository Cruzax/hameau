import { useState } from 'react';
import { ROLE_COLOR, type SimEvent } from '@hameau/shared';
import { useHameau } from '../net/store';
import { SERVER_HTTP } from '../net/socket';
import { replayFile, startReplay } from '../net/replay';
import { Panel } from './Panel';

/** Rejoue depuis un événement : on récupère le journal complet du serveur. */
async function replayFrom(seq: number) {
  const res = await fetch(`${SERVER_HTTP}/journal.json`);
  startReplay((await res.json()) as SimEvent[], seq);
}

/** Lignes masquées par défaut (case « tout ») : trop fréquentes pour être lues. */
const QUIET: SimEvent['type'][] = ['message.delivered', 'llm.call', 'life.trip', 'life.trade', 'agent.opinion'];

/** Journal d'événements horodaté ; exportable en JSON pour scénariser les vidéos. */
export function Journal() {
  const events = useHameau((s) => s.events);
  const agents = useHameau((s) => s.world.agents);
  const connected = useHameau((s) => s.connected);
  const mode = useHameau((s) => s.mode);
  const [showAll, setShowAll] = useState(false);

  const shown = events.filter((e) => showAll || !QUIET.includes(e.type)).slice(-120).reverse();

  return (
    <Panel
      id="journal"
      icon="📜"
      title="Journal"
      minW={260}
      actions={
        <>
          <label className="chip" title="Afficher aussi les livraisons et les appels à l’IA">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> tout
          </label>
          <a className={`chip chip--dark ${connected ? '' : 'is-disabled'}`} href={`${SERVER_HTTP}/journal.json`} title="Télécharger le journal (script des vidéos)">
            ⬇ JSON
          </a>
          <label className="chip" title="Rejouer un journal exporté">
            📂
            <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && replayFile(e.target.files[0])} />
          </label>
        </>
      }
    >
      <ol className="journal__list">
        {shown.map((e) => {
          const who = agents[e.actors[0]];
          return (
            <li
              key={e.seq}
              className={`journal__item journal__item--${e.type.split('.')[0]}`}
              style={{ borderLeftColor: who ? ROLE_COLOR[who.role] : undefined }}
            >
              <span className="journal__time">
                J{e.day}·{e.tick}
              </span>
              {e.text}
              {connected && mode === 'live' && (
                <button className="journal__replay" title="Rejouer à partir d’ici" onClick={() => replayFrom(e.seq)}>
                  ▶
                </button>
              )}
            </li>
          );
        })}
        {!shown.length && (
          <li className="journal__empty">{connected ? 'En attente des premiers événements…' : 'Serveur hors ligne — lance « npm run dev ».'}</li>
        )}
      </ol>
    </Panel>
  );
}

/** Les gazettes parues, la plus récente en haut. */
export function GazettePanel() {
  const gazettes = useHameau((s) => s.world.gazettes);
  const agents = useHameau((s) => s.world.agents);
  const name = (id?: string) => (id ? agents[id]?.name ?? '?' : undefined);

  return (
    <Panel id="gazette" icon="📰" title="La Gazette" minW={240}>
      {!gazettes.length && <p className="panel__empty">Pas encore de gazette. Le maire attend un sujet…</p>}
      {[...gazettes].reverse().map((g) => (
        <article key={g.day} className="gazette">
          <div className="gazette__kicker">Jour {g.day}{g.approvedBy ? ` · validée par ${name(g.approvedBy)}` : ''}</div>
          <h4 className="gazette__title">{g.headline}</h4>
          {g.articles[0]?.body && <p className="gazette__body">{g.articles[0].body}</p>}
          {g.review && (
            <p className="gazette__review">
              « {g.review.text} » — {name(g.review.by)}
            </p>
          )}
        </article>
      ))}
    </Panel>
  );
}

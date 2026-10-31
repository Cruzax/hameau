import { useEffect, useState } from 'react';
import type { SimEvent } from '@hameau/shared';
import { useHameau } from '../net/store';

/** Événements assez parlants pour devenir un sous-titre de vidéo. */
const CAPTIONED: SimEvent['type'][] = [
  'message.sent', 'message.lost', 'message.relayed', 'agent.thought', 'agent.opinion', 'gazette.published',
  'vote.opened', 'vote.closed', 'mayor.elected', 'road.cut', 'road.added', 'road.built',
  'god.inject', 'agent.added', 'agent.left', 'day.start',
  'couple.formed', 'couple.split', 'agent.born', 'house.built',
];
const HOLD_MS = 4200;

/** Sous-titre du dernier événement marquant, en gros, pour les reels. */
export function Captions() {
  const events = useHameau((s) => s.events);
  const last = [...events].reverse().find((e) => CAPTIONED.includes(e.type));
  const [shownAt, setShownAt] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => setShownAt(performance.now()), [last?.seq]);
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 300);
    return () => clearInterval(id);
  }, []);

  if (!last || now - shownAt > HOLD_MS) return null;
  return (
    <div className="captions" key={last.seq}>
      {last.text.replace(/^💭\s*/, '')}
    </div>
  );
}

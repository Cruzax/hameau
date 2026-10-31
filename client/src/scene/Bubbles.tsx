import { useEffect, useState } from 'react';
import { Html } from '@react-three/drei';
import { ROLE_COLOR } from '@hameau/shared';
import { useHameau } from '../net/store';
import { agentSpot } from './spots';

const MAX_CHARS = 110;

/** Bulles de dialogue au-dessus des habitants (paroles, pensées, annonces). */
export function Bubbles() {
  const bubbles = useHameau((s) => s.bubbles);
  const world = useHameau((s) => s.world);
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {Object.values(bubbles)
        .filter((b) => b.until > now)
        .map((b) => {
          const agent = world.agents[b.agentId];
          const spot = agentSpot(world, b.agentId);
          if (!agent || !spot) return null;
          const [x, , z] = spot;
          const text = b.text.length > MAX_CHARS ? b.text.slice(0, MAX_CHARS - 1) + '…' : b.text;
          return (
            <Html key={b.id} position={[x, 1.6, z]} zIndexRange={[15, 11]} style={{ pointerEvents: 'none' }}>
              <div className={`bubble bubble--${b.kind}`} style={{ borderColor: ROLE_COLOR[agent.role] }}>
                {b.kind === 'think' ? <em>{text}</em> : text}
              </div>
            </Html>
          );
        })}
    </>
  );
}

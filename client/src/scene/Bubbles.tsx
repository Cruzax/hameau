import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group } from 'three';
import { ROLE_COLOR } from '@hameau/shared';
import { useHameau, type Bubble } from '../net/store';
import { agentPose } from './spots';
import { currentTick } from './effectLevel';

const MAX_CHARS = 110;

/** Une bulle accrochée à son habitant : elle le suit quand il marche. */
function FollowingBubble({ b, color }: { b: Bubble; color: string }) {
  const root = useRef<Group>(null);
  useFrame(() => {
    const pose = agentPose(useHameau.getState().world, b.agentId, currentTick());
    if (pose && root.current) root.current.position.set(pose.x, pose.y, pose.z);
  });
  const text = b.text.length > MAX_CHARS ? b.text.slice(0, MAX_CHARS - 1) + '…' : b.text;
  return (
    <group ref={root}>
      <Html position={[0, 1.6, 0]} zIndexRange={[15, 11]} style={{ pointerEvents: 'none' }}>
        <div className={`bubble bubble--${b.kind}`} style={{ borderColor: color }}>
          {b.kind === 'think' ? <em>{text}</em> : text}
        </div>
      </Html>
    </group>
  );
}

/** Bulles de dialogue au-dessus des habitants (paroles, pensées, annonces). */
export function Bubbles() {
  const bubbles = useHameau((s) => s.bubbles);
  const agents = useHameau((s) => s.world.agents);
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {Object.values(bubbles)
        .filter((b) => b.until > now && agents[b.agentId])
        .map((b) => (
          <FollowingBubble key={b.id} b={b} color={ROLE_COLOR[agents[b.agentId].role]} />
        ))}
    </>
  );
}

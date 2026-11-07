import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group } from 'three';
import { ROLE_COLOR, dist, type Vec2 } from '@hameau/shared';
import { useHameau, type Ribbon } from '../net/store';
import { agentPose } from './spots';
import { currentTick } from './effectLevel';

// Les paroles en rubans : chaque réplique apparaît au-dessus de qui parle, puis la suivante la pousse vers le haut.
// Une conversation se lit ainsi comme un fil qui monte, réplique après réplique.

const MAX_CHARS = 110;
/** Deux répliques à moins de cette distance appartiennent au même fil. */
const SAME_THREAD = 5;
/** Hauteur du premier ruban, écart entre deux rubans, et montée lente avec le temps. */
const BASE_Y = 1.7;
const STEP_Y = 0.8;
const DRIFT_Y = 0.15; // par seconde
/** Au-delà, le plus ancien ruban d'un fil disparaît. */
const MAX_PER_THREAD = 3;
/** Rubans à l'écran en tout : les plus récents, pour que ça reste lisible. */
const MAX_ON_SCREEN = 10;

interface Placed { r: Ribbon; at: Vec2 & { y: number }; rank: number }

function RibbonItem({ p, now, name, color }: { p: Placed; now: number; name: string; color: string }) {
  const root = useRef<Group>(null);
  const target = BASE_Y + p.rank * STEP_Y + ((now - p.r.born) / 1000) * DRIFT_Y;
  useFrame((_, dt) => {
    const g = root.current;
    if (!g) return;
    // Il glisse vers sa place (il vient d'apparaître, ou une nouvelle réplique le pousse).
    g.position.y += (target - g.position.y) * (1 - Math.exp(-dt * 8));
  });
  const life = p.r.until - p.r.born;
  const left = (p.r.until - now) / life;
  const opacity = Math.max(0, Math.min(1, left * 4, 1 - p.rank * 0.12));
  const text = p.r.text.length > MAX_CHARS ? p.r.text.slice(0, MAX_CHARS - 1) + '…' : p.r.text;
  return (
    <group position={[p.at.x, p.at.y, p.at.z]}>
      <group ref={root} position={[0, BASE_Y, 0]}>
        <Html center zIndexRange={[16, 11]} style={{ pointerEvents: 'none', opacity, transition: 'opacity 0.3s' }}>
          <div className="ribbon">
            <span className="ribbon__dot" style={{ background: color }} />
            <b className="ribbon__name">{name} :</b> {text}
          </div>
        </Html>
      </group>
    </group>
  );
}

export function Ribbons() {
  const ribbons = useHameau((s) => s.ribbons);
  const agents = useHameau((s) => s.world.agents);
  const [now, setNow] = useState(() => performance.now());
  // L'endroit où chaque réplique a été dite : le ruban reste là, même si l'on repart ensuite.
  const anchors = useRef(new Map<number, Vec2 & { y: number }>());

  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 120);
    return () => clearInterval(id);
  }, []);

  const live = ribbons.filter((r) => r.until > now && agents[r.agentId]);
  const world = useHameau.getState().world;
  for (const r of live) {
    if (anchors.current.has(r.id)) continue;
    const pose = agentPose(world, r.agentId, currentTick());
    if (pose) anchors.current.set(r.id, { x: pose.x, y: pose.y, z: pose.z });
  }
  for (const id of anchors.current.keys()) if (!live.some((r) => r.id === id)) anchors.current.delete(id);

  // Les fils : de la plus récente à la plus ancienne, chaque réplique prend le rang suivant dans son fil.
  const threads: { at: Vec2; count: number }[] = [];
  const placed: Placed[] = [];
  for (const r of [...live].sort((a, b) => b.born - a.born).slice(0, MAX_ON_SCREEN)) {
    const at = anchors.current.get(r.id);
    if (!at) continue;
    const thread = threads.find((t) => dist(t.at, at) < SAME_THREAD) ?? threads[threads.push({ at, count: 0 }) - 1];
    if (thread.count >= MAX_PER_THREAD) continue;
    placed.push({ r, at, rank: thread.count++ });
  }

  return (
    <>
      {placed.map((p) => {
        const a = agents[p.r.agentId];
        return <RibbonItem key={p.r.id} p={p} now={now} name={a.name} color={ROLE_COLOR[a.role]} />;
      })}
    </>
  );
}

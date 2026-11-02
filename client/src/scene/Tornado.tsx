import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { pointAlong } from '@hameau/shared';
import { useHameau } from '../net/store';
import { currentTick } from './effectLevel';

/** Anneaux d'un entonnoir : étroit en bas, large en haut. */
const RINGS = Array.from({ length: 9 }, (_, i) => ({ y: 0.6 + i * 1.5, r: 0.5 + i * i * 0.09 + i * 0.25 }));

/** La tornade : un entonnoir de poussière qui tourne sur lui-même et traverse le village. */
export function Tornado() {
  const root = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const debris = useRef<Group>(null);
  useFrame(({ clock }) => {
    const e = useHameau.getState().world.effects?.find((x) => x.kind === 'tornado');
    if (!root.current) return;
    root.current.visible = !!e?.path;
    if (!e?.path) return;
    const t = (currentTick() - e.startTick) / Math.max(1, e.endTick - e.startTick);
    const { p } = pointAlong(e.path, t);
    // Il naît et meurt en douceur, et vacille un peu en avançant.
    const grow = Math.min(1, t * 6, (1 - t) * 6);
    root.current.position.set(p.x + Math.sin(clock.elapsedTime * 3) * 0.6, 0, p.z + Math.cos(clock.elapsedTime * 2.3) * 0.6);
    root.current.scale.setScalar(Math.max(0.01, grow));
    if (debris.current) debris.current.rotation.y = -clock.elapsedTime * 4;
    if (spin.current) {
      spin.current.rotation.y = clock.elapsedTime * 6;
      spin.current.children.forEach((c, i) => {
        c.position.x = Math.sin(clock.elapsedTime * 4 + i) * 0.15 * i;
      });
    }
  });
  return (
    <group ref={root} visible={false}>
      <group ref={spin}>
        {RINGS.map(({ y, r }, i) => (
          <mesh key={i} position={[0, y, 0]} rotation={[0, i * 0.7, 0]}>
            <cylinderGeometry args={[r * 1.15, r, 1.6, 9, 1, true]} />
            <meshStandardMaterial color={i % 2 ? '#8f8a80' : '#a39d92'} transparent opacity={0.55} flatShading side={2} depthWrite={false} />
          </mesh>
        ))}
      </group>
      {/* Débris qui tournoient à la base */}
      <group ref={debris}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i} position={[Math.cos(i) * 1.8, 0.8 + (i % 3) * 0.8, Math.sin(i) * 1.8]} rotation={[i, i * 2, 0]}>
            <boxGeometry args={[0.25, 0.08, 0.4]} />
            <meshStandardMaterial color="#6b4a2f" flatShading />
          </mesh>
        ))}
      </group>
    </group>
  );
}

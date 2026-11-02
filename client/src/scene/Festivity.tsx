import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { useHameau } from '../net/store';

// Guirlandes de fanions autour de la place pendant une fête, et des confettis qui tombent.

const COLORS = {
  mariage: ['#ffffff', '#f6c6d0', '#f3e3c3', '#e8a0b4'],
  bapteme: ['#bfe0f5', '#f8cfe0', '#fff1c1', '#d7f0d0'],
  fete: ['#c8553d', '#e2b13c', '#3f7a6b', '#4a7fc1', '#8a5a9e'],
};
const POLES = 8;
const FLAGS_PER_SPAN = 7;
const POLE_H = 3.2;

export function Festivity() {
  const festivity = useHameau((s) => s.world.festivity);
  const plaza = useHameau((s) => s.world.terrain.plaza);
  const confetti = useRef<Group>(null);

  const layout = useMemo(() => {
    const r = plaza.radius + 0.6;
    const poles = Array.from({ length: POLES }, (_, i) => {
      const a = (i / POLES) * Math.PI * 2;
      return { x: plaza.center.x + Math.cos(a) * r, z: plaza.center.z + Math.sin(a) * r };
    });
    // Les fanions pendent le long d'une corde légèrement creusée entre deux mâts.
    const flags = poles.flatMap((p, i) => {
      const q = poles[(i + 1) % POLES];
      return Array.from({ length: FLAGS_PER_SPAN }, (_, k) => {
        const t = (k + 0.5) / FLAGS_PER_SPAN;
        const sag = Math.sin(t * Math.PI) * 0.6;
        return { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, y: POLE_H - 0.1 - sag, angle: Math.atan2(q.x - p.x, q.z - p.z), k: i * FLAGS_PER_SPAN + k };
      });
    });
    const bits = Array.from({ length: 40 }, (_, i) => ({ x: (Math.sin(i * 12.9) * 0.5) * r * 1.6, z: (Math.cos(i * 7.3) * 0.5) * r * 1.6, phase: (i * 0.137) % 1 }));
    return { poles, flags, bits };
  }, [plaza]);

  useFrame(({ clock }) => {
    confetti.current?.children.forEach((c, i) => {
      const b = layout.bits[i];
      const p = (clock.elapsedTime * 0.25 + b.phase) % 1;
      c.position.set(b.x + Math.sin(clock.elapsedTime * 2 + i) * 0.4, 6 - p * 6, b.z);
      c.rotation.set(clock.elapsedTime * 3 + i, clock.elapsedTime * 2, 0);
    });
  });

  if (!festivity) return null;
  const colors = COLORS[festivity.kind];
  return (
    <group>
      {layout.poles.map((p, i) => (
        <mesh key={i} position={[p.x, POLE_H / 2, p.z]} castShadow>
          <cylinderGeometry args={[0.06, 0.08, POLE_H, 6]} />
          <meshStandardMaterial color="#7a5434" flatShading />
        </mesh>
      ))}
      {layout.flags.map((f) => (
        <mesh key={f.k} position={[f.x, f.y, f.z]} rotation={[0, f.angle + Math.PI / 2, 0]}>
          <coneGeometry args={[0.2, 0.42, 3]} />
          <meshStandardMaterial color={colors[f.k % colors.length]} flatShading />
        </mesh>
      ))}
      <group ref={confetti} position={[plaza.center.x, 0, plaza.center.z]}>
        {layout.bits.map((_, i) => (
          <mesh key={i}>
            <planeGeometry args={[0.12, 0.08]} />
            <meshStandardMaterial color={colors[i % colors.length]} side={2} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

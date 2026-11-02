import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { InstancedMesh } from 'three';
import { Object3D } from 'three';
import { seasonOf } from '@hameau/shared';
import { useHameau } from '../net/store';

// L'hiver, des flocons tombent doucement sur tout le village.

const FLAKES = 600;
const AREA = 90;
const HEIGHT = 22;

export function Snow() {
  const winter = useHameau((s) => seasonOf(s.world.clock.day) === 'hiver');
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const seeds = useMemo(() => Array.from({ length: FLAKES }, (_, i) => ({
    x: (Math.sin(i * 12.9898) * 0.5) * AREA, z: (Math.cos(i * 78.233) * 0.5) * AREA, phase: (i * 0.618) % 1, drift: (i % 7) * 0.3,
  })), []);
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    seeds.forEach((s, i) => {
      const p = (clock.elapsedTime * 0.06 + s.phase) % 1;
      dummy.position.set(s.x + Math.sin(clock.elapsedTime * 0.8 + s.drift) * 0.6, HEIGHT * (1 - p), s.z);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  if (!winter) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, FLAKES]}>
      <icosahedronGeometry args={[0.07, 0]} />
      <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} />
    </instancedMesh>
  );
}

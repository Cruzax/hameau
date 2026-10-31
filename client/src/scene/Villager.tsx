import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';

/** Petit personnage en primitives. Servira aussi de messager en phase 2. */
export function Villager({
  position,
  heading = 0,
  color,
  phase = 0,
  scale = 1,
}: {
  position: [number, number, number];
  heading?: number;
  color: string;
  phase?: number;
  scale?: number;
}) {
  const body = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (body.current) body.current.position.y = Math.abs(Math.sin(clock.elapsedTime * 1.6 + phase)) * 0.05;
  });

  return (
    <group position={position} rotation={[0, heading, 0]} scale={scale}>
      <group ref={body}>
        <mesh position={[0, 0.42, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.28, 0.6, 6]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
        <mesh position={[0, 0.9, 0]} castShadow>
          <icosahedronGeometry args={[0.22, 0]} />
          <meshStandardMaterial color="#f2c9a0" flatShading />
        </mesh>
        {[-0.1, 0.1].map((x) => (
          <mesh key={x} position={[x, 0.08, 0]} castShadow>
            <boxGeometry args={[0.1, 0.16, 0.14]} />
            <meshStandardMaterial color="#4a3426" flatShading />
          </mesh>
        ))}
      </group>
    </group>
  );
}

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { Treasure } from '@hameau/shared';
import { useHameau } from '../net/store';
import { terrainHeight } from './terrainMath';

/** Un coffre posé dans l'herbe, qui scintille pour qu'on le repère. */
function Chest({ t }: { t: Treasure }) {
  const terrain = useHameau((s) => s.world.terrain);
  const sparkle = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!sparkle.current) return;
    sparkle.current.rotation.y = clock.elapsedTime * 1.5;
    sparkle.current.position.y = 1.5 + Math.sin(clock.elapsedTime * 2.5) * 0.15;
  });
  const y = terrainHeight(t.position.x, t.position.z, terrain);
  return (
    <group position={[t.position.x, y, t.position.z]} rotation={[0, 0.4, 0]}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.9, 0.55, 0.6]} />
        <meshStandardMaterial color="#8a5a2b" flatShading />
      </mesh>
      <mesh position={[0, 0.66, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.9, 8, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#9c6a35" flatShading />
      </mesh>
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.45, 0]}>
          <boxGeometry args={[0.08, 0.85, 0.64]} />
          <meshStandardMaterial color="#e2b13c" metalness={0.6} roughness={0.3} />
        </mesh>
      ))}
      <group ref={sparkle}>
        <mesh>
          <octahedronGeometry args={[0.22, 0]} />
          <meshStandardMaterial color="#ffd75e" emissive="#ffc21a" emissiveIntensity={1.6} />
        </mesh>
      </group>
      <pointLight position={[0, 1.2, 0]} color="#ffcc55" intensity={6} distance={6} />
    </group>
  );
}

export function Treasures() {
  const treasures = useHameau((s) => s.world.treasures ?? []);
  return (
    <>
      {treasures.map((t) => <Chest key={t.id} t={t} />)}
    </>
  );
}

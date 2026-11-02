import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshStandardMaterial } from 'three';
import { useHameau } from '../net/store';
import { nightNow } from './effectLevel';
import { terrainHeight } from './terrainMath';

// Des lanternes autour de la place et aux carrefours, qui s'allument à la tombée de la nuit.

const GLASS = new MeshStandardMaterial({ color: '#ffe3a3', emissive: '#ffb84a', emissiveIntensity: 0 });
const AROUND_PLAZA = 6;

export function Lanterns() {
  const plaza = useHameau((s) => s.world.terrain.plaza);
  const terrain = useHameau((s) => s.world.terrain);
  const houses = useHameau((s) => s.world.houses);
  const spots = useMemo(() => {
    const r = plaza.radius + 1.4;
    const ring = Array.from({ length: AROUND_PLAZA }, (_, i) => {
      const a = ((i + 0.5) / AROUND_PLAZA) * Math.PI * 2;
      return { x: plaza.center.x + Math.cos(a) * r, z: plaza.center.z + Math.sin(a) * r };
    });
    // Au bord du chemin, pas au milieu.
    const crossings = Object.values(houses).filter((h) => h.kind === 'carrefour').map((h) => ({ x: h.position.x + 1.1, z: h.position.z + 0.8 }));
    return [...ring, ...crossings].map((p) => ({ ...p, y: terrainHeight(p.x, p.z, terrain) }));
  }, [plaza, houses, terrain]);

  useFrame(() => {
    GLASS.emissiveIntensity = 2.2 * nightNow();
  });

  return (
    <>
      {spots.map((p, i) => (
        <group key={i} position={[p.x, p.y, p.z]}>
          <mesh position={[0, 0.9, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.07, 1.8, 6]} />
            <meshStandardMaterial color="#3d3a36" flatShading />
          </mesh>
          <mesh position={[0, 1.95, 0]} material={GLASS}>
            <boxGeometry args={[0.24, 0.3, 0.24]} />
          </mesh>
          <mesh position={[0, 2.15, 0]}>
            <coneGeometry args={[0.22, 0.16, 4]} />
            <meshStandardMaterial color="#3d3a36" flatShading />
          </mesh>
        </group>
      ))}
    </>
  );
}

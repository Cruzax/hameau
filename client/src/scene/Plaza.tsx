import type { Terrain } from '@hameau/shared';

/** Place centrale : pavés, fontaine, panneau d'affichage de la gazette. */
export function Plaza({ terrain }: { terrain: Terrain }) {
  const { center, radius } = terrain.plaza;
  return (
    <group position={[center.x, 0, center.z]}>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <cylinderGeometry args={[radius + 0.35, radius + 0.45, 0.06, 12]} />
        <meshStandardMaterial color="#b9a688" flatShading />
      </mesh>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <cylinderGeometry args={[radius, radius, 0.06, 12]} />
        <meshStandardMaterial color="#e2cda4" flatShading />
      </mesh>

      {/* Fontaine */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.25, 1.35, 0.5, 8]} />
        <meshStandardMaterial color="#b8ab95" flatShading />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <cylinderGeometry args={[1.05, 1.05, 0.05, 8]} />
        <meshStandardMaterial color="#6cb8d6" emissive="#7fd0f0" emissiveIntensity={0.15} roughness={0.2} />
      </mesh>
      <mesh position={[0, 1.0, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.22, 1.1, 6]} />
        <meshStandardMaterial color="#a89a83" flatShading />
      </mesh>
      <mesh position={[0, 1.55, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.2, 0.22, 8]} />
        <meshStandardMaterial color="#b8ab95" flatShading />
      </mesh>

      {/* Panneau de la gazette */}
      <group position={[-3.3, 0, -1.4]} rotation={[0, Math.atan2(3.3, 1.4), 0]}>
        {[-0.65, 0.65].map((x) => (
          <mesh key={x} position={[x, 0.75, 0]} castShadow>
            <boxGeometry args={[0.12, 1.5, 0.12]} />
            <meshStandardMaterial color="#6b4a2f" flatShading />
          </mesh>
        ))}
        <mesh position={[0, 1.25, 0.04]} castShadow>
          <boxGeometry args={[1.6, 0.9, 0.08]} />
          <meshStandardMaterial color="#8a6440" flatShading />
        </mesh>
        <mesh position={[0, 1.25, 0.09]}>
          <boxGeometry args={[1.3, 0.65, 0.02]} />
          <meshStandardMaterial color="#f6ead2" />
        </mesh>
        <mesh position={[0, 1.78, 0.04]} rotation={[0, 0, 0]} castShadow>
          <boxGeometry args={[1.85, 0.12, 0.35]} />
          <meshStandardMaterial color="#a0573a" flatShading />
        </mesh>
      </group>
    </group>
  );
}

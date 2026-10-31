import { NATURE_SPOTS } from '@hameau/shared';

/** Coin des bûcherons : clairière, souches et tas de bûches. */
function Clearing() {
  const { x, z } = NATURE_SPOTS.foret;
  return (
    <group position={[x, 0, z]}>
      {[
        [-1.2, 0.6],
        [1.1, -0.8],
        [0.4, 1.4],
      ].map(([dx, dz], i) => (
        <mesh key={i} position={[dx, 0.2, dz]} castShadow>
          <cylinderGeometry args={[0.32, 0.38, 0.4, 7]} />
          <meshStandardMaterial color="#8a5f3c" flatShading />
        </mesh>
      ))}
      {[0, 1, 2].map((row) =>
        [0, 1, 2 - row].slice(0, 3 - row).map((col) => (
          <mesh key={`${row}-${col}`} position={[1.6 + col * 0.32 + row * 0.16, 0.16 + row * 0.27, 1.2]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.14, 0.14, 1.1, 6]} />
            <meshStandardMaterial color={row % 2 ? '#9a6b42' : '#7a5234'} flatShading />
          </mesh>
        )),
      )}
      {/* Hache plantée dans une souche */}
      <mesh position={[-1.2, 0.55, 0.6]} rotation={[0, 0, 0.5]} castShadow>
        <boxGeometry args={[0.06, 0.6, 0.06]} />
        <meshStandardMaterial color="#6b4a2f" />
      </mesh>
      <mesh position={[-1.05, 0.8, 0.6]} rotation={[0, 0, 0.5]} castShadow>
        <boxGeometry args={[0.25, 0.12, 0.04]} />
        <meshStandardMaterial color="#9aa0a8" metalness={0.4} />
      </mesh>
    </group>
  );
}

/** Coin des pêcheurs : petit ponton de bois sur la berge. */
function Dock() {
  const { x, z } = NATURE_SPOTS.riviere;
  return (
    <group position={[x + 1.2, 0, z]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.4, 0.1, 2.6]} />
        <meshStandardMaterial color="#8a5f3c" flatShading />
      </mesh>
      {[-0.6, 0.6].map((dx) =>
        [-1.1, 1.1].map((dz) => (
          <mesh key={`${dx}${dz}`} position={[dx, -0.1, dz]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.6, 6]} />
            <meshStandardMaterial color="#6b4a2f" flatShading />
          </mesh>
        )),
      )}
      {/* Seau et canne à pêche */}
      <mesh position={[0.4, 0.3, -0.8]} castShadow>
        <cylinderGeometry args={[0.16, 0.12, 0.28, 8]} />
        <meshStandardMaterial color="#7a8a96" flatShading />
      </mesh>
      <mesh position={[-0.3, 0.5, 0.9]} rotation={[0.9, 0, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 1.8, 4]} />
        <meshStandardMaterial color="#c8a070" />
      </mesh>
    </group>
  );
}

export function NatureSpots() {
  return (
    <>
      <Clearing />
      <Dock />
    </>
  );
}

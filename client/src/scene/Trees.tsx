import { useMemo } from 'react';
import { dist, distToPolyline, mulberry32, roadPath, type House, type Road, type Terrain, type Vec2 } from '@hameau/shared';
import { riverPath, terrainHeight } from './terrainMath';

type Kind = 'pin' | 'rond' | 'buisson' | 'rocher';
interface Prop { kind: Kind; x: number; y: number; z: number; s: number; rot: number; color: string }

const GREENS = ['#5e8c3a', '#6f9a3f', '#4f7a35', '#7aa548'];
const AUTUMN = ['#d08a3a', '#c4643a', '#e0b04a'];

/** Décor semé de façon déterministe (même graine → même village, utile pour les replays). */
function scatter(terrain: Terrain, houses: House[], roads: Road[], housesById: Record<string, House>): Prop[] {
  const rand = mulberry32(42);
  const river = riverPath(terrain);
  const paths = roads.map((r) => roadPath(r, housesById));
  const lim = terrain.size / 2 - 3;
  const out: Prop[] = [];
  // Chaque candidat consomme toujours les mêmes tirages : ajouter une maison ou une route
  // retire seulement les arbres gênants, sans redistribuer toute la forêt.
  for (let i = 0; i < 520; i++) {
    const p: Vec2 = { x: (rand() * 2 - 1) * lim, z: (rand() * 2 - 1) * lim };
    const [r, autumn, s, rot, c] = [rand(), rand(), rand(), rand(), rand()];
    if (dist(p, terrain.plaza.center) < terrain.plaza.radius + 2.5) continue;
    if (distToPolyline(p, river) < terrain.river.width / 2 + 1.6) continue;
    if (houses.some((h) => dist(p, h.position) < 4.2)) continue;
    if (paths.some((path) => distToPolyline(p, path) < 1.9)) continue;
    const kind: Kind = r < 0.45 ? 'pin' : r < 0.78 ? 'rond' : r < 0.92 ? 'buisson' : 'rocher';
    const palette = kind === 'rond' && autumn < 0.45 ? AUTUMN : GREENS;
    out.push({
      kind,
      x: p.x,
      y: terrainHeight(p.x, p.z, terrain),
      z: p.z,
      s: 0.75 + s * 0.6,
      rot: rot * Math.PI * 2,
      color: kind === 'rocher' ? '#a39a8c' : palette[Math.floor(c * palette.length)],
    });
  }
  return out;
}

function PropMesh({ p }: { p: Prop }) {
  const trunk = (h: number) => (
    <mesh position={[0, h / 2, 0]} castShadow>
      <cylinderGeometry args={[0.12, 0.18, h, 5]} />
      <meshStandardMaterial color="#7a5234" flatShading />
    </mesh>
  );
  return (
    <group position={[p.x, p.y, p.z]} rotation={[0, p.rot, 0]} scale={p.s}>
      {p.kind === 'pin' && (
        <>
          {trunk(0.7)}
          <mesh position={[0, 1.4, 0]} castShadow>
            <coneGeometry args={[0.95, 1.6, 6]} />
            <meshStandardMaterial color={p.color} flatShading />
          </mesh>
          <mesh position={[0, 2.25, 0]} castShadow>
            <coneGeometry args={[0.7, 1.2, 6]} />
            <meshStandardMaterial color={p.color} flatShading />
          </mesh>
        </>
      )}
      {p.kind === 'rond' && (
        <>
          {trunk(1)}
          <mesh position={[0, 1.65, 0]} castShadow>
            <icosahedronGeometry args={[0.95, 0]} />
            <meshStandardMaterial color={p.color} flatShading />
          </mesh>
        </>
      )}
      {p.kind === 'buisson' && (
        <mesh position={[0, 0.3, 0]} castShadow>
          <dodecahedronGeometry args={[0.5, 0]} />
          <meshStandardMaterial color={p.color} flatShading />
        </mesh>
      )}
      {p.kind === 'rocher' && (
        <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
          <dodecahedronGeometry args={[0.55, 0]} />
          <meshStandardMaterial color={p.color} flatShading />
        </mesh>
      )}
    </group>
  );
}

export function Trees({ terrain, houses, roads }: { terrain: Terrain; houses: Record<string, House>; roads: Road[] }) {
  const props = useMemo(() => scatter(terrain, Object.values(houses), roads, houses), [terrain, houses, roads]);
  return (
    <group>
      {props.map((p, i) => (
        <PropMesh key={i} p={p} />
      ))}
    </group>
  );
}

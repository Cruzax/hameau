import { useMemo, useState } from 'react';
import { dist, pointAlong, roadPath, segmentIntersection, type House, type Road, type Terrain, type Vec2 } from '@hameau/shared';
import { riverPath } from './terrainMath';

const ROAD_WIDTH = 1.1;
const ROAD_Y = 0.07;

interface Strip { mid: Vec2; length: number; angle: number }
interface Bridge { at: Vec2; angle: number; length: number }

/** Portion [t0, t1] du segment [a, b] située dans le cercle (centre, r), ou null. */
function circleSpan(a: Vec2, b: Vec2, c: Vec2, r: number): [number, number] | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const fx = a.x - c.x;
  const fz = a.z - c.z;
  const A = dx * dx + dz * dz;
  const B = 2 * (fx * dx + fz * dz);
  const C = fx * fx + fz * fz - r * r;
  const disc = B * B - 4 * A * C;
  if (A === 0 || disc <= 0) return null;
  const s = Math.sqrt(disc);
  const t0 = Math.max((-B - s) / (2 * A), 0);
  const t1 = Math.min((-B + s) / (2 * A), 1);
  return t1 > t0 ? [t0, t1] : null;
}

/** Découpe un tracé en bandes droites, avec un trou là où un pont enjambe la rivière
 *  et là où la route traverse la place (les pavés prennent le relais). */
function buildRoad(path: Vec2[], river: Vec2[], riverWidth: number, plaza: Terrain['plaza']) {
  const strips: Strip[] = [];
  const bridges: Bridge[] = [];
  const bridgeLen = riverWidth * 1.25 + 2.2;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const angle = Math.atan2(b.x - a.x, b.z - a.z);
    const gaps: [number, number][] = [];
    for (let j = 1; j < river.length; j++) {
      const hit = segmentIntersection(a, b, river[j - 1], river[j]);
      if (hit) {
        bridges.push({ at: hit.p, angle, length: bridgeLen });
        const h = bridgeLen / 2 / len;
        gaps.push([hit.t - h, hit.t + h]);
      }
    }
    const inPlaza = circleSpan(a, b, plaza.center, plaza.radius + 0.15);
    if (inPlaza) gaps.push(inPlaza);
    gaps.sort((g, h) => g[0] - h[0]);
    let t0 = 0;
    for (const [g0, g1] of [...gaps, [1, 1] as [number, number]]) {
      const t1 = Math.max(Math.min(g0, 1), t0);
      if (t1 - t0 > 1e-3) {
        const pa = { x: a.x + (b.x - a.x) * t0, z: a.z + (b.z - a.z) * t0 };
        const pb = { x: a.x + (b.x - a.x) * t1, z: a.z + (b.z - a.z) * t1 };
        strips.push({ mid: { x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2 }, length: (t1 - t0) * len, angle });
      }
      t0 = Math.max(g1, t0);
    }
  }
  const joints = path.filter((p) => dist(p, plaza.center) > plaza.radius + 0.15);
  return { strips, bridges, joints };
}

function BridgeMesh({ bridge }: { bridge: Bridge }) {
  const { at, angle, length } = bridge;
  const posts = [-0.4, -0.13, 0.13, 0.4].map((k) => k * length);
  return (
    <group position={[at.x, 0, at.z]} rotation={[0, angle, 0]}>
      <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
        <boxGeometry args={[ROAD_WIDTH + 0.5, 0.18, length]} />
        <meshStandardMaterial color="#8a5f3c" flatShading />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (ROAD_WIDTH / 2 + 0.2), 0, 0]}>
          <mesh position={[0, 0.62, 0]} castShadow>
            <boxGeometry args={[0.08, 0.08, length * 0.9]} />
            <meshStandardMaterial color="#6b4a2f" flatShading />
          </mesh>
          {posts.map((z) => (
            <mesh key={z} position={[0, 0.42, z]} castShadow>
              <boxGeometry args={[0.12, 0.5, 0.12]} />
              <meshStandardMaterial color="#6b4a2f" flatShading />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Barrière rayée rouge et blanc posée en travers d'une route coupée. */
function Barrier({ at, angle }: { at: Vec2; angle: number }) {
  return (
    <group position={[at.x, 0, at.z]} rotation={[0, angle + Math.PI / 2, 0]}>
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} position={[x, 0.4, 0]} castShadow>
          <boxGeometry args={[0.12, 0.8, 0.12]} />
          <meshStandardMaterial color="#5a4030" flatShading />
        </mesh>
      ))}
      {[-0.45, 0, 0.45].map((x, i) => (
        <mesh key={x} position={[x, 0.65, 0]} castShadow>
          <boxGeometry args={[0.45, 0.22, 0.08]} />
          <meshStandardMaterial color={i % 2 ? '#f4efe6' : '#c8402f'} flatShading />
        </mesh>
      ))}
    </group>
  );
}

export function Roads({
  roads,
  houses,
  terrain,
  onToggle,
  onPick,
}: {
  roads: Road[];
  houses: Record<string, House>;
  terrain: Terrain;
  onToggle?: (roadId: string) => void;
  /** Pouvoir du mode Dieu en attente : le clic pose à cet endroit au lieu de couper la route. */
  onPick?: (p: { x: number; z: number }) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const built = useMemo(() => {
    const river = riverPath(terrain);
    return roads.map((r) => {
      const path = roadPath(r, houses);
      return { road: r, middle: pointAlong(path, 0.5), ...buildRoad(path, river, terrain.river.width, terrain.plaza) };
    });
  }, [roads, houses, terrain]);

  return (
    <group>
      {built.map(({ road, strips, bridges, joints, middle }) => {
        const color = road.status === 'open' ? (hovered === road.id ? '#ead0a4' : '#d8b98a') : '#8f7a68';
        return (
          <group
            key={road.id}
            name={road.id}
            onClick={(e) => {
              e.stopPropagation();
              if (e.delta > 4) return; // c'était un glisser de caméra, pas un clic
              if (onPick) onPick({ x: e.point.x, z: e.point.z });
              else onToggle?.(road.id);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(road.id);
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              setHovered(null);
              document.body.style.cursor = '';
            }}
          >
            {road.status === 'cut' && <Barrier at={middle.p} angle={middle.heading} />}
            {strips.map((s, i) => (
              <mesh key={i} position={[s.mid.x, ROAD_Y / 2, s.mid.z]} rotation={[0, s.angle, 0]} receiveShadow>
                <boxGeometry args={[ROAD_WIDTH, ROAD_Y, s.length]} />
                <meshStandardMaterial color={color} flatShading roughness={1} />
              </mesh>
            ))}
            {joints.map((p, i) => (
              <mesh key={`j${i}`} position={[p.x, ROAD_Y / 2, p.z]} receiveShadow>
                <cylinderGeometry args={[ROAD_WIDTH / 2, ROAD_WIDTH / 2, ROAD_Y, 10]} />
                <meshStandardMaterial color={color} flatShading roughness={1} />
              </mesh>
            ))}
            {bridges.map((b, i) => (
              <BridgeMesh key={`b${i}`} bridge={b} />
            ))}
          </group>
        );
      })}
    </group>
  );
}

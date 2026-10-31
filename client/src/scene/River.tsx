import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, type Mesh, type MeshStandardMaterial } from 'three';
import type { Terrain } from '@hameau/shared';
import { riverPath, WATER_LEVEL } from './terrainMath';

/** Ruban d'eau qui suit le tracé lissé de la rivière. */
export function River({ terrain }: { terrain: Terrain }) {
  const ref = useRef<Mesh>(null);
  const geometry = useMemo(() => {
    const pts = riverPath(terrain);
    const half = (terrain.river.width / 2) * 1.25;
    const verts: number[] = [];
    const index: number[] = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(i - 1, 0)];
      const b = pts[Math.min(i + 1, pts.length - 1)];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / len;
      const nz = (b.x - a.x) / len;
      verts.push(p.x + nx * half, 0, p.z + nz * half, p.x - nx * half, 0, p.z - nz * half);
      if (i > 0) {
        const k = i * 2;
        index.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    return geo;
  }, [terrain]);

  // Léger scintillement de l'eau.
  useFrame(({ clock }) => {
    const m = ref.current?.material as MeshStandardMaterial | undefined;
    if (m) m.emissiveIntensity = 0.12 + Math.sin(clock.elapsedTime * 1.3) * 0.04;
  });

  return (
    <mesh ref={ref} geometry={geometry} position={[0, WATER_LEVEL, 0]} receiveShadow>
      <meshStandardMaterial color="#5aa6c8" emissive="#7fd0f0" roughness={0.2} metalness={0.1} transparent opacity={0.9} side={2} />
    </mesh>
  );
}

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, type Mesh, type MeshStandardMaterial } from 'three';
import type { Terrain } from '@hameau/shared';
import { approach, effectLevel } from './effectLevel';
import { riverPath, WATER_LEVEL } from './terrainMath';

/** Largeur supplémentaire (de chaque côté) et hauteur gagnées par la rivière au pic de la crue. */
const EXTRA_WIDTH = 4.5;
const RISE = 0.42;

/** Crue : une nappe d'eau boueuse s'élargit et monte au-dessus des berges, puis redescend. */
export function Flood({ terrain }: { terrain: Terrain }) {
  const mesh = useRef<Mesh>(null);
  const level = useRef(0);
  const built = useRef(-1);

  const { geometry, pts, normals } = useMemo(() => {
    const pts = riverPath(terrain);
    const normals = pts.map((_, i) => {
      const a = pts[Math.max(i - 1, 0)];
      const b = pts[Math.min(i + 1, pts.length - 1)];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      return { x: -(b.z - a.z) / len, z: (b.x - a.x) / len };
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pts.length * 6), 3));
    const index: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      const k = i * 2;
      index.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
    geo.setIndex(index);
    return { geometry: geo, pts, normals };
  }, [terrain]);

  useFrame(({ clock }, dt) => {
    level.current = approach(level.current, effectLevel('flood'), dt, 1.2);
    const l = level.current;
    if (!mesh.current) return;
    mesh.current.visible = l > 0.01;
    if (!mesh.current.visible) return;

    // On ne recalcule le ruban que lorsque la largeur a vraiment changé.
    if (Math.abs(l - built.current) > 0.015) {
      const half = (terrain.river.width / 2) * 1.25 + EXTRA_WIDTH * l;
      const pos = geometry.attributes.position as BufferAttribute;
      pts.forEach((p, i) => {
        const n = normals[i];
        const wobble = Math.sin(i * 0.37) * 0.6 * l;
        pos.setXYZ(i * 2, p.x + n.x * (half + wobble), 0, p.z + n.z * (half + wobble));
        pos.setXYZ(i * 2 + 1, p.x - n.x * (half - wobble), 0, p.z - n.z * (half - wobble));
      });
      pos.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      built.current = l;
    }
    mesh.current.position.y = WATER_LEVEL + 0.01 + RISE * l + Math.sin(clock.elapsedTime * 1.5) * 0.02 * l;
    (mesh.current.material as MeshStandardMaterial).opacity = 0.85 * Math.min(1, l * 1.5);
  });

  return (
    <mesh ref={mesh} geometry={geometry} visible={false} receiveShadow>
      <meshStandardMaterial color="#6f8f93" emissive="#5d7f86" emissiveIntensity={0.15} roughness={0.3} transparent opacity={0} side={2} depthWrite={false} />
    </mesh>
  );
}

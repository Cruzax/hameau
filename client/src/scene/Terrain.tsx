import { useMemo } from 'react';
import { BufferAttribute, Color, PlaneGeometry } from 'three';
import { distToPolyline, mulberry32, type Terrain as TerrainData } from '@hameau/shared';
import { riverPath, terrainHeight } from './terrainMath';

const GRASS = ['#9cbf5a', '#a7c662', '#93b752'].map((c) => new Color(c));
const HILL = new Color('#7f9c4c');
const HILL_HIGH = new Color('#c9a66b');
const SAND = new Color('#dcc48f');

export function Terrain({ terrain }: { terrain: TerrainData }) {
  const geometry = useMemo(() => {
    const seg = 120;
    const plane = new PlaneGeometry(terrain.size, terrain.size, seg, seg);
    plane.rotateX(-Math.PI / 2);
    const pos = plane.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i), terrain));
    }
    // Non indexé + une couleur par face = rendu low-poly à facettes.
    const geo = plane.toNonIndexed();
    plane.dispose();
    const p = geo.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const rand = mulberry32(7);
    const river = riverPath(terrain);
    const halfW = terrain.river.width / 2;
    const c = new Color();
    for (let f = 0; f < p.count; f += 3) {
      const cx = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3;
      const cy = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
      const cz = (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3;
      const rd = distToPolyline({ x: cx, z: cz }, river);
      if (rd < halfW + 1.1) c.copy(SAND);
      else if (cy > 3.2) c.copy(HILL_HIGH);
      else if (cy > 0.6) c.copy(HILL).lerp(HILL_HIGH, Math.min((cy - 0.6) / 3, 1) * 0.5);
      else c.copy(GRASS[Math.floor(rand() * GRASS.length)]);
      for (let k = 0; k < 3; k++) c.toArray(colors, (f + k) * 3);
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [terrain]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={0.95} />
    </mesh>
  );
}

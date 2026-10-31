import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Object3D, type Group, type InstancedMesh, type Mesh, type MeshBasicMaterial, type PointLight } from 'three';
import { mulberry32, type Terrain } from '@hameau/shared';
import { approach, effectLevel } from './effectLevel';

const SPARKS = 80;
const HEIGHT = 7;

/** Le puits de la place s'illumine : colonne de lumière dorée et étincelles qui montent. */
export function WellGlow({ terrain }: { terrain: Terrain }) {
  const root = useRef<Group>(null);
  const light = useRef<PointLight>(null);
  const beam = useRef<Mesh>(null);
  const sparks = useRef<InstancedMesh>(null);
  const level = useRef(0);
  const dummy = useMemo(() => new Object3D(), []);
  const seeds = useMemo(() => {
    const rand = mulberry32(3);
    return Array.from({ length: SPARKS }, () => ({ a: rand() * Math.PI * 2, r: 0.2 + rand() * 0.9, y: rand() * HEIGHT, v: 1 + rand() * 1.5 }));
  }, []);

  useFrame(({ clock }, dt) => {
    level.current = approach(level.current, effectLevel('well'), dt, 2);
    const l = level.current;
    if (!root.current) return;
    root.current.visible = l > 0.01;
    if (!root.current.visible) return;
    const pulse = 0.85 + Math.sin(clock.elapsedTime * 4) * 0.15;
    if (light.current) light.current.intensity = 14 * l * pulse;
    if (beam.current) {
      (beam.current.material as MeshBasicMaterial).opacity = 0.35 * l * pulse;
      beam.current.rotation.y += dt * 0.6;
    }
    if (sparks.current) {
      seeds.forEach((s, i) => {
        s.y += s.v * dt;
        if (s.y > HEIGHT) s.y = 0;
        const a = s.a + clock.elapsedTime * 0.8;
        dummy.position.set(Math.cos(a) * s.r, 1.2 + s.y, Math.sin(a) * s.r);
        dummy.rotation.set(a, a * 2, 0);
        dummy.scale.setScalar(l * (1 - s.y / HEIGHT) * 0.12 + 0.01);
        dummy.updateMatrix();
        sparks.current!.setMatrixAt(i, dummy.matrix);
      });
      sparks.current.instanceMatrix.needsUpdate = true;
    }
  });

  const c = terrain.plaza.center;
  return (
    <group ref={root} position={[c.x, 0, c.z]} visible={false}>
      <pointLight ref={light} position={[0, 2.2, 0]} color="#ffd36b" distance={14} intensity={0} />
      <mesh ref={beam} position={[0, HEIGHT / 2 + 0.6, 0]}>
        <cylinderGeometry args={[0.5, 1.1, HEIGHT, 8, 1, true]} />
        <meshBasicMaterial color="#ffd36b" transparent opacity={0} blending={AdditiveBlending} depthWrite={false} side={2} />
      </mesh>
      <instancedMesh ref={sparks} args={[undefined, undefined, SPARKS]} frustumCulled={false}>
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color="#fff1b0" />
      </instancedMesh>
    </group>
  );
}

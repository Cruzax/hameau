import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Object3D, type AmbientLight, type InstancedMesh } from 'three';
import { mulberry32 } from '@hameau/shared';
import { approach, effectLevel } from './effectLevel';

const DROPS = 2200;
const AREA = 70;
const TOP = 26;
const FALL_SPEED = 32;

/** Orage : pluie et éclairs (le ciel s'assombrit dans Lights). Invisible hors orage.
 *  Pas de nuages : en vue isométrique de dessus, ils masqueraient le village. */
export function Storm() {
  const rain = useRef<InstancedMesh>(null);
  const flashLight = useRef<AmbientLight>(null);
  const level = useRef(0);
  const flash = useRef(0);
  const dummy = useMemo(() => new Object3D(), []);

  const drops = useMemo(() => {
    const rand = mulberry32(5);
    return Array.from({ length: DROPS }, () => ({ x: (rand() - 0.5) * AREA, z: (rand() - 0.5) * AREA, y: rand() * TOP, v: 0.8 + rand() * 0.4 }));
  }, []);

  useFrame((_, dt) => {
    level.current = approach(level.current, effectLevel('storm'), dt, 1.5);
    const l = level.current;
    const on = l > 0.01;

    if (rain.current) {
      rain.current.visible = on;
      if (on) {
        const shown = Math.floor(DROPS * l);
        for (let i = 0; i < DROPS; i++) {
          const d = drops[i];
          d.y -= FALL_SPEED * d.v * dt;
          if (d.y < 0) d.y += TOP;
          dummy.position.set(d.x, i < shown ? d.y : -50, d.z);
          dummy.rotation.set(0.12, 0, 0.12);
          dummy.updateMatrix();
          rain.current.setMatrixAt(i, dummy.matrix);
        }
        rain.current.instanceMatrix.needsUpdate = true;
      }
    }

    // Éclairs : rares, aléatoires, plus fréquents au cœur de l'orage.
    if (l > 0.5 && Math.random() < dt * 0.35 * l) flash.current = 1;
    flash.current = Math.max(0, flash.current - dt * 3.5);
    if (flashLight.current) flashLight.current.intensity = flash.current * flash.current * 6;
  });

  return (
    <>
      <instancedMesh ref={rain} args={[undefined, undefined, DROPS]} frustumCulled={false} visible={false}>
        <boxGeometry args={[0.05, 0.9, 0.05]} />
        <meshBasicMaterial color="#dbe8f5" transparent opacity={0.8} />
      </instancedMesh>
      <ambientLight ref={flashLight} color="#e8f0ff" intensity={0} />
    </>
  );
}

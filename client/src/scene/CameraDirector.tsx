import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type OrthographicCamera } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useHameau } from '../net/store';
import { useUI } from '../ui/uiStore';
import { messengerPose } from './Messengers';

const CENTER = new Vector3(2, 0, 1);
const ORBIT_RADIUS = 56;
const ORBIT_HEIGHT = 38;
const ORBIT_SPEED = 0.08; // radians par seconde

/**
 * Mouvements de caméra prédéfinis pour les vidéos : survol orbital, zoom sur une maison,
 * suivi du dernier messager parti. En plan « libre », la souris garde la main.
 */
export function CameraDirector() {
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const angle = useRef(Math.PI / 4);
  const desired = useRef(new Vector3());

  useFrame((_, dt) => {
    const { shot, focusHouse } = useUI.getState();
    if (shot === 'libre' || !controls) return;
    const { world, tickAt } = useHameau.getState();
    const k = 1 - Math.exp(-dt * 2.5); // lissage indépendant du framerate
    let zoom = 22;

    if (shot === 'survol') {
      angle.current += dt * ORBIT_SPEED;
      desired.current.copy(CENTER);
      controls.target.lerp(desired.current, k);
      camera.position.set(
        controls.target.x + Math.sin(angle.current) * ORBIT_RADIUS,
        ORBIT_HEIGHT,
        controls.target.z + Math.cos(angle.current) * ORBIT_RADIUS,
      );
    } else {
      if (shot === 'maison') {
        const h = (focusHouse && world.houses[focusHouse]) || world.houses[world.agents[world.mayorId]?.houseId];
        if (!h) return;
        desired.current.set(h.position.x, 1.5, h.position.z);
        zoom = 58;
      } else {
        // Le messager le plus récent encore en route.
        const msg = Object.values(world.messages).sort((a, b) => b.createdTick - a.createdTick)[0];
        const pose = msg && messengerPose(world, msg, tickAt);
        if (pose) desired.current.set(pose.x, 0.8, pose.z);
        else desired.current.copy(CENTER);
        zoom = pose ? 48 : zoom;
      }
      // On garde l'angle de vue courant et on translate la caméra avec sa cible.
      const before = controls.target.clone();
      controls.target.lerp(desired.current, k);
      camera.position.add(controls.target.clone().sub(before));
    }
    camera.zoom += (zoom - camera.zoom) * k;
    camera.updateProjectionMatrix();
    controls.update();
  });

  return null;
}

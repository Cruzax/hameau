import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { ROLE_COLOR } from '@hameau/shared';
import { useHameau } from '../net/store';
import { agentPose } from './spots';
import { currentTick } from './effectLevel';

/** Un habitant : devant sa porte, en chemin, ou sur un lieu. Caché quand il dort. */
function Resident({ id, color, phase, small }: { id: string; color: string; phase: number; small: boolean }) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);

  useFrame(({ clock }) => {
    const pose = agentPose(useHameau.getState().world, id, currentTick());
    if (!pose || !root.current) return;
    root.current.visible = !pose.hidden;
    root.current.position.set(pose.x, pose.y, pose.z);
    root.current.rotation.y = pose.heading;
    if (body.current) {
      const speed = pose.walking ? 9 : 1.6;
      const amp = pose.walking ? 0.1 : 0.05;
      body.current.position.y = Math.abs(Math.sin(clock.elapsedTime * speed + phase)) * amp;
    }
  });

  return (
    <group ref={root} scale={small ? 0.7 : 1}>
      <group ref={body}>
        <mesh position={[0, 0.42, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.28, 0.6, 6]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
        <mesh position={[0, 0.9, 0]} castShadow>
          <icosahedronGeometry args={[0.22, 0]} />
          <meshStandardMaterial color="#f2c9a0" flatShading />
        </mesh>
        {[-0.1, 0.1].map((x) => (
          <mesh key={x} position={[x, 0.08, 0]} castShadow>
            <boxGeometry args={[0.1, 0.16, 0.14]} />
            <meshStandardMaterial color="#4a3426" flatShading />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function Residents() {
  const agents = useHameau((s) => s.world.agents);
  const houses = useHameau((s) => s.world.houses);
  return (
    <>
      {Object.values(agents).map((a, i) => (
        <Resident
          key={a.id}
          id={a.id}
          color={ROLE_COLOR[a.role]}
          phase={i * 1.3}
          small={!!a.family?.parentIds.length && houses[a.houseId]?.ownerId !== a.id}
        />
      ))}
    </>
  );
}

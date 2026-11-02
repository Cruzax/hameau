import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { distToPolyline, orientedRoadPath, pointAlong, polylineLength, ROLE_COLOR, type Message, type WorldState } from '@hameau/shared';
import { useHameau } from '../net/store';
import { riverPath } from './terrainMath';

const GROUND_Y = 0.07;
const BRIDGE_Y = 0.27;

/** Position d'un messager à l'instant présent, extrapolée entre deux ticks serveur. */
export function messengerPose(world: WorldState, msg: Message, tickAt: number) {
  const road = world.roads[msg.roadId];
  const from = world.agents[msg.from];
  if (!road || !from) return null;
  const path = orientedRoadPath(road, world.houses, msg.legFrom);
  const c = world.clock;
  const elapsedTicks = c.paused ? 0 : (performance.now() - tickAt) / (c.tickMs / c.speed);
  const t = Math.min(1, msg.progress + (msg.speed / polylineLength(path)) * Math.min(elapsedTicks, 1.5));
  const { p, heading } = pointAlong(path, t);
  const onBridge = distToPolyline(p, riverPath(world.terrain)) < world.terrain.river.width * 0.65 + 0.6;
  return { x: p.x, y: onBridge ? BRIDGE_Y : GROUND_Y, z: p.z, heading };
}

/** Un messager : il porte une enveloppe le long de la route, de l'expéditeur au destinataire. */
function Messenger({ id, color }: { id: string; color: string }) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);

  useFrame(({ clock }) => {
    const { world, tickAt } = useHameau.getState();
    const msg = world.messages[id];
    const pose = msg && messengerPose(world, msg, tickAt);
    if (!pose || !root.current) return;
    root.current.position.set(pose.x, pose.y, pose.z);
    root.current.rotation.y = pose.heading;
    if (body.current) body.current.position.y = Math.abs(Math.sin(clock.elapsedTime * 9)) * 0.12;
  });

  return (
    <group ref={root}>
      <group ref={body} scale={0.9}>
        <mesh position={[0, 0.42, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.28, 0.6, 6]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
        <mesh position={[0, 0.9, 0]} castShadow>
          <icosahedronGeometry args={[0.22, 0]} />
          <meshStandardMaterial color="#f2c9a0" flatShading />
        </mesh>
        {/* Enveloppe brandie au-dessus de la tête */}
        <group position={[0, 1.45, 0]} rotation={[0, 0, 0.15]}>
          <mesh castShadow>
            <boxGeometry args={[0.55, 0.36, 0.05]} />
            <meshStandardMaterial color="#fff8ea" emissive="#fff8ea" emissiveIntensity={0.25} />
          </mesh>
          <mesh position={[0, 0, 0.03]}>
            <cylinderGeometry args={[0.07, 0.07, 0.02, 8]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export function Messengers() {
  const messages = useHameau((s) => s.world.messages);
  const agents = useHameau((s) => s.world.agents);
  return (
    <>
      {Object.values(messages).map((m: Message) => (
        <Messenger key={m.id} id={m.id} color={ROLE_COLOR[agents[m.from]?.role ?? 'CITOYEN']} />
      ))}
    </>
  );
}

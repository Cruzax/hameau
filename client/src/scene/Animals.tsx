import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group } from 'three';
import { useHameau } from '../net/store';
import { agentPose } from './spots';
import { currentTick } from './effectLevel';
import { terrainHeight } from './terrainMath';

// Les bêtes du village : des poules autour des fermes, un chien qui suit le maire, un chat sur la place.

function Box({ args, position, color }: { args: [number, number, number]; position: [number, number, number]; color: string }) {
  return (
    <mesh position={position} castShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  );
}

/** Une poule qui picore en tournant autour de sa ferme. */
function Hen({ cx, cz, seed }: { cx: number; cz: number; seed: number }) {
  const root = useRef<Group>(null);
  const head = useRef<Group>(null);
  const terrain = useHameau((s) => s.world.terrain);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.25 + seed * 10;
    const x = cx + Math.cos(t + seed) * (2.2 + Math.sin(t * 1.7) * 0.8);
    const z = cz + Math.sin(t * 0.9 + seed) * (2.2 + Math.cos(t * 1.3) * 0.8);
    if (root.current) {
      const dx = x - root.current.position.x;
      const dz = z - root.current.position.z;
      root.current.position.set(x, terrainHeight(x, z, terrain), z);
      if (Math.abs(dx) + Math.abs(dz) > 1e-4) root.current.rotation.y = Math.atan2(dx, dz);
    }
    // Elle picore par à-coups.
    if (head.current) head.current.rotation.x = Math.max(0, Math.sin(clock.elapsedTime * 5 + seed * 3)) * 0.9;
  });
  return (
    <group ref={root} scale={0.6}>
      <Box args={[0.35, 0.3, 0.45]} position={[0, 0.3, 0]} color="#f5efe2" />
      <Box args={[0.1, 0.2, 0.12]} position={[0, 0.5, -0.22]} color="#efe7d6" />
      <group ref={head} position={[0, 0.5, 0.2]}>
        <Box args={[0.18, 0.2, 0.18]} position={[0, 0.05, 0.05]} color="#f5efe2" />
        <Box args={[0.05, 0.08, 0.08]} position={[0, 0.18, 0.05]} color="#d8433a" />
        <Box args={[0.06, 0.05, 0.1]} position={[0, 0.03, 0.18]} color="#e8a93a" />
      </group>
      {[-0.08, 0.08].map((x) => <Box key={x} args={[0.04, 0.15, 0.04]} position={[x, 0.08, 0]} color="#e8a93a" />)}
    </group>
  );
}

/** Le chien du maire : il le suit partout, avec un petit temps de retard, en remuant la queue. */
function Dog() {
  const root = useRef<Group>(null);
  const tail = useRef<Group>(null);
  useFrame(({ clock }, dt) => {
    const { world } = useHameau.getState();
    const pose = agentPose(world, world.mayorId, currentTick());
    if (!root.current || !pose) return;
    root.current.visible = !pose.hidden;
    // Il reste à un pas derrière son maître.
    const target = { x: pose.x - Math.sin(pose.heading) * 1.1 + 0.5, z: pose.z - Math.cos(pose.heading) * 1.1 };
    const p = root.current.position;
    const k = 1 - Math.exp(-dt * 3);
    const dx = (target.x - p.x) * k;
    const dz = (target.z - p.z) * k;
    p.set(p.x + dx, pose.y, p.z + dz);
    if (Math.abs(dx) + Math.abs(dz) > 0.002) root.current.rotation.y = Math.atan2(dx, dz);
    if (tail.current) tail.current.rotation.y = Math.sin(clock.elapsedTime * 14) * 0.6;
  });
  return (
    <group ref={root} scale={0.75}>
      <Box args={[0.3, 0.3, 0.6]} position={[0, 0.4, 0]} color="#9a6a3c" />
      <Box args={[0.28, 0.28, 0.3]} position={[0, 0.62, 0.38]} color="#a57442" />
      <Box args={[0.14, 0.12, 0.16]} position={[0, 0.56, 0.58]} color="#7a5230" />
      {[-0.1, 0.1].map((x) => <Box key={x} args={[0.07, 0.14, 0.05]} position={[x, 0.8, 0.34]} color="#6b4526" />)}
      {[[-0.1, 0.2], [0.1, 0.2], [-0.1, -0.2], [0.1, -0.2]].map(([x, z]) => (
        <Box key={`${x}:${z}`} args={[0.08, 0.26, 0.08]} position={[x, 0.13, z]} color="#7a5230" />
      ))}
      <group ref={tail} position={[0, 0.52, -0.3]}>
        <Box args={[0.06, 0.06, 0.25]} position={[0, 0.06, -0.1]} color="#7a5230" />
      </group>
    </group>
  );
}

/** Le chat de la place : il fait sa ronde autour du puits. Un clic pour lui donner un nom. */
function Cat() {
  const root = useRef<Group>(null);
  const plaza = useHameau((s) => s.world.terrain.plaza);
  const name = useHameau((s) => s.world.catName);
  const send = useHameau((s) => s.send);
  useFrame(({ clock }) => {
    if (!root.current) return;
    // Il marche un moment, puis s'assoit au soleil.
    const t = clock.elapsedTime * 0.12;
    const walk = Math.sin(t * 2.3) > -0.2;
    const angle = walk ? t * 1.6 : Math.floor(t * 1.6);
    const r = plaza.radius * 0.6;
    root.current.position.set(plaza.center.x + Math.cos(angle) * r, 0.05, plaza.center.z + Math.sin(angle) * r);
    root.current.rotation.y = -angle;
  });
  return (
    <group
      ref={root}
      scale={0.5}
      onClick={(e) => {
        e.stopPropagation();
        const next = window.prompt('Comment s’appelle le chat de la place ?', name ?? '');
        if (next?.trim()) send({ type: 'god.cat.name', name: next.trim() });
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <Box args={[0.3, 0.3, 0.6]} position={[0, 0.35, 0]} color="#e08a3c" />
      <Box args={[0.32, 0.3, 0.3]} position={[0, 0.6, 0.38]} color="#e8964a" />
      {[-0.1, 0.1].map((x) => <Box key={x} args={[0.08, 0.12, 0.06]} position={[x, 0.8, 0.36]} color="#c8742c" />)}
      {[-0.09, 0.09].map((x) => <Box key={x} args={[0.05, 0.05, 0.02]} position={[x, 0.63, 0.54]} color="#2f6b3a" />)}
      {[[-0.1, 0.2], [0.1, 0.2], [-0.1, -0.2], [0.1, -0.2]].map(([x, z]) => (
        <Box key={`${x}:${z}`} args={[0.08, 0.22, 0.08]} position={[x, 0.11, z]} color="#c8742c" />
      ))}
      <Box args={[0.06, 0.5, 0.06]} position={[0, 0.6, -0.32]} color="#c8742c" />
      {name && (
        <Html position={[0, 1.4, 0]} center zIndexRange={[10, 0]}>
          <div className="house-label"><div className="house-label__name">🐈 {name}</div></div>
        </Html>
      )}
    </group>
  );
}

export function Animals() {
  const houses = useHameau((s) => s.world.houses);
  const workplaces = useHameau((s) => s.world.workplaces);
  const farms = useMemo(
    () => Object.values(workplaces ?? {}).filter((w) => w.kind === 'ferme').map((w) => houses[w.houseId]).filter(Boolean),
    [workplaces, houses],
  );
  return (
    <>
      {farms.flatMap((h) => [0, 1, 2].map((i) => <Hen key={`${h.id}:${i}`} cx={h.position.x} cz={h.position.z} seed={i * 2.1 + h.position.x} />))}
      <Dog />
      <Cat />
    </>
  );
}

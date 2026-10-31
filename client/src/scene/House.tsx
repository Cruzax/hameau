import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group } from 'three';
import { ROLE_COLOR, ROLE_LABEL, type Agent, type House as HouseData, type HouseStyle } from '@hameau/shared';

interface Dims { w: number; d: number; h: number; roof: number }

const DIMS: Record<HouseStyle, Dims> = {
  mairie: { w: 4.4, d: 3.2, h: 2.6, roof: 1.9 },
  tour: { w: 2.4, d: 2.4, h: 4.6, roof: 2.2 },
  chaumiere: { w: 3.2, d: 2.8, h: 2.0, roof: 2.1 },
  atelier: { w: 3.6, d: 3.0, h: 2.2, roof: 1.6 },
  cabane: { w: 3.0, d: 2.6, h: 1.9, roof: 1.7 },
};

const WOOD = '#6b4a2f';
const STONE = '#b3a58c';
const WINDOW = '#ffe2a0';

function Box({ args, position, color, emissive }: { args: [number, number, number]; position: [number, number, number]; color: string; emissive?: boolean }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} flatShading emissive={emissive ? color : '#000'} emissiveIntensity={emissive ? 0.35 : 0} />
    </mesh>
  );
}

/** Détails propres à chaque style ; tous construits en primitives, remplaçables par un .glb. */
function Extras({ style, dims, roofColor }: { style: HouseStyle; dims: Dims; roofColor: string }) {
  const top = dims.h + dims.roof;
  switch (style) {
    case 'mairie':
      return (
        <>
          <Box args={[dims.w * 0.9, 0.2, 0.8]} position={[0, 0.1, dims.d / 2 + 0.4]} color={STONE} />
          <Box args={[0.08, 1.6, 0.08]} position={[0, top + 0.6, 0]} color={WOOD} />
          <Box args={[0.7, 0.42, 0.04]} position={[0.37, top + 1.15, 0]} color="#c8553d" />
          <mesh position={[0, dims.h * 0.82, dims.d / 2 + 0.05]}>
            <cylinderGeometry args={[0.38, 0.38, 0.08, 12]} />
            <meshStandardMaterial color="#f6ead2" />
          </mesh>
        </>
      );
    case 'tour':
      return (
        <>
          <Box args={[0.6, 0.5, 0.06]} position={[0, dims.h * 0.82, dims.d / 2 + 0.01]} color={WINDOW} emissive />
          <Box args={[dims.w + 0.5, 0.18, dims.d + 0.5]} position={[0, dims.h, 0]} color={WOOD} />
        </>
      );
    case 'atelier':
      return <Box args={[0.55, 1.6, 0.55]} position={[dims.w * 0.28, dims.h + dims.roof * 0.6, -dims.d * 0.15]} color="#8f7f6a" />;
    case 'cabane':
      return (
        <>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[dims.w / 2 + 0.45, 0.18 + i * 0.3, 0.2 - i * 0.05]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.15, 0.15, 1.2, 6]} />
              <meshStandardMaterial color="#8a5f3c" flatShading />
            </mesh>
          ))}
        </>
      );
    case 'chaumiere':
      return (
        <>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (dims.w / 2 + 0.3), 0.35, dims.d / 2 - 0.2]} castShadow>
              <dodecahedronGeometry args={[0.45, 0]} />
              <meshStandardMaterial color={s < 0 ? '#c66a8a' : '#e0a14a'} flatShading />
            </mesh>
          ))}
          <Box args={[0.45, 1.1, 0.45]} position={[-dims.w * 0.25, dims.h + dims.roof * 0.55, 0]} color={roofColor} />
        </>
      );
  }
}

/** Les maisons apparues en cours de partie « poussent » du sol (construction). */
const BUILD_SECONDS = 1.6;
const LOAD_GRACE_MS = 4000;

export function House({ house, owner, isMayor }: { house: HouseData; owner?: Agent; isMayor: boolean }) {
  const dims = DIMS[house.style];
  const root = useRef<Group>(null);
  const born = useRef(performance.now());
  const animate = useRef(born.current > LOAD_GRACE_MS);
  useFrame(() => {
    if (!animate.current || !root.current) return;
    const t = Math.min(1, (performance.now() - born.current) / 1000 / BUILD_SECONDS);
    const ease = 1 - Math.pow(1 - t, 3);
    root.current.scale.set(1, Math.max(0.01, ease), 1);
    if (t >= 1) animate.current = false;
  });
  // Cône à 4 faces tourné de 45° = toit en pyramide, étiré pour couvrir le rectangle.
  const roofScale: [number, number, number] = [(dims.w * 1.2) / Math.SQRT2, 1, (dims.d * 1.25) / Math.SQRT2];
  const winY = Math.min(dims.h * 0.55, 1.4);

  return (
    <group ref={root} position={[house.position.x, 0, house.position.z]} rotation={[0, house.rotation, 0]} name={house.id}>
      <Box args={[dims.w + 0.3, 0.25, dims.d + 0.3]} position={[0, 0.125, 0]} color={STONE} />
      <Box args={[dims.w, dims.h, dims.d]} position={[0, dims.h / 2 + 0.2, 0]} color={house.wallColor} />
      <mesh position={[0, dims.h + 0.2 + dims.roof / 2, 0]} rotation={[0, Math.PI / 4, 0]} scale={roofScale} castShadow>
        <coneGeometry args={[1, dims.roof, 4]} />
        <meshStandardMaterial color={house.roofColor} flatShading />
      </mesh>
      <Box args={[0.75, 1.25, 0.08]} position={[0, 0.82, dims.d / 2 + 0.02]} color={WOOD} />
      {dims.w > 2.6 &&
        [-1, 1].map((s) => (
          <Box key={s} args={[0.55, 0.5, 0.06]} position={[s * dims.w * 0.3, winY + 0.2, dims.d / 2 + 0.01]} color={WINDOW} emissive />
        ))}
      <Extras style={house.style} dims={dims} roofColor={house.roofColor} />

      {owner && (
        <Html position={[0, dims.h + dims.roof + (house.style === 'mairie' ? 2.4 : 1.1), 0]} center zIndexRange={[10, 0]}>
          <div className="house-label">
            <div className="house-label__role" style={{ background: ROLE_COLOR[owner.role] }}>
              {isMayor && <span className="house-label__crown">👑</span>}
              {ROLE_LABEL[owner.role]}
            </div>
            <div className="house-label__name">{owner.name}</div>
          </div>
        </Html>
      )}
    </group>
  );
}

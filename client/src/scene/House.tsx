import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { MeshStandardMaterial, type Group } from 'three';
import { ROLE_COLOR, ROLE_LABEL, type Agent, type House as HouseData, type HouseStyle } from '@hameau/shared';

interface Dims { w: number; d: number; h: number; roof: number }

const DIMS: Record<HouseStyle, Dims> = {
  mairie: { w: 4.4, d: 3.2, h: 2.6, roof: 1.9 },
  tour: { w: 2.4, d: 2.4, h: 4.6, roof: 2.2 },
  chaumiere: { w: 3.2, d: 2.8, h: 2.0, roof: 2.1 },
  atelier: { w: 3.6, d: 3.0, h: 2.2, roof: 1.6 },
  cabane: { w: 3.0, d: 2.6, h: 1.9, roof: 1.7 },
  boulangerie: { w: 3.6, d: 3.0, h: 2.2, roof: 1.7 },
  forge: { w: 3.8, d: 3.2, h: 2.0, roof: 1.4 },
  auberge: { w: 5.0, d: 3.6, h: 3.0, roof: 2.0 },
  echoppe: { w: 3.0, d: 2.6, h: 2.0, roof: 1.8 },
};

const WOOD = '#6b4a2f';
const STONE = '#b3a58c';
const WINDOW = '#ffe2a0';

/** Matériau commun à toutes les fenêtres : Lights l'allume la nuit. */
export const WINDOW_MATERIAL = new MeshStandardMaterial({ color: WINDOW, emissive: WINDOW, emissiveIntensity: 0.35, flatShading: true });

function Box({ args, position, color, emissive }: { args: [number, number, number]; position: [number, number, number]; color: string; emissive?: boolean }) {
  // Les fenêtres partagent un matériau commun (allumé la nuit) ; les autres éléments lumineux gardent le leur.
  if (emissive && color === WINDOW) {
    return (
      <mesh position={position} material={WINDOW_MATERIAL} castShadow receiveShadow>
        <boxGeometry args={args} />
      </mesh>
    );
  }
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} flatShading emissive={emissive ? color : '#000'} emissiveIntensity={emissive ? 0.6 : 0} />
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
    case 'boulangerie':
      return (
        <>
          {/* Four à pain en dôme, contre le mur */}
          <mesh position={[dims.w / 2 + 0.7, 0.2, -0.2]} castShadow>
            <sphereGeometry args={[0.9, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#c9a27a" flatShading />
          </mesh>
          <Box args={[0.45, 0.4, 0.1]} position={[dims.w / 2 + 0.7, 0.4, 0.68]} color="#3a2414" />
          <Box args={[0.4, 1.4, 0.4]} position={[-dims.w * 0.3, dims.h + dims.roof * 0.55, -0.3]} color="#8f7f6a" />
          {/* Enseigne : une miche */}
          <mesh position={[0, dims.h + 0.05, dims.d / 2 + 0.35]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.6, 0.5]}>
            <sphereGeometry args={[0.35, 8, 6]} />
            <meshStandardMaterial color="#d99a4a" flatShading />
          </mesh>
        </>
      );
    case 'forge':
      return (
        <>
          {/* Appentis ouvert avec enclume et foyer rougeoyant */}
          <Box args={[1.8, 0.12, 1.8]} position={[dims.w / 2 + 0.9, 1.9, 0]} color="#4a4a50" />
          {[-0.75, 0.75].map((z) => (
            <Box key={z} args={[0.12, 1.9, 0.12]} position={[dims.w / 2 + 1.7, 0.95, z]} color="#6b4a2f" />
          ))}
          <Box args={[0.6, 0.25, 0.3]} position={[dims.w / 2 + 0.9, 0.75, 0.3]} color="#2c2c30" />
          <Box args={[0.25, 0.5, 0.25]} position={[dims.w / 2 + 0.9, 0.38, 0.3]} color="#5a4030" />
          <Box args={[0.7, 0.5, 0.7]} position={[dims.w / 2 + 0.9, 0.25, -0.5]} color="#ff7a2a" emissive />
          <Box args={[0.6, 1.8, 0.6]} position={[dims.w * 0.25, dims.h + dims.roof * 0.6, 0]} color="#5b5f66" />
        </>
      );
    case 'auberge':
      return (
        <>
          {/* Étage, enseigne, tonneaux et banc */}
          {[-1, 1].map((s) => (
            <Box key={s} args={[0.55, 0.5, 0.06]} position={[s * dims.w * 0.3, dims.h * 0.78, dims.d / 2 + 0.01]} color={WINDOW} emissive />
          ))}
          <Box args={[0.08, 0.08, 0.9]} position={[dims.w / 2 - 0.2, 2.1, dims.d / 2 + 0.45]} color={WOOD} />
          <Box args={[0.7, 0.5, 0.06]} position={[dims.w / 2 - 0.2, 1.75, dims.d / 2 + 0.85]} color="#e0b04a" />
          {[0, 0.75].map((x) => (
            <mesh key={x} position={[-dims.w / 2 - 0.5 + x, 0.4, dims.d / 2 - 0.2]} castShadow>
              <cylinderGeometry args={[0.32, 0.32, 0.8, 8]} />
              <meshStandardMaterial color="#8a5f3c" flatShading />
            </mesh>
          ))}
          <Box args={[1.6, 0.12, 0.4]} position={[0.8, 0.45, dims.d / 2 + 0.6]} color={WOOD} />
        </>
      );
    case 'echoppe':
      return (
        <>
          {/* Pots d'herbes et bouquets qui sèchent */}
          {[-0.8, 0, 0.8].map((x, i) => (
            <group key={x} position={[x, 0, dims.d / 2 + 0.6]}>
              <mesh position={[0, 0.2, 0]} castShadow>
                <cylinderGeometry args={[0.2, 0.15, 0.4, 6]} />
                <meshStandardMaterial color="#b0603a" flatShading />
              </mesh>
              <mesh position={[0, 0.6, 0]} castShadow>
                <coneGeometry args={[0.28, 0.6, 5]} />
                <meshStandardMaterial color={['#5f8f3a', '#7aa548', '#8a6aa8'][i]} flatShading />
              </mesh>
            </group>
          ))}
          <Box args={[dims.w * 0.8, 0.06, 0.06]} position={[0, dims.h - 0.1, dims.d / 2 + 0.25]} color={WOOD} />
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

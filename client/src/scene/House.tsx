import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Color, ExtrudeGeometry, MeshStandardMaterial, Shape, type Group, type Mesh } from 'three';
import { ROLE_COLOR, ROLE_LABEL, type Agent, type House as HouseData, type HouseStyle } from '@hameau/shared';
import { useUI } from '../ui/uiStore';
import { useLayout } from '../ui/layoutStore';

interface Dims { w: number; d: number; h: number; roof: number }

const DIMS: Record<HouseStyle, Dims> = {
  mairie: { w: 4.6, d: 3.2, h: 2.7, roof: 1.8 },
  tour: { w: 2.4, d: 2.4, h: 4.6, roof: 2.2 },
  chaumiere: { w: 3.4, d: 2.8, h: 2.0, roof: 1.9 },
  atelier: { w: 3.6, d: 3.0, h: 2.2, roof: 1.5 },
  cabane: { w: 3.0, d: 2.6, h: 1.9, roof: 1.5 },
  boulangerie: { w: 3.6, d: 3.0, h: 2.2, roof: 1.6 },
  forge: { w: 3.8, d: 3.2, h: 2.0, roof: 1.3 },
  auberge: { w: 5.0, d: 3.6, h: 3.0, roof: 2.0 },
  echoppe: { w: 3.0, d: 2.6, h: 2.0, roof: 1.7 },
  ferme: { w: 5.2, d: 3.4, h: 2.4, roof: 1.8 },
  moulin: { w: 3.0, d: 3.0, h: 3.6, roof: 1.8 },
  scierie: { w: 5.0, d: 3.4, h: 2.2, roof: 1.2 },
  carrefour: { w: 0, d: 0, h: 0, roof: 0 },
};

/** Où sort la cheminée (en fraction de la largeur), et la couleur de sa fumée. */
const CHIMNEY: Partial<Record<HouseStyle, { x: number; smoke: string }>> = {
  chaumiere: { x: -0.28, smoke: '#d8d2c8' },
  atelier: { x: 0.3, smoke: '#d8d2c8' },
  cabane: { x: 0.3, smoke: '#d8d2c8' },
  boulangerie: { x: -0.3, smoke: '#efe8dc' },
  forge: { x: 0.25, smoke: '#7d7a78' },
  auberge: { x: 0.32, smoke: '#d8d2c8' },
  echoppe: { x: -0.25, smoke: '#c9d8c0' },
};
/** Maisons à colombages (poutres apparentes sur la façade). */
const TIMBERED: HouseStyle[] = ['chaumiere', 'auberge', 'boulangerie', 'echoppe'];
/** Maisons avec un petit potager clôturé. */
const GARDEN: HouseStyle[] = ['chaumiere', 'cabane', 'echoppe'];

const WOOD = '#6b4a2f';
const BEAM = '#5a3d27';
const STONE = '#b3a58c';
const STONE_DARK = '#9a8c74';
const WINDOW = '#ffe2a0';
const FLOWERS = ['#d9536b', '#f0c24a', '#8a6aa8', '#e8e0f0'];

/** Matériau commun à toutes les fenêtres et lanternes : Lights l'allume la nuit. */
export const WINDOW_MATERIAL = new MeshStandardMaterial({ color: WINDOW, emissive: WINDOW, emissiveIntensity: 0.35, flatShading: true });

function Box({ args, position, color, emissive, rotation }: {
  args: [number, number, number];
  position: [number, number, number];
  color: string;
  emissive?: boolean;
  rotation?: [number, number, number];
}) {
  if (emissive && color === WINDOW) {
    return (
      <mesh position={position} rotation={rotation} material={WINDOW_MATERIAL} castShadow receiveShadow>
        <boxGeometry args={args} />
      </mesh>
    );
  }
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} flatShading emissive={emissive ? color : '#000'} emissiveIntensity={emissive ? 0.6 : 0} />
    </mesh>
  );
}

const darker = (hex: string, k = 0.75) => `#${new Color(hex).multiplyScalar(k).getHexString()}`;

/** Prisme triangulaire (toit à deux pans), faîtage le long de x. */
function prism(base: number, height: number, length: number) {
  const s = new Shape();
  s.moveTo(-base / 2, 0);
  s.lineTo(base / 2, 0);
  s.lineTo(0, height);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: length, bevelEnabled: false });
  g.translate(0, 0, -length / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

/** Toit à deux pans avec débord, pignons dans la couleur des murs et faîtage. */
function GableRoof({ dims, wall, roof }: { dims: Dims; wall: string; roof: string }) {
  const outer = useMemo(() => prism(dims.d + 0.7, dims.roof + 0.25, dims.w + 0.5), [dims]);
  const inner = useMemo(() => prism(dims.d, dims.roof, dims.w - 0.02), [dims]);
  const y = dims.h + 0.2;
  return (
    <group position={[0, y, 0]}>
      <mesh geometry={inner} receiveShadow>
        <meshStandardMaterial color={wall} flatShading />
      </mesh>
      <mesh geometry={outer} position={[0, -0.12, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={roof} flatShading />
      </mesh>
      <Box args={[dims.w + 0.6, 0.12, 0.16]} position={[0, dims.roof + 0.12, 0]} color={darker(roof, 0.6)} />
    </group>
  );
}

/** Toit en pyramide (tours). */
function PyramidRoof({ dims, roof }: { dims: Dims; roof: string }) {
  const scale: [number, number, number] = [(dims.w * 1.25) / Math.SQRT2, 1, (dims.d * 1.25) / Math.SQRT2];
  return (
    <mesh position={[0, dims.h + 0.2 + dims.roof / 2, 0]} rotation={[0, Math.PI / 4, 0]} scale={scale} castShadow>
      <coneGeometry args={[1, dims.roof, 4]} />
      <meshStandardMaterial color={roof} flatShading />
    </mesh>
  );
}

/** Fenêtre avec encadrement, volets et jardinière fleurie. */
function Window({ position, rotation = 0, shutter, flowers = true }: { position: [number, number, number]; rotation?: number; shutter: string; flowers?: boolean }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Box args={[0.68, 0.62, 0.06]} position={[0, 0, 0]} color={BEAM} />
      <Box args={[0.52, 0.48, 0.05]} position={[0, 0, 0.02]} color={WINDOW} emissive />
      <Box args={[0.04, 0.48, 0.02]} position={[0, 0, 0.05]} color={BEAM} />
      {[-1, 1].map((s) => (
        <Box key={s} args={[0.26, 0.56, 0.04]} position={[s * 0.48, 0, 0.03]} color={shutter} />
      ))}
      {flowers && (
        <group position={[0, -0.38, 0.12]}>
          <Box args={[0.62, 0.14, 0.18]} position={[0, 0, 0]} color={WOOD} />
          {[-0.2, 0, 0.2].map((x, i) => (
            <mesh key={x} position={[x, 0.12, 0]} castShadow>
              <icosahedronGeometry args={[0.09, 0]} />
              <meshStandardMaterial color={FLOWERS[i % FLOWERS.length]} flatShading />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

/** Colombages : poteaux d'angle, sablières et écharpes en croix sur la façade. */
function Timbers({ dims }: { dims: Dims }) {
  const z = dims.d / 2 + 0.03;
  const y0 = 0.2;
  const braceLen = Math.hypot(dims.w * 0.22, dims.h * 0.45);
  const braceAngle = Math.atan2(dims.h * 0.45, dims.w * 0.22);
  return (
    <group>
      {[-1, 1].map((s) => (
        <Box key={`p${s}`} args={[0.14, dims.h, 0.08]} position={[s * (dims.w / 2 - 0.07), y0 + dims.h / 2, z]} color={BEAM} />
      ))}
      <Box args={[dims.w, 0.12, 0.08]} position={[0, y0 + dims.h - 0.06, z]} color={BEAM} />
      <Box args={[dims.w, 0.1, 0.08]} position={[0, y0 + dims.h * 0.48, z]} color={BEAM} />
      {[-1, 1].map((s) => (
        <Box
          key={`b${s}`}
          args={[0.08, braceLen, 0.06]}
          position={[s * (dims.w / 2 - 0.07 - dims.w * 0.11), y0 + dims.h * 0.48 + dims.h * 0.225, z + 0.01]}
          rotation={[0, 0, s * (Math.PI / 2 - braceAngle)]}
          color={BEAM}
        />
      ))}
      {/* Poteaux d'angle visibles sur les côtés */}
      {[-1, 1].map((s) => (
        <Box key={`c${s}`} args={[0.08, dims.h, 0.14]} position={[s * (dims.w / 2 + 0.03), y0 + dims.h / 2, dims.d / 2 - 0.07]} color={BEAM} />
      ))}
    </group>
  );
}

/** Fumée qui monte de la cheminée, en volutes. */
function Smoke({ color, dark }: { color: string; dark?: boolean }) {
  const puffs = useRef<(Mesh | null)[]>([]);
  const mats = useMemo(() => Array.from({ length: 5 }, () => new MeshStandardMaterial({ color, transparent: true, opacity: 0, flatShading: true, depthWrite: false })), [color]);
  useFrame(({ clock }) => {
    puffs.current.forEach((m, i) => {
      if (!m) return;
      const t = (clock.elapsedTime * (dark ? 0.32 : 0.22) + i / 5) % 1;
      m.position.set(Math.sin(t * 4 + i) * 0.15 + t * 0.4, t * 2.4, Math.cos(t * 3 + i) * 0.1);
      m.scale.setScalar(0.18 + t * 0.45);
      mats[i].opacity = (1 - t) * (dark ? 0.75 : 0.5);
    });
  });
  return (
    <group>
      {mats.map((mat, i) => (
        <mesh key={i} ref={(m) => (puffs.current[i] = m)} material={mat}>
          <icosahedronGeometry args={[1, 0]} />
        </mesh>
      ))}
    </group>
  );
}

/** Cheminée en pierre qui traverse le toit, avec sa fumée. */
function Chimney({ dims, x, smoke, dark }: { dims: Dims; x: number; smoke: string; dark?: boolean }) {
  const px = dims.w * x;
  const top = dims.h + 0.2 + dims.roof * 0.85;
  const z = -dims.d * 0.15;
  return (
    <group position={[px, 0, z]}>
      <Box args={[0.5, dims.roof + 0.4, 0.5]} position={[0, dims.h + 0.2 + dims.roof * 0.85 - (dims.roof + 0.4) / 2 + 0.25, 0]} color={dark ? '#5b5f66' : STONE_DARK} />
      <Box args={[0.62, 0.12, 0.62]} position={[0, top + 0.3, 0]} color={darker(STONE_DARK, 0.8)} />
      <group position={[0, top + 0.4, 0]}>
        <Smoke color={smoke} dark={dark} />
      </group>
    </group>
  );
}

/** Lanterne près de la porte : elle s'allume avec les fenêtres. */
function Lantern({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Box args={[0.07, 1.3, 0.07]} position={[0, 0.65, 0]} color={BEAM} />
      <Box args={[0.22, 0.26, 0.22]} position={[0, 1.4, 0]} color={WINDOW} emissive />
      <Box args={[0.3, 0.05, 0.3]} position={[0, 1.55, 0]} color={BEAM} />
    </group>
  );
}

/** Petit potager clôturé sur le côté de la maison. */
function Garden({ dims, side }: { dims: Dims; side: number }) {
  const gx = side * (dims.w / 2 + 1.2);
  const posts = [-0.9, -0.3, 0.3, 0.9];
  return (
    <group position={[gx, 0, 0.2]}>
      <Box args={[1.8, 0.08, 2]} position={[0, 0.04, 0]} color="#7a5a3a" />
      {[-0.5, 0, 0.5].map((z) =>
        [-0.5, 0, 0.5].map((x) => (
          <mesh key={`${x}${z}`} position={[x, 0.18, z]} castShadow>
            <icosahedronGeometry args={[0.16, 0]} />
            <meshStandardMaterial color={(x + z) % 1 === 0 ? '#5f8f3a' : '#7aa548'} flatShading />
          </mesh>
        )),
      )}
      {/* Clôture */}
      {posts.map((p) => (
        <group key={p}>
          <Box args={[0.06, 0.45, 0.06]} position={[p, 0.22, 1.05]} color="#c8a878" />
          <Box args={[0.06, 0.45, 0.06]} position={[p, 0.22, -1.05]} color="#c8a878" />
          <Box args={[0.06, 0.45, 0.06]} position={[side > 0 ? 0.95 : -0.95, 0.22, p * 1.1]} color="#c8a878" />
        </group>
      ))}
      {[1.05, -1.05].map((z) => (
        <Box key={z} args={[1.9, 0.05, 0.04]} position={[0, 0.34, z]} color="#c8a878" />
      ))}
      <Box args={[0.04, 0.05, 2.1]} position={[side > 0 ? 0.95 : -0.95, 0.34, 0]} color="#c8a878" />
    </group>
  );
}

/** Détails propres à chaque métier ; tous en primitives, remplaçables par un .glb. */
function Extras({ style, dims }: { style: HouseStyle; dims: Dims }) {
  const top = dims.h + 0.2 + dims.roof;
  switch (style) {
    case 'mairie':
      return (
        <>
          <Box args={[dims.w * 0.9, 0.2, 0.8]} position={[0, 0.1, dims.d / 2 + 0.4]} color={STONE} />
          {/* Clocheton avec cloche, horloge et drapeau */}
          <Box args={[0.9, 0.9, 0.9]} position={[0, top + 0.35, 0]} color="#f3e3c3" />
          <mesh position={[0, top + 1.1, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[0.8, 0.7, 4]} />
            <meshStandardMaterial color="#c0573e" flatShading />
          </mesh>
          <mesh position={[0, top + 0.38, 0.47]}>
            <cylinderGeometry args={[0.28, 0.28, 0.04, 12]} />
            <meshStandardMaterial color="#f6ead2" />
          </mesh>
          <Box args={[0.03, 0.2, 0.02]} position={[0, top + 0.45, 0.5]} color="#2c2c30" />
          <Box args={[0.06, 1.0, 0.06]} position={[0, top + 1.9, 0]} color={WOOD} />
          <Box args={[0.6, 0.36, 0.04]} position={[0.32, top + 2.2, 0]} color="#c8553d" />
          {[-1, 1].map((s) => (
            <Box key={s} args={[0.3, 0.3, 2.6]} position={[s * (dims.w / 2 + 0.05), 0.15, 0]} color={STONE_DARK} />
          ))}
        </>
      );
    case 'tour':
      return (
        <>
          <Box args={[0.6, 0.5, 0.06]} position={[0, dims.h * 0.82, dims.d / 2 + 0.01]} color={WINDOW} emissive />
          <Box args={[dims.w + 0.5, 0.18, dims.d + 0.5]} position={[0, dims.h, 0]} color={WOOD} />
          {[-1, 1].map((sx) =>
            [-1, 1].map((sz) => (
              <Box key={`${sx}${sz}`} args={[0.1, 0.5, 0.1]} position={[sx * (dims.w / 2 + 0.2), dims.h + 0.3, sz * (dims.d / 2 + 0.2)]} color={WOOD} />
            )),
          )}
          {[-1, 1].map((s) => (
            <Box key={s} args={[dims.w + 0.5, 0.06, 0.06]} position={[0, dims.h + 0.5, s * (dims.d / 2 + 0.2)]} color={WOOD} />
          ))}
        </>
      );
    case 'cabane':
      return (
        <>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[dims.w / 2 + 0.45, 0.18 + i * 0.3, -0.4 - i * 0.05]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.15, 0.15, 1.2, 6]} />
              <meshStandardMaterial color="#8a5f3c" flatShading />
            </mesh>
          ))}
          {/* Bardage : planches horizontales */}
          {[0.5, 0.95, 1.4, 1.85].map((y) => (
            <Box key={y} args={[dims.w + 0.02, 0.05, 0.04]} position={[0, y, dims.d / 2 + 0.02]} color={darker('#b07a4f', 0.7)} />
          ))}
        </>
      );
    case 'boulangerie':
      return (
        <>
          <mesh position={[dims.w / 2 + 0.7, 0.2, -0.2]} castShadow>
            <sphereGeometry args={[0.9, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#c9a27a" flatShading />
          </mesh>
          <Box args={[0.45, 0.4, 0.1]} position={[dims.w / 2 + 0.7, 0.4, 0.68]} color="#ff9a4a" emissive />
          {/* Enseigne suspendue : une miche */}
          <Box args={[0.06, 0.06, 0.7]} position={[dims.w / 2 - 0.3, 1.9, dims.d / 2 + 0.35]} color={WOOD} />
          <mesh position={[dims.w / 2 - 0.3, 1.65, dims.d / 2 + 0.65]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.6, 0.5]}>
            <sphereGeometry args={[0.32, 8, 6]} />
            <meshStandardMaterial color="#d99a4a" flatShading />
          </mesh>
          {/* Auvent rayé */}
          <Box args={[1.8, 0.06, 0.7]} position={[-dims.w * 0.2, 1.75, dims.d / 2 + 0.35]} rotation={[0.35, 0, 0]} color="#c8553d" />
        </>
      );
    case 'forge':
      return (
        <>
          <Box args={[1.8, 0.12, 1.8]} position={[dims.w / 2 + 0.9, 1.9, 0]} color="#4a4a50" />
          {[-0.75, 0.75].map((z) => (
            <Box key={z} args={[0.12, 1.9, 0.12]} position={[dims.w / 2 + 1.7, 0.95, z]} color={WOOD} />
          ))}
          <Box args={[0.6, 0.25, 0.3]} position={[dims.w / 2 + 0.9, 0.75, 0.3]} color="#2c2c30" />
          <Box args={[0.25, 0.5, 0.25]} position={[dims.w / 2 + 0.9, 0.38, 0.3]} color="#5a4030" />
          <Box args={[0.7, 0.5, 0.7]} position={[dims.w / 2 + 0.9, 0.25, -0.5]} color="#ff7a2a" emissive />
          <Box args={[0.08, 0.6, 0.5]} position={[dims.w / 2 + 0.05, 1.2, -0.5]} color="#7a7a80" />
        </>
      );
    case 'auberge':
      return (
        <>
          {[-1, 1].map((s) => (
            <Window key={s} position={[s * dims.w * 0.3, dims.h * 0.78, dims.d / 2 + 0.04]} shutter="#7a3a2a" />
          ))}
          <Box args={[0.08, 0.08, 0.9]} position={[dims.w / 2 - 0.2, 2.1, dims.d / 2 + 0.45]} color={WOOD} />
          <Box args={[0.7, 0.5, 0.06]} position={[dims.w / 2 - 0.2, 1.75, dims.d / 2 + 0.85]} color="#e0b04a" />
          {[0, 0.75].map((x) => (
            <mesh key={x} position={[-dims.w / 2 - 0.5 + x, 0.4, dims.d / 2 - 0.2]} castShadow>
              <cylinderGeometry args={[0.32, 0.32, 0.8, 8]} />
              <meshStandardMaterial color="#8a5f3c" flatShading />
            </mesh>
          ))}
          <Box args={[1.6, 0.12, 0.4]} position={[1.1, 0.45, dims.d / 2 + 0.7]} color={WOOD} />
          {/* Tables en terrasse */}
          {[-1.2, 0.2].map((x) => (
            <group key={x} position={[x, 0, dims.d / 2 + 1.5]}>
              <mesh position={[0, 0.5, 0]} castShadow>
                <cylinderGeometry args={[0.4, 0.4, 0.06, 8]} />
                <meshStandardMaterial color={WOOD} flatShading />
              </mesh>
              <Box args={[0.08, 0.5, 0.08]} position={[0, 0.25, 0]} color={BEAM} />
            </group>
          ))}
        </>
      );
    case 'echoppe':
      return (
        <>
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
          {/* Bouquets qui sèchent sous l'avant-toit */}
          {[-0.6, -0.2, 0.2, 0.6].map((x, i) => (
            <mesh key={x} position={[x, dims.h - 0.05, dims.d / 2 + 0.3]} rotation={[Math.PI, 0, 0]} castShadow>
              <coneGeometry args={[0.1, 0.35, 5]} />
              <meshStandardMaterial color={['#7a9a4a', '#a0844a', '#6a8a5a', '#9a6a8a'][i]} flatShading />
            </mesh>
          ))}
        </>
      );
    case 'ferme':
      return (
        <>
          {/* Champ de blé sur le côté, en carreaux dorés */}
          <group position={[-dims.w / 2 - 2.2, 0, 0]}>
            <Box args={[3.2, 0.06, 3.6]} position={[0, 0.03, 0]} color="#8a6a3a" />
            {[-1.1, -0.37, 0.37, 1.1].map((x) =>
              [-1.3, -0.45, 0.45, 1.3].map((z) => (
                <Box key={`${x}:${z}`} args={[0.62, 0.45, 0.7]} position={[x, 0.26, z]} color={(x + z) % 2 === 0 ? '#e0b84a' : '#d4a83c'} />
              )),
            )}
          </group>
          {/* Meules de foin */}
          {[-0.6, 0.6].map((z) => (
            <mesh key={z} position={[dims.w / 2 + 0.8, 0.45, z]} castShadow>
              <cylinderGeometry args={[0.45, 0.55, 0.9, 8]} />
              <meshStandardMaterial color="#d9b85a" flatShading />
            </mesh>
          ))}
          {/* Grande porte de grange */}
          <Box args={[1.6, 1.6, 0.08]} position={[dims.w * 0.25, 1.0, dims.d / 2 + 0.05]} color="#8a3a2a" />
        </>
      );
    case 'moulin':
      return <MillSails dims={dims} />;
    case 'scierie':
      return (
        <>
          {/* Tas de rondins et planches sciées */}
          {[0, 1, 2].map((i) =>
            [0, 1, 2 - i].map((j) => (
              <mesh key={`${i}:${j}`} position={[dims.w / 2 + 1.0, 0.2 + i * 0.36, -0.7 + j * 0.42 + i * 0.2]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.18, 0.18, 1.8, 6]} />
                <meshStandardMaterial color="#8a5f3c" flatShading />
              </mesh>
            )),
          )}
          {[0, 1, 2, 3].map((i) => (
            <Box key={i} args={[1.8, 0.08, 0.35]} position={[-dims.w / 2 - 1.1, 0.06 + i * 0.09, 0.4]} color="#c8a070" />
          ))}
          {/* Grande lame circulaire sous l'auvent */}
          <mesh position={[0, 1.1, dims.d / 2 + 0.5]} rotation={[0, 0, 0]} castShadow>
            <cylinderGeometry args={[0.55, 0.55, 0.05, 14]} />
            <meshStandardMaterial color="#9aa0a8" metalness={0.4} roughness={0.4} />
          </mesh>
          <Box args={[dims.w + 0.6, 0.1, 1.4]} position={[0, dims.h + 0.25, dims.d / 2 + 0.6]} color={WOOD} />
        </>
      );
    default:
      return null;
  }
}

/** Ailes du moulin : quatre pales qui tournent lentement sur la façade. */
function MillSails({ dims }: { dims: Dims }) {
  const hub = useRef<Group>(null);
  useFrame((_, dt) => {
    if (hub.current) hub.current.rotation.z += dt * 0.6;
  });
  return (
    <group position={[0, dims.h + 0.4, dims.d / 2 + 0.35]}>
      <Box args={[0.3, 0.3, 0.5]} position={[0, 0, -0.1]} color={WOOD} />
      <group ref={hub}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <Box args={[0.12, 2.4, 0.06]} position={[0, 1.25, 0.1]} color={BEAM} />
            <Box args={[0.6, 1.8, 0.03]} position={[0.32, 1.45, 0.12]} color="#efe6d2" />
          </group>
        ))}
      </group>
    </group>
  );
}

/** Nom affiché au-dessus d'un lieu de travail. */
export const WORKPLACE_LABEL: Record<string, string> = {
  ferme: 'Ferme', moulin: 'Moulin', scierie: 'Scierie', forge: 'Forge', boulangerie: 'Boulangerie', auberge: 'Auberge', herboristerie: 'Herboristerie',
};

/** Ouvre la fiche d'une maison (ou d'un lieu de travail) au premier plan. */
export function openHouseSheet(id: string) {
  useUI.getState().set({ selectedHouse: id });
  const layout = useLayout.getState();
  layout.update('maison', { open: true, collapsed: false });
  layout.focus('maison');
}

/** Les maisons apparues en cours de partie « poussent » du sol (construction). */
const BUILD_SECONDS = 1.6;
const LOAD_GRACE_MS = 4000;

export function House({ house, owner, isMayor, workplace }: { house: HouseData; owner?: Agent; isMayor: boolean; workplace?: { label: string; boss?: string } }) {
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

  const winY = Math.min(dims.h * 0.5, 1.3) + 0.2;
  const shutter = darker(house.roofColor, 0.85);
  const chimney = CHIMNEY[house.style];
  const labelY = dims.h + dims.roof + (house.style === 'mairie' ? 3.1 : 1.3);

  // Emportée par la tornade : un tas de gravats et de poutres, jusqu'à la reconstruction.
  if (house.ruined) {
    return (
      <group
        position={[house.position.x, 0, house.position.z]}
        rotation={[0, house.rotation, 0]}
        name={house.id}
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta > 4) return;
          openHouseSheet(house.id);
        }}
      >
        <Box args={[dims.w + 0.3, 0.25, dims.d + 0.3]} position={[0, 0.125, 0]} color={STONE} />
        <Box args={[dims.w * 0.9, 0.6, 0.35]} position={[0, 0.5, -dims.d / 2 + 0.2]} color={house.wallColor} rotation={[0, 0, 0.05]} />
        <Box args={[0.35, 0.9, dims.d * 0.6]} position={[-dims.w / 2 + 0.2, 0.6, -0.2]} color={house.wallColor} rotation={[0.08, 0, 0]} />
        <Box args={[dims.w * 0.8, 0.12, 0.18]} position={[0.2, 0.45, 0.3]} color={BEAM} rotation={[0, 0.6, 0.25]} />
        <Box args={[dims.w * 0.7, 0.12, 0.18]} position={[-0.3, 0.55, 0.6]} color={BEAM} rotation={[0, -0.4, -0.2]} />
        <Box args={[1.2, 0.08, 1.0]} position={[0.6, 0.32, -0.3]} color={house.roofColor} rotation={[0.3, 0.4, 0.15]} />
        <Box args={[0.9, 0.08, 0.8]} position={[-0.5, 0.3, 0.2]} color={house.roofColor} rotation={[-0.25, 1.1, 0.1]} />
        {[[-0.8, 0.9], [0.9, 0.6], [0.3, -0.9], [-0.2, 1.2]].map(([x, z], i) => (
          <Box key={i} args={[0.35, 0.25, 0.3]} position={[x, 0.37, z]} color={STONE_DARK} rotation={[0, i, 0.2]} />
        ))}
        {owner && (
          <Html position={[0, 2.2, 0]} center zIndexRange={[10, 0]}>
            <div className="house-label">
              <div className="house-label__role" style={{ background: '#6b5d4f' }}>🌪 En ruine</div>
              <div className="house-label__name">{owner.name}</div>
            </div>
          </Html>
        )}
      </group>
    );
  }

  return (
    <group
      ref={root}
      position={[house.position.x, 0, house.position.z]}
      rotation={[0, house.rotation, 0]}
      name={house.id}
      onClick={(e) => {
        e.stopPropagation();
        if (e.delta > 4) return; // un glisser de caméra, pas un clic
        openHouseSheet(house.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
      }}
    >
      {/* Soubassement en pierre et marche devant la porte */}
      <Box args={[dims.w + 0.3, 0.25, dims.d + 0.3]} position={[0, 0.125, 0]} color={STONE} />
      <Box args={[1.1, 0.14, 0.45]} position={[0, 0.07, dims.d / 2 + 0.35]} color={STONE_DARK} />
      <Box args={[dims.w, dims.h, dims.d]} position={[0, dims.h / 2 + 0.2, 0]} color={house.wallColor} />

      {house.style === 'tour' ? <PyramidRoof dims={dims} roof={house.roofColor} /> : <GableRoof dims={dims} wall={house.wallColor} roof={house.roofColor} />}
      {TIMBERED.includes(house.style) && <Timbers dims={dims} />}

      {/* Porte avec encadrement */}
      <Box args={[0.95, 1.4, 0.06]} position={[0, 0.9, dims.d / 2 + 0.02]} color={BEAM} />
      <Box args={[0.75, 1.25, 0.08]} position={[0, 0.83, dims.d / 2 + 0.04]} color={WOOD} />
      <mesh position={[0.25, 0.85, dims.d / 2 + 0.1]}>
        <sphereGeometry args={[0.05, 6, 4]} />
        <meshStandardMaterial color="#d0b060" metalness={0.5} />
      </mesh>

      {/* Fenêtres : façade, et un côté pour les maisons assez larges */}
      {dims.w > 2.6 &&
        [-1, 1].map((s) => <Window key={s} position={[s * dims.w * 0.3, winY, dims.d / 2 + 0.04]} shutter={shutter} />)}
      {house.style !== 'forge' && (
        <Window position={[dims.w / 2 + 0.04, winY, 0]} rotation={Math.PI / 2} shutter={shutter} flowers={false} />
      )}

      {chimney && <Chimney dims={dims} x={chimney.x} smoke={chimney.smoke} dark={house.style === 'forge'} />}
      {house.style !== 'tour' && <Lantern x={-0.75} z={dims.d / 2 + 0.45} />}
      {GARDEN.includes(house.style) && <Garden dims={dims} side={-1} />}
      <Extras style={house.style} dims={dims} />

      {owner && (
        <Html position={[0, labelY, 0]} center zIndexRange={[10, 0]}>
          <div className="house-label">
            {/* Un simple citoyen n'a que son nom ; le maire garde sa couronne même s'il était citoyen. */}
            {(owner.role !== 'CITOYEN' || isMayor) && (
              <div className="house-label__role" style={{ background: ROLE_COLOR[isMayor && owner.role === 'CITOYEN' ? 'MAIRE' : owner.role] }}>
                {isMayor && <span className="house-label__crown">👑</span>}
                {isMayor && owner.role === 'CITOYEN' ? ROLE_LABEL.MAIRE : ROLE_LABEL[owner.role]}
              </div>
            )}
            <div className="house-label__name">{owner.name}</div>
          </div>
        </Html>
      )}
      {!owner && workplace && (
        <Html position={[0, labelY, 0]} center zIndexRange={[10, 0]}>
          <div className="house-label">
            <div className="house-label__role" style={{ background: '#8a6a3a' }}>{workplace.label}</div>
            {workplace.boss && <div className="house-label__name">{workplace.boss}</div>}
          </div>
        </Html>
      )}
    </group>
  );
}

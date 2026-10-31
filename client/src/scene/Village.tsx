import { OrbitControls } from '@react-three/drei';
import { useMemo } from 'react';
import { ROLE_COLOR } from '@hameau/shared';
import { useHameau } from '../net/store';
import { Terrain } from './Terrain';
import { River } from './River';
import { Plaza } from './Plaza';
import { Roads } from './Roads';
import { House } from './House';
import { Trees } from './Trees';
import { Villager } from './Villager';
import { Messengers } from './Messengers';
import { Bubbles } from './Bubbles';
import { residentSpot } from './spots';
import { CameraDirector } from './CameraDirector';

const SKY = '#f4d9b3';

function Lights() {
  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 80, 150]} />
      <hemisphereLight args={['#fff1d6', '#7a8f4e', 0.9]} />
      <directionalLight
        castShadow
        position={[28, 40, 18]}
        intensity={2.4}
        color="#ffd8a3"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-far={140}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-radius={4}
      />
    </>
  );
}

export function Village() {
  // Sélecteurs séparés : un tick (horloge + messagers) ne re-rend pas les maisons ni le décor.
  const terrain = useHameau((s) => s.world.terrain);
  const housesById = useHameau((s) => s.world.houses);
  const roadsById = useHameau((s) => s.world.roads);
  const agents = useHameau((s) => s.world.agents);
  const mayorId = useHameau((s) => s.world.mayorId);
  const send = useHameau((s) => s.send);
  const roads = useMemo(() => Object.values(roadsById), [roadsById]);
  const houses = Object.values(housesById);

  return (
    <>
      <Lights />
      <OrbitControls
        makeDefault
        target={[2, 0, 1]}
        enableDamping
        minZoom={10}
        maxZoom={80}
        minPolarAngle={0.35}
        maxPolarAngle={1.15}
      />

      <Terrain terrain={terrain} />
      <River terrain={terrain} />
      <Plaza terrain={terrain} />
      <Roads roads={roads} houses={housesById} terrain={terrain} onToggle={(roadId) => send({ type: 'god.road.cut', roadId })} />
      <Trees terrain={terrain} houses={housesById} roads={roads} />

      {houses.map((h) => {
        const owner = h.ownerId ? agents[h.ownerId] : undefined;
        return <House key={h.id} house={h} owner={owner} isMayor={owner?.id === mayorId} />;
      })}

      {/* Chaque habitant devant sa porte ; les enfants (qui vivent chez leurs parents) à côté, en plus petit. */}
      {Object.values(agents).map((a, i) => {
        const h = housesById[a.houseId];
        if (!h) return null;
        const guests = Object.values(agents).filter((x) => x.houseId === h.id && x.id !== h.ownerId);
        const slot = h.ownerId === a.id ? 0 : guests.indexOf(a) + 1;
        return (
          <group key={a.id}>
            <Villager position={residentSpot(h, slot)} heading={h.rotation} color={ROLE_COLOR[a.role]} phase={i * 1.3} scale={slot ? 0.7 : 1} />
          </group>
        );
      })}

      <CameraDirector />
      <Messengers />
      <Bubbles />
    </>
  );
}

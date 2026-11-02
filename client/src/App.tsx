import { Canvas } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { connect } from './net/socket';
import { useHameau } from './net/store';
import { stopReplay } from './net/replay';
import { Village } from './scene/Village';
import { TitleBanner } from './ui/TitleBanner';
import { Controls } from './ui/Controls';
import { VotePanel } from './ui/VotePanel';
import { StartScreen } from './ui/StartScreen';
import { HouseSheet } from './ui/HouseSheet';
import { GodPanel } from './ui/GodPanel';
import { Sidebar } from './ui/Sidebar';
import { GazettePanel, Journal } from './ui/Journal';
import { Habitants, Relations } from './ui/Legend';
import { useLayout } from './ui/layoutStore';
import { Captions } from './ui/Captions';
import { CaptureBar } from './ui/CaptureBar';
import { ReplayBar } from './ui/ReplayBar';
import { useUI, type CameraShot } from './ui/uiStore';

const CAPTURE_HEIGHT = 1920;
const SHOT_KEYS: Record<string, CameraShot> = { '1': 'libre', '2': 'survol', '3': 'maison', '4': 'messager' };

/** Raccourcis : C capture, G mode Dieu, 1-4 plans de caméra, Échap pour sortir. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select')) return;
      const ui = useUI.getState();
      const key = e.key.toLowerCase();
      if (key === 'c') ui.set({ capture: !ui.capture, shot: ui.capture ? 'libre' : 'survol' });
      else if (key === 'g') useLayout.getState().toggle('dieu');
      else if (SHOT_KEYS[key]) ui.set({ shot: SHOT_KEYS[key] });
      else if (key === 'escape') {
        if (ui.capture) ui.set({ capture: false, shot: 'libre' });
        else if (useHameau.getState().mode === 'replay') stopReplay();
      }
    };
    // Les fenêtres restent à l'écran quand on redimensionne le navigateur.
    const onResize = () => useLayout.getState().clampAll();
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, []);
}

/** En capture, la résolution interne du canvas vaut 1080×1920 quelle que soit la taille affichée. */
function useCaptureDpr(stage: React.RefObject<HTMLDivElement>, capture: boolean) {
  const [dpr, setDpr] = useState(1);
  useEffect(() => {
    if (!capture || !stage.current) return;
    const el = stage.current;
    const update = () => setDpr(Math.min(4, CAPTURE_HEIGHT / Math.max(1, el.clientHeight)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [capture, stage]);
  return capture ? dpr : undefined;
}

export default function App() {
  useEffect(() => connect(), []);
  useShortcuts();
  const day = useHameau((s) => s.world.clock.day);
  const capture = useUI((s) => s.capture);
  const subtitles = useUI((s) => s.subtitles);
  const stage = useRef<HTMLDivElement>(null);
  const captureDpr = useCaptureDpr(stage, capture);

  return (
    <div className={`app ${capture ? 'app--capture' : ''}`}>
      <div className="stage" ref={stage}>
        <Canvas shadows dpr={captureDpr ?? [1, 2]} orthographic camera={{ position: [40, 38, 40], zoom: 22, near: 0.1, far: 500 }}>
          <Village />
        </Canvas>
        {/* Le bandeau ne sert qu'en vidéo : en mode normal, le jour est dans la barre du haut. */}
        {capture && <TitleBanner day={day} />}
        {capture && subtitles && <Captions />}
        {!capture && (
          <>
            <Controls />
            <VotePanel />
          </>
        )}
      </div>
      {!capture && (
        <>
          <Sidebar />
          <Journal />
          <GazettePanel />
          <Habitants />
          <Relations />
          <GodPanel />
          <StartScreen />
          <HouseSheet />
        </>
      )}
      {capture && <CaptureBar />}
      <ReplayBar />
    </div>
  );
}

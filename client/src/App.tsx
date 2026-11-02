import { Canvas } from '@react-three/fiber';
import { useEffect } from 'react';
import { connect } from './net/socket';
import { useHameau } from './net/store';
import { stopReplay } from './net/replay';
import { Village } from './scene/Village';
import { Controls } from './ui/Controls';
import { VotePanel } from './ui/VotePanel';
import { StartScreen } from './ui/StartScreen';
import { HouseSheet } from './ui/HouseSheet';
import { GodPanel } from './ui/GodPanel';
import { Sidebar } from './ui/Sidebar';
import { GazettePanel, Journal } from './ui/Journal';
import { Habitants, Relations } from './ui/Legend';
import { useLayout } from './ui/layoutStore';
import { ReplayBar } from './ui/ReplayBar';
import { useUI, type CameraShot } from './ui/uiStore';

const SHOT_KEYS: Record<string, CameraShot> = { '1': 'libre', '2': 'survol', '3': 'maison', '4': 'messager' };

/** Raccourcis : G mode Dieu, 1-4 plans de caméra, Échap pour quitter un replay. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select')) return;
      const ui = useUI.getState();
      const key = e.key.toLowerCase();
      if (key === 'g') useLayout.getState().toggle('dieu');
      else if (SHOT_KEYS[key]) ui.set({ shot: SHOT_KEYS[key] });
      else if (key === 'escape' && useHameau.getState().mode === 'replay') stopReplay();
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

export default function App() {
  useEffect(() => connect(), []);
  useShortcuts();

  return (
    <div className="app">
      <div className="stage">
        <Canvas shadows dpr={[1, 2]} orthographic camera={{ position: [40, 38, 40], zoom: 22, near: 0.1, far: 500 }}>
          <Village />
        </Canvas>
        <Controls />
        <VotePanel />
      </div>
      <Sidebar />
      <Journal />
      <GazettePanel />
      <Habitants />
      <Relations />
      <GodPanel />
      <StartScreen />
      <HouseSheet />
      <ReplayBar />
    </div>
  );
}

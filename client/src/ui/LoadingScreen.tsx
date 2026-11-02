import { useEffect, useState } from 'react';
import { useHameau } from '../net/store';
import { useUI } from './uiStore';

// Écran de chargement : le soleil se lève sur le hameau pendant que la simulation se connecte.

const TIPS = [
  'Clique sur une maison pour voir qui y vit et comment ça va.',
  'La gazette ne paraît que lorsqu’il se passe quelque chose.',
  'Un vol, un procès, un nouveau maire : tout finit dans le journal.',
  'Les messagers suivent les routes et passent par les ponts.',
  'Touche G : le mode Dieu. Orage, crue, puits… à toi de jouer.',
  'Les plus pauvres sont parfois tentés de voler. Le garde veille.',
  'Une journée au village dure cinq minutes. Accélère avec ×2, ×4, ×8.',
  'Nouvelle histoire : compose tes quatre fondateurs, trait par trait.',
];

/** Temps minimal d'affichage, pour que l'écran ne clignote pas quand tout va vite. */
const MIN_MS = 1800;

export function LoadingScreen() {
  const connected = useHameau((s) => s.connected);
  const [minElapsed, setMinElapsed] = useState(false);
  const [gone, setGone] = useState(false);
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_MS);
    const r = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 2600);
    return () => {
      clearTimeout(t);
      clearInterval(r);
    };
  }, []);

  const ready = connected && minElapsed;
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      setGone(true);
      // Chaque visite repart d'un village neuf : on propose tout de suite de composer ses fondateurs.
      useUI.getState().set({ starting: true });
    }, 700); // le temps du fondu
    return () => clearTimeout(t);
  }, [ready]);

  if (gone) return null;
  return (
    <div className={`loading ${ready ? 'loading--out' : ''}`} role="status" aria-live="polite">
      <div className="loading__scene" aria-hidden="true">
        <div className="loading__sun" />
        <div className="loading__hill loading__hill--back" />
        <div className="loading__hill loading__hill--front" />
        <div className="loading__houses">
          {[0, 1, 2].map((i) => (
            <span key={i} className="loading__house" style={{ animationDelay: `${0.25 + i * 0.22}s` }}>
              <span className="loading__roof" />
              <span className="loading__wall" />
            </span>
          ))}
        </div>
      </div>
      <h1 className="loading__title">Hameau</h1>
      <p className="loading__state">{connected ? 'Le village se réveille…' : 'On allume les lanternes…'}</p>
      <p className="loading__tip" key={tip}>{TIPS[tip]}</p>
    </div>
  );
}

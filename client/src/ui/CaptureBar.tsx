import { useHameau } from '../net/store';
import { useUI, type CameraShot } from './uiStore';

const SHOTS: [CameraShot, string, string][] = [
  ['libre', '🖐', 'Libre'],
  ['survol', '🛸', 'Survol'],
  ['maison', '🏠', 'Maison'],
  ['messager', '✉️', 'Messager'],
];

/** Réglages du tournage, posés hors du cadre 9:16 (ils n'apparaissent pas dans la vidéo). */
export function CaptureBar() {
  const ui = useUI();
  const houses = useHameau((s) => s.world.houses);
  const agents = useHameau((s) => s.world.agents);

  return (
    <div className="capturebar">
      <strong>🎬 Capture 9:16</strong>
      {SHOTS.map(([id, icon, label], i) => (
        <button key={id} className={ui.shot === id ? 'is-active' : ''} onClick={() => ui.set({ shot: id })} title={`Touche ${i + 1}`}>
          {icon} {label}
        </button>
      ))}
      {ui.shot === 'maison' && (
        <select value={ui.focusHouse ?? ''} onChange={(e) => ui.set({ focusHouse: e.target.value || null })}>
          <option value="">Maison du maire</option>
          {Object.values(houses).map((h) => (
            <option key={h.id} value={h.id}>
              {h.ownerId ? agents[h.ownerId]?.name : 'Maison vide'}
            </option>
          ))}
        </select>
      )}
      <label>
        <input type="checkbox" checked={ui.subtitles} onChange={(e) => ui.set({ subtitles: e.target.checked })} /> Sous-titres
      </label>
      <button onClick={() => ui.set({ capture: false, shot: 'libre' })}>✕ Quitter (Échap)</button>
      <p className="capturebar__hint">Filme le cadre avec OBS ou l’outil Capture de Windows. Le rendu est calculé en 1080×1920.</p>
    </div>
  );
}

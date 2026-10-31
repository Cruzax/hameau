import { useState } from 'react';
import { useLayout, type PanelId } from './layoutStore';
import { useUI, type CameraShot } from './uiStore';
import { useHameau } from '../net/store';

interface MenuItem {
  id: string;
  icon: string;
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick: () => void;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

const PANELS: [PanelId, string, string, string?][] = [
  ['journal', '📜', 'Journal'],
  ['gazette', '📰', 'La Gazette'],
  ['habitants', '👥', 'Habitants'],
  ['relations', '💞', 'Relations'],
  ['dieu', '⚡', 'Mode Dieu', 'G'],
];

const SHOTS: [CameraShot, string, string, string][] = [
  ['libre', '🖐', 'Caméra libre', '1'],
  ['survol', '🛸', 'Survol', '2'],
  ['maison', '🏠', 'Maison', '3'],
  ['messager', '✉️', 'Suivre le messager', '4'],
];

/**
 * Menu coulissant à gauche. Replié, il ne montre que les icônes ; déplié, les libellés.
 * Pour ajouter une fonction plus tard : ajouter une entrée dans `sections` ci-dessous.
 */
export function Sidebar() {
  const [open, setOpen] = useState(false);
  const panels = useLayout((s) => s.panels);
  const { toggle, reset } = useLayout.getState();
  const shot = useUI((s) => s.shot);
  const setUI = useUI((s) => s.set);
  const send = useHameau((s) => s.send);
  const connected = useHameau((s) => s.connected);

  /** Recommencer efface l'histoire en cours : on demande confirmation. */
  const restart = (preset: 'complet' | 'origine', what: string) => {
    if (!connected) return;
    if (window.confirm(`Recommencer une histoire vierge avec ${what} ? L’histoire en cours sera perdue (son journal reste dans le dossier data/).`)) {
      send({ type: 'god.reset', preset });
    }
  };

  const sections: MenuSection[] = [
    {
      title: 'Fenêtres',
      items: PANELS.map(([id, icon, label, shortcut]) => ({
        id, icon, label, shortcut, active: panels[id].open, onClick: () => toggle(id),
      })),
    },
    {
      title: 'Caméra',
      items: SHOTS.map(([id, icon, label, shortcut]) => ({
        id: `shot-${id}`, icon, label, shortcut, active: shot === id, onClick: () => setUI({ shot: id }),
      })),
    },
    {
      title: 'Vidéo',
      items: [{ id: 'capture', icon: '🎬', label: 'Mode capture 9:16', shortcut: 'C', onClick: () => setUI({ capture: true, shot: 'survol' }) }],
    },
    {
      title: 'Partie',
      items: [
        { id: 'reset-origine', icon: '🏡', label: 'Recommencer : 5 premiers habitants', onClick: () => restart('origine', 'les 5 habitants du début') },
        { id: 'reset-complet', icon: '🔄', label: 'Recommencer : village complet', onClick: () => restart('complet', 'le village complet (13 habitants)') },
      ],
    },
    {
      title: 'Disposition',
      items: [{ id: 'reset', icon: '↺', label: 'Remettre les fenêtres en place', onClick: reset }],
    },
  ];

  return (
    <nav className={`sidebar ${open ? 'sidebar--open' : ''}`} aria-label="Menu">
      <button className="sidebar__burger" onClick={() => setOpen(!open)} title={open ? 'Replier le menu' : 'Déplier le menu'}>
        <span className="sidebar__icon">{open ? '✕' : '☰'}</span>
        <span className="sidebar__label sidebar__brand">Hameau</span>
      </button>
      <div className="sidebar__scroll">
        {sections.map((section) => (
          <div key={section.title} className="sidebar__section">
            <div className="sidebar__title">{section.title}</div>
            {section.items.map((item) => (
              <button
                key={item.id}
                className={`sidebar__item ${item.active ? 'is-active' : ''}`}
                onClick={item.onClick}
                title={open ? undefined : `${item.label}${item.shortcut ? ` (${item.shortcut})` : ''}`}
              >
                <span className="sidebar__icon">{item.icon}</span>
                <span className="sidebar__label">{item.label}</span>
                {item.shortcut && <kbd className="sidebar__kbd">{item.shortcut}</kbd>}
              </button>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}

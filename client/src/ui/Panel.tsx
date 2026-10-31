import { useRef, type ReactNode } from 'react';
import { useLayout, type PanelId } from './layoutStore';

interface Props {
  id: PanelId;
  title: string;
  icon: string;
  /** Petits contrôles affichés dans la barre de titre (filtres, export…). */
  actions?: ReactNode;
  minW?: number;
  minH?: number;
  children: ReactNode;
}

type Gesture = { kind: 'move' | 'resize'; startX: number; startY: number; x: number; y: number; w: number; h: number };

/**
 * Fenêtre flottante : on la déplace par sa barre de titre, on la redimensionne par le coin,
 * on la replie d'un double-clic. Sa position est retenue d'une visite à l'autre.
 */
export function Panel({ id, title, icon, actions, minW = 220, minH = 110, children }: Props) {
  const p = useLayout((s) => s.panels[id]);
  const { update, focus, toggle } = useLayout.getState();
  const gesture = useRef<Gesture | null>(null);

  if (!p.open) return null;

  const start = (kind: Gesture['kind']) => (e: React.PointerEvent<HTMLElement>) => {
    if (kind === 'move' && (e.target as HTMLElement).closest('button, input, select, label, a')) return;
    e.preventDefault();
    focus(id);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // pointeur déjà relâché : le geste continue sans capture
    }
    gesture.current = { kind, startX: e.clientX, startY: e.clientY, x: p.x, y: p.y, w: p.w, h: p.h };
  };
  const move = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (g.kind === 'move') update(id, { x: g.x + dx, y: g.y + dy });
    else update(id, { w: Math.max(minW, g.w + dx), h: Math.max(minH, g.h + dy) });
  };
  const end = () => {
    gesture.current = null;
  };

  return (
    <section
      className={`panel ${p.collapsed ? 'panel--collapsed' : ''}`}
      style={{ left: p.x, top: p.y, width: p.w, height: p.collapsed ? undefined : p.h, zIndex: 20 + p.z }}
      onPointerDown={() => focus(id)}
    >
      <header
        className="panel__head"
        onPointerDown={start('move')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={() => update(id, { collapsed: !p.collapsed })}
        title="Glisser pour déplacer · double-clic pour replier"
      >
        <span className="panel__icon">{icon}</span>
        <span className="panel__title">{title}</span>
        <span className="panel__actions">{actions}</span>
        <button className="panel__btn" onClick={() => update(id, { collapsed: !p.collapsed })} title={p.collapsed ? 'Déplier' : 'Replier'}>
          {p.collapsed ? '▸' : '▾'}
        </button>
        <button className="panel__btn" onClick={() => toggle(id)} title="Fermer">
          ✕
        </button>
      </header>
      {!p.collapsed && (
        <>
          <div className="panel__body">{children}</div>
          <div
            className="panel__resize"
            onPointerDown={start('resize')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            title="Redimensionner"
          />
        </>
      )}
    </section>
  );
}

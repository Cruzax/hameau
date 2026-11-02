import { create } from 'zustand';

export type PanelId = 'journal' | 'gazette' | 'habitants' | 'relations' | 'dieu' | 'maison';

export interface PanelState {
  x: number;
  y: number;
  w: number;
  h: number;
  open: boolean;
  collapsed: boolean;
  z: number;
}

const STORAGE_KEY = 'hameau.layout.v1';
const TOP = 70; // sous la barre d'outils
const GAP = 12;
/** Largeur du menu replié à gauche. */
const RAIL = 60;

/** Disposition par défaut, calculée d'après la taille de la fenêtre. */
function defaults(): Record<PanelId, PanelState> {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const right = Math.max(GAP, vw - 360 - 16);
  const journalH = Math.round((vh - TOP - 16) * 0.62);
  return {
    journal: { x: right, y: TOP, w: 360, h: journalH, open: true, collapsed: false, z: 3 },
    gazette: { x: right, y: TOP + journalH + GAP, w: 360, h: Math.max(140, vh - TOP - journalH - GAP - 16), open: true, collapsed: false, z: 2 },
    habitants: { x: RAIL + 12, y: Math.max(TOP, vh - 250), w: 250, h: 234, open: true, collapsed: false, z: 1 },
    relations: { x: RAIL + 274, y: Math.max(TOP, vh - 250), w: 300, h: 234, open: true, collapsed: false, z: 1 },
    dieu: { x: RAIL + 12, y: TOP, w: 330, h: Math.max(300, vh - TOP - 270), open: false, collapsed: false, z: 4 },
    maison: { x: Math.max(RAIL + 12, right - 330 - GAP), y: TOP, w: 320, h: Math.min(460, vh - TOP - 16), open: false, collapsed: false, z: 5 },
  };
}

function load(): Record<PanelId, PanelState> {
  const base = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Record<PanelId, PanelState>> | null;
    if (saved) for (const id of Object.keys(base) as PanelId[]) if (saved[id]) base[id] = { ...base[id], ...saved[id] };
  } catch {
    // stockage indisponible (navigation privée…) : disposition par défaut
  }
  return base;
}

function save(panels: Record<PanelId, PanelState>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(panels));
  } catch {
    // tant pis, la disposition ne sera simplement pas retenue
  }
}

/** Garde au moins la barre de titre visible à l'écran. */
function clamp(p: PanelState): PanelState {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(p.w, vw - 2 * GAP);
  return { ...p, w, x: Math.min(Math.max(RAIL, p.x), vw - 80), y: Math.min(Math.max(TOP - 10, p.y), vh - 40) };
}

interface LayoutState {
  panels: Record<PanelId, PanelState>;
  update: (id: PanelId, patch: Partial<PanelState>) => void;
  focus: (id: PanelId) => void;
  toggle: (id: PanelId) => void;
  clampAll: () => void;
  reset: () => void;
}

export const useLayout = create<LayoutState>((set, get) => {
  const commit = (panels: Record<PanelId, PanelState>) => {
    set({ panels });
    save(panels);
  };
  const topZ = () => Math.max(...Object.values(get().panels).map((p) => p.z));
  return {
    panels: load(),
    update: (id, patch) => commit({ ...get().panels, [id]: clamp({ ...get().panels[id], ...patch }) }),
    focus: (id) => {
      const p = get().panels[id];
      if (p.z === topZ()) return;
      // Renumérote 1..n pour que les fenêtres restent sous la barre d'outils et le menu.
      const order = (Object.keys(get().panels) as PanelId[]).filter((k) => k !== id).sort((a, b) => get().panels[a].z - get().panels[b].z);
      const next = { ...get().panels };
      order.forEach((k, i) => (next[k] = { ...next[k], z: i + 1 }));
      next[id] = { ...p, z: order.length + 1 };
      commit(next);
    },
    toggle: (id) => {
      const p = get().panels[id];
      commit({ ...get().panels, [id]: { ...p, open: !p.open, collapsed: false } });
      if (!p.open) get().focus(id);
    },
    clampAll: () => {
      const next = { ...get().panels };
      for (const id of Object.keys(next) as PanelId[]) next[id] = clamp(next[id]);
      commit(next);
    },
    reset: () => commit(defaults()),
  };
});

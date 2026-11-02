import { create } from 'zustand';

export type CameraShot = 'libre' | 'survol' | 'maison' | 'messager';

interface UIState {
  shot: CameraShot;
  /** Maison ciblée par le plan « maison ». */
  focusHouse: string | null;
  /** Maison (ou lieu de travail) dont on regarde la fiche. */
  selectedHouse: string | null;
  /** Écran de création d'une nouvelle histoire ouvert. */
  starting: boolean;
  set: (patch: Partial<Omit<UIState, 'set'>>) => void;
}

export const useUI = create<UIState>((set) => ({
  shot: 'libre',
  focusHouse: null,
  starting: false,
  selectedHouse: null,
  set: (patch) => set(patch),
}));

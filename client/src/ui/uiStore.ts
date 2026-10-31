import { create } from 'zustand';

export type CameraShot = 'libre' | 'survol' | 'maison' | 'messager';

interface UIState {
  godOpen: boolean;
  /** Mode capture : cadre 9:16, interface masquée, caméra pilotée. */
  capture: boolean;
  subtitles: boolean;
  shot: CameraShot;
  /** Maison ciblée par le plan « maison ». */
  focusHouse: string | null;
  set: (patch: Partial<Omit<UIState, 'set'>>) => void;
}

export const useUI = create<UIState>((set) => ({
  godOpen: false,
  capture: false,
  subtitles: true,
  shot: 'libre',
  focusHouse: null,
  set: (patch) => set(patch),
}));

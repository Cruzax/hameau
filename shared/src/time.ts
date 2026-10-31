import type { SimClock } from './types';

// Une journée simulée couvre 24 h, de 6 h du matin à 6 h le lendemain.
const START_HOUR = 6;
export const NIGHT_START = 22;
export const NIGHT_END = 5;

/** Heure du village, en heures décimales (0..24). */
export function villageHour(tick: number, ticksPerDay: number): number {
  const frac = (tick % ticksPerDay) / ticksPerDay;
  return (START_HOUR + frac * 24) % 24;
}

/** Fraction de la journée simulée correspondant à une heure donnée (ex. 14 h → 0,33). */
export function dayFraction(hour: number): number {
  return (((hour - START_HOUR) % 24) + 24) % 24 / 24;
}

export function formatHour(h: number): string {
  const m = Math.floor(h * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function isNight(clock: Pick<SimClock, 'tick' | 'ticksPerDay'>): boolean {
  const h = villageHour(clock.tick, clock.ticksPerDay);
  return h >= NIGHT_START || h < NIGHT_END;
}

/** 0 en plein jour, 1 en pleine nuit, avec crépuscule et aube progressifs (environ 1 h). */
export function nightLevel(hour: number): number {
  if (hour >= NIGHT_END + 1 && hour < NIGHT_START - 1) return 0;
  if (hour >= NIGHT_START || hour < NIGHT_END) return 1;
  if (hour >= NIGHT_START - 1) return hour - (NIGHT_START - 1); // crépuscule 21 h → 22 h
  return 1 - (hour - NIGHT_END); // aube 5 h → 6 h
}

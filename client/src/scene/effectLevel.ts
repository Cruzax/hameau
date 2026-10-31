import type { EffectKind } from '@hameau/shared';
import { useHameau } from '../net/store';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Intensité 0..1 d'un phénomène à l'instant présent : montée progressive au début,
 * décrue à la fin. Lu dans useFrame (pas de re-rendu React).
 */
export function effectLevel(kind: EffectKind): number {
  const { world, tickAt } = useHameau.getState();
  const e = world.effects?.find((x) => x.kind === kind);
  if (!e) return 0;
  const c = world.clock;
  const tick = c.tick + (c.paused ? 0 : Math.min(1, (performance.now() - tickAt) / (c.tickMs / c.speed)));
  const dur = Math.max(1, e.endTick - e.startTick);
  return clamp01((tick - e.startTick) / (dur * 0.15)) * clamp01((e.endTick - tick) / (dur * 0.2));
}

/** Rapproche `current` de `target` en douceur, indépendamment du framerate. */
export const approach = (current: number, target: number, dt: number, speed = 2) =>
  current + (target - current) * (1 - Math.exp(-dt * speed));

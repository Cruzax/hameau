import { dayFraction, roadPath, segmentIntersection, type EffectKind, type WorldEffect } from '@hameau/shared';
import { tornadoTrack, wreckHouse } from './disasters';
import type { Sim } from './Sim';

/** Durée de chaque phénomène, en fraction de journée. */
const DURATION: Record<EffectKind, number> = { storm: 0.25, flood: 0.35, well: 0.12, tornado: 0.06 };
/** Pendant un orage, les messagers avancent moins vite. */
export const STORM_SLOWDOWN = 0.55;

const ANNOUNCE: Record<EffectKind, [string, string]> = {
  storm: ['⛈ Un orage éclate sur le village ! Les messagers pataugent.', '🌤 L’orage s’éloigne.'],
  flood: ['🌊 La rivière déborde ! Les ponts sont submergés.', '🌉 La décrue : les ponts sont de nouveau praticables.'],
  well: ['✨ Le puits de la place se met à briller d’une lueur dorée…', '🪣 La lueur du puits s’éteint.'],
  tornado: ['🌪 Une tornade fonce sur le village ! Tout le monde aux abris !', '🌤 La tornade s’est dissipée. On compte les dégâts.'],
};

/** Mots-clés d'un événement injecté qui déclenchent l'animation correspondante. */
const KEYWORDS: [EffectKind, RegExp][] = [
  ['storm', /orage|tempête|foudre|éclair/i],
  ['flood', /déborde|crue|inond|submerg/i],
  ['well', /puits|trésor/i],
];

export function effectsFromText(text: string): EffectKind[] {
  return KEYWORDS.filter(([, re]) => re.test(text)).map(([k]) => k);
}

export function isActive(sim: Sim, kind: EffectKind) {
  return sim.world.effects.some((e) => e.kind === kind);
}

/** Routes qui enjambent la rivière (coupées par une crue). */
function bridgeRoads(sim: Sim) {
  const w = sim.world;
  const river = w.terrain.river.points;
  return Object.values(w.roads).filter((r) => {
    const path = roadPath(r, w.houses);
    for (let i = 1; i < path.length; i++)
      for (let j = 1; j < river.length; j++) if (segmentIntersection(path[i - 1], path[i], river[j - 1], river[j])) return true;
    return false;
  });
}

export function startEffect(sim: Sim, kind: EffectKind) {
  const w = sim.world;
  if (isActive(sim, kind)) return;
  const effect: WorldEffect = {
    id: `${kind}-${sim.clock.tick}`,
    kind,
    startTick: sim.clock.tick,
    endTick: sim.clock.tick + Math.round(w.clock.ticksPerDay * DURATION[kind]),
  };
  if (kind === 'tornado') {
    const track = tornadoTrack(sim);
    if (!track) return;
    Object.assign(effect, track);
  }
  if (kind === 'flood') {
    const cut = bridgeRoads(sim).filter((r) => r.status === 'open');
    for (const r of cut) r.status = 'cut';
    effect.cutRoads = cut.map((r) => r.id);
    sim.broadcastPatch({ roads: w.roads });
  }
  // L'orage rend malade : un habitant sur cinq environ.
  if (kind === 'storm') for (const a of Object.values(w.agents)) if (Math.random() < 0.2) sim.daily.fallSick(sim, a);
  w.effects.push(effect);
  sim.emit('world.effect', [], ANNOUNCE[kind][0], { effect, phase: 'start' });
  sim.broadcastPatch({ effects: w.effects });
}

export function tickEffects(sim: Sim) {
  const w = sim.world;
  // La météo prévue ce matin arrive à son heure.
  const plan = sim.daily.weatherPlan;
  if (plan && sim.dayTick >= Math.round(sim.clock.ticksPerDay * dayFraction(plan.hour))) {
    sim.daily.weatherPlan = null;
    startEffect(sim, plan.kind);
  }
  // La tornade frappe la maison visée quand elle passe dessus, à mi-parcours.
  for (const e of w.effects) {
    if (e.kind !== 'tornado' || e.struck || !e.houseId || sim.clock.tick < (e.startTick + e.endTick) / 2) continue;
    e.struck = true;
    wreckHouse(sim, e.houseId);
    sim.broadcastPatch({ effects: w.effects });
  }
  const over = w.effects.filter((e) => sim.clock.tick >= e.endTick);
  if (!over.length) return;
  w.effects = w.effects.filter((e) => !over.includes(e));
  for (const e of over) {
    for (const id of e.cutRoads ?? []) if (w.roads[id]) w.roads[id].status = 'open';
    if (e.cutRoads?.length) sim.broadcastPatch({ roads: w.roads });
    sim.emit('world.effect', [], ANNOUNCE[e.kind][1], { effect: e, phase: 'end' });
  }
  sim.broadcastPatch({ effects: w.effects });
}

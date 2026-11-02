import { distToPolyline, roadPath, segmentIntersection, type SimEvent, type Vec2, type WorldState } from '@hameau/shared';

// Indicateurs d'un long run : de quoi juger si le village vit ou s'endort.

export interface RunMetrics {
  days: number;
  population: number;
  mayorChanges: number;
  /** Comptes par tranche de 10 jours (clé = premier jour de la tranche). */
  thefts: Record<number, number>;
  starving: Record<number, number>;
  gazetteDays: number;
  jobChanges: number;
  /** Routes dont le tracé franchit la rivière. */
  bridges: number;
  /** Paires de routes qui se coupent ailleurs qu'à une extrémité commune. */
  crossings: number;
}

const bucket = (day: number) => Math.floor((day - 1) / 10) * 10 + 1;

function perBucket(events: SimEvent[], keep: (e: SimEvent) => boolean) {
  const out: Record<number, number> = {};
  for (const e of events) if (keep(e)) out[bucket(e.day)] = (out[bucket(e.day)] ?? 0) + 1;
  return out;
}

function segments(pts: Vec2[]) {
  return pts.slice(1).map((p, i) => [pts[i], p] as const);
}

export function crossesRiver(path: Vec2[], w: WorldState) {
  const half = w.terrain.river.width / 2;
  return path.some((p) => distToPolyline(p, w.terrain.river.points) < half) ||
    segments(path).some(([a, b]) => segments(w.terrain.river.points).some(([c, d]) => segmentIntersection(a, b, c, d)));
}

export function countCrossings(w: WorldState) {
  const roads = Object.values(w.roads);
  let n = 0;
  for (let i = 0; i < roads.length; i++) {
    for (let j = i + 1; j < roads.length; j++) {
      const r = roads[i], s = roads[j];
      if (r.a === s.a || r.a === s.b || r.b === s.a || r.b === s.b) continue;
      const hit = segments(roadPath(r, w.houses)).some(([a, b]) => segments(roadPath(s, w.houses)).some(([c, d]) => segmentIntersection(a, b, c, d)));
      if (hit) n++;
    }
  }
  return n;
}

export function metrics(events: SimEvent[], w: WorldState): RunMetrics {
  return {
    days: w.clock.day,
    population: Object.keys(w.agents).length,
    mayorChanges: events.filter((e) => e.type === 'mayor.elected' && !(e.payload as { kept?: boolean })?.kept).length,
    thefts: perBucket(events, (e) => e.type === 'crime.theft'),
    starving: perBucket(events, (e) => /meurt de faim/.test(e.text)),
    gazetteDays: new Set(events.filter((e) => e.type === 'gazette.published').map((e) => e.day)).size,
    jobChanges: events.filter((e) => (e.type as string) === 'job.changed').length,
    bridges: Object.values(w.roads).filter((r) => crossesRiver(roadPath(r, w.houses), w)).length,
    crossings: countCrossings(w),
  };
}

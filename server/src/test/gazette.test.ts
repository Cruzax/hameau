import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayFraction, type FounderSpec, type SimEvent } from '@hameau/shared';
import { gazetteStaff, pickHeadline, score } from '../sim/newsworthy';
import { newSim } from './helpers';

const FOUNDERS: FounderSpec[] = [
  { name: 'Maxence', traits: ['ambitieux'], role: 'MAIRE' },
  { name: 'Rose', traits: ['fouineur'], role: 'ECLAIREUR' },
  { name: 'Marie', traits: ['reveur'], role: 'ECRIVAIN' },
  { name: 'Gabin', traits: ['travailleur'], role: 'CITOYEN' },
];

const ev = (seq: number, type: string, text: string, payload: Record<string, unknown> = {}) =>
  ({ seq, type, text, payload, day: 1, tick: 0, actors: [], at: '' }) as unknown as SimEvent;

test('les événements ont un poids ; un maire reconduit ne fait pas la une', () => {
  assert.equal(score(ev(1, 'mayor.elected', '👑 Rose devient maire !')), 10);
  assert.equal(score(ev(2, 'mayor.elected', '👑 Rose reste maire.', { kept: true })), 0);
  assert.equal(score(ev(3, 'crime.theft', '🚨 Vol chez Lina')), 6);
  assert.equal(score(ev(4, 'life.trip', 'Lina part en promenade')), 0);
});

test('la une : le plus important des événements pas encore couverts, à partir de 4', () => {
  const events = [ev(1, 'life.trip', 'x'), ev(2, 'party', 'fête'), ev(3, 'crime.theft', '🚨 Vol chez Lina')];
  assert.equal(pickHeadline(events, new Set())?.seq, 3);
  assert.equal(pickHeadline(events, new Set([3])), null); // la fête seule (3) ne suffit pas
});

test('une famine fait la une', () => {
  const events = Array.from({ length: 5 }, (_, i) => ev(i + 1, 'life.need', '😩 Lina meurt de faim et n’a plus rien à manger.'));
  assert.match(pickHeadline(events, new Set())?.text ?? '', /faim/i);
});

test('avec 4 fondateurs, les étapes de la gazette se cumulent', () => {
  const sim = newSim();
  sim.reset({ founders: FOUNDERS });
  const staff = gazetteStaff(sim.world);
  const byName = (id: string) => sim.world.agents[id].name;
  assert.equal(byName(staff.ECLAIREUR), 'Rose');
  assert.equal(byName(staff.ECRIVAIN), 'Marie');
  assert.equal(byName(staff.EDITEUR), 'Marie');
  assert.ok(staff.LECTEUR);
});

/** Fait tourner la simulation jusqu'à l'heure dite du jour courant. */
function runUntil(sim: ReturnType<typeof newSim>, hour: number) {
  const target = Math.round(sim.clock.ticksPerDay * dayFraction(hour));
  const day = sim.clock.day;
  while (sim.clock.day === day && sim.dayTick < target) sim.tick();
}

const published = (sim: ReturnType<typeof newSim>) => sim.journal.events.filter((e) => e.type === 'gazette.published');

test('un jour calme : pas de gazette', () => {
  const sim = newSim();
  sim.reset({ founders: FOUNDERS });
  runUntil(sim, 20);
  assert.equal(published(sim).length, 0);
});

test('un vol : un numéro qui en parle, même à 4 habitants', async () => {
  const sim = newSim();
  sim.reset({ founders: FOUNDERS });
  runUntil(sim, 8);
  sim.emit('crime.theft', [], '🚨 Vol chez Gabin cette nuit : 3 pains ont disparu !');
  for (let h = 8; h < 23; h++) {
    runUntil(sim, h + 1);
    await new Promise((r) => setImmediate(r));
  }
  const g = published(sim);
  assert.equal(g.length, 1);
  assert.match(g[0].text, /Vol chez Gabin/);
});

test('un changement de maire et un vol le même jour : deux numéros', async () => {
  const sim = newSim();
  sim.reset({ founders: FOUNDERS });
  runUntil(sim, 8);
  sim.emit('mayor.elected', [], '👑 Gabin devient maire ! Maxence perd l’écharpe.');
  sim.emit('crime.theft', [], '🚨 Vol chez Marie cette nuit : 2 pièces ont disparu !');
  // Le second numéro (édition spéciale) peut finir de s'écrire le lendemain matin.
  for (let i = 0; i < 30 * 20; i++) {
    sim.tick();
    if (i % 4 === 0) await new Promise((r) => setImmediate(r));
  }
  // Les deux numéros parlent des deux affaires du jour (d'autres peuvent suivre le lendemain).
  const titles = published(sim).map((e) => e.text).join(' | ');
  assert.match(titles, /devient maire/);
  assert.match(titles, /Vol chez Marie/);
});

test('à poids égal ou proche, la nouvelle du jour passe avant celle de la veille', () => {
  const yesterday = { ...ev(1, 'trial.verdict', '⚖️ Le village déclare Félix coupable'), day: 1 } as SimEvent;
  const today = { ...ev(2, 'crime.theft', '🚨 Vol chez Lina'), day: 2 } as SimEvent;
  assert.equal(pickHeadline([yesterday, today], new Set())?.seq, 2);
});

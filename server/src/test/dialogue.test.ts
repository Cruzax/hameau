import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Agent } from '@hameau/shared';
import { BANKS, chooseExchange, type TalkContext } from '../content/dialogue';

const person = (over: Partial<Agent> = {}) =>
  ({ id: 'a', name: 'Lina', role: 'CITOYEN', personality: { honesty: 0.6, ambition: 0.4, traits: [], tone: '' }, needs: { satiete: 0.8, energie: 0.8, humeur: 0.7, sante: 1 }, inventory: { pain: 2, bois: 0, outils: 0, pieces: 5 }, opinions: {}, ...over }) as Agent;

const ctx = (over: Partial<TalkContext> = {}): TalkContext => ({
  speaker: person(), listener: person({ id: 'b', name: 'Gabin' }), mutual: 0.1, night: false, storm: false, flood: false,
  place: 'la place', dayName: 'mardi', mayorName: 'Maxence', mayorOpinion: 0, ...over,
});

/** Tout ce qu'un contexte peut faire dire, sur beaucoup de tirages. */
const sample = (c: TalkContext, n = 600) => {
  const out = new Set<string>();
  for (let i = 0; i < n; i++) {
    const ex = chooseExchange(c);
    out.add(ex.line);
    if (ex.reply) out.add(ex.reply);
  }
  return [...out];
};

test('beaucoup de répliques : au moins 10 par métier et par type de relation', () => {
  for (const [role, lines] of Object.entries(BANKS.BY_ROLE)) assert.ok(lines!.length >= 10, `${role} : ${lines!.length}`);
  for (const k of ['FRIENDLY', 'FLIRT', 'KIN', 'HOSTILE', 'COLD'] as const) assert.ok(BANKS[k].length >= 10, `${k} : ${BANKS[k].length}`);
});

test('on parle de son vrai travail', () => {
  const lines = sample(ctx({ job: 'la ferme' }));
  assert.ok(lines.some((l) => l.includes('la ferme')), 'aucune réplique sur la ferme');
});

test('on commente la dernière gazette', () => {
  const lines = sample(ctx({ headline: 'Vol chez Rose cette nuit' }));
  assert.ok(lines.some((l) => l.includes('Vol chez Rose')), 'aucune réplique sur la gazette');
});

test('on parle de son couple', () => {
  const lines = sample(ctx({ partner: 'Félix' }));
  assert.ok(lines.some((l) => l.includes('Félix')), 'aucune réplique sur le couple');
});

test('sans emploi, ça se sent dans la conversation', () => {
  const lines = sample(ctx({ jobless: true }));
  assert.ok(lines.some((l) => /boulot|emploi|travail|embauche/i.test(l)), 'rien sur le chômage');
});

test('ni « ·e » ni adjectif qui change selon qui parle', () => {
  const all = [
    ...Object.values(BANKS.BY_ROLE).flat(), ...BANKS.FRIENDLY.flat(), ...BANKS.FLIRT.flat(), ...BANKS.KIN.flat(), ...BANKS.HOSTILE.flat(), ...BANKS.COLD.flat(),
    ...sample(ctx({ job: 'la ferme', headline: 'Un titre', partner: 'Félix', jobless: true, storm: true })),
  ];
  for (const l of all) {
    assert.ok(!l.includes('·'), l);
    assert.ok(!/\bje suis (tout |si |très |trop |vraiment )?(content|fatigué|crevé|prêt|sûr|fier|heureux|patraque|épuisé|ravi|désolé|perdu|seul|malade)\b/i.test(l), l);
  }
});

import { rumorToShare } from '../sim/rumors';
import { newSim } from './helpers';

test('on ne colporte pas une rumeur sur soi-même', () => {
  const sim = newSim();
  const [a, b] = Object.values(sim.world.agents);
  sim.world.rumors = [{ id: 'r1', kind: 'tresor', about: a.id, knownBy: [a.id], true: false, day: 1 } as never];
  assert.equal(rumorToShare(sim, a, b), undefined);
});

test('la gazette : on ne commente pas sa propre nouvelle comme un étranger, et on n’en doute pas', () => {
  const mine = sample(ctx({ headline: 'Lina devient maire' }));
  assert.ok(!mine.some((l) => l.includes('« Lina devient maire »')), 'Lina cite sa propre une');
  const theirs = sample(ctx({ headline: 'Gabin devient maire' }));
  assert.ok(theirs.some((l) => l.includes('« Gabin devient maire »')));
  assert.ok(!theirs.some((l) => /j’y crois moyen/.test(l)));
});

test('deux habitants à la suite ne répètent pas la même phrase sur la gazette', () => {
  const lines = BANKS.SITUATIONS.filter((s) => s.when(ctx({ headline: 'Gabin devient maire' })));
  assert.ok(lines.some((s) => s.lines(ctx({ headline: 'x' })).length >= 8));
  const said: string[] = [];
  for (let i = 0; i < 400 && said.length < 6; i++) {
    const l = chooseExchange(ctx({ headline: 'Gabin devient maire' })).line;
    if (l.includes('Gabin devient maire')) said.push(l);
  }
  assert.equal(new Set(said).size, said.length, said.join(' | '));
});

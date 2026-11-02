import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoRoles, createFounderWorld, personalityFromTraits, PROFILES, validateFounders, type FounderSpec } from '@hameau/shared';
import { metrics } from '../tools/metrics';
import { runVillage } from './runVillage';
import { newSim } from './helpers';

const FOUNDERS: FounderSpec[] = [
  { name: 'Maxence', traits: ['ambitieux', 'malin'], role: 'auto', sex: 'M', orientation: 'hetero' },
  { name: 'Lina', traits: ['honnete', 'travailleur'], role: 'auto', sex: 'F', orientation: 'bi' },
  { name: 'Félix', traits: ['menteur', 'malin'], role: 'auto', sex: 'auto', orientation: 'auto' },
  { name: 'Rose', traits: ['fouineur', 'bavard'], role: 'auto' },
];

test('au moins 6 profils tout prêts, tous valides', () => {
  assert.ok(PROFILES.length >= 6);
  for (const p of PROFILES) assert.equal(validateFounders([{ name: 'X', traits: p.traits, role: 'auto' }]), null, p.label);
});

test('un menteur malin est peu honnête', () => {
  assert.ok(personalityFromTraits(['menteur', 'malin']).honesty < 0.3);
});

test('en automatique, l’ambitieux devient maire, et il n’y a qu’un maire', () => {
  const roles = autoRoles(FOUNDERS);
  assert.equal(roles.filter((r) => r === 'MAIRE').length, 1);
  assert.equal(roles[0], 'MAIRE');
});

test('un rôle choisi à la main est respecté', () => {
  const roles = autoRoles([{ ...FOUNDERS[0], role: 'LECTEUR' }, ...FOUNDERS.slice(1)]);
  assert.equal(roles[0], 'LECTEUR');
  assert.equal(roles.filter((r) => r === 'MAIRE').length, 1);
});

test('des traits incompatibles sont refusés, avec un message en français', () => {
  const err = validateFounders([{ name: 'X', traits: ['honnete', 'menteur'], role: 'auto' }]);
  assert.match(err ?? '', /honnête/i);
  assert.ok(validateFounders([{ name: 'X', traits: ['malin', 'bavard', 'reveur', 'tendre'], role: 'auto' }]));
  assert.ok(validateFounders(FOUNDERS.map((f) => ({ ...f, ai: true }))), 'deux agents IA refusés');
});

test('le monde des fondateurs : 4 habitants, une ferme, une boulangerie, des routes propres', () => {
  const w = createFounderWorld(FOUNDERS);
  assert.equal(Object.keys(w.agents).length, 4);
  const kinds = Object.values(w.workplaces).map((x) => x.kind).sort();
  assert.deepEqual(kinds, ['boulangerie', 'ferme']);
  for (const a of Object.values(w.agents)) {
    assert.ok(a.sex === 'M' || a.sex === 'F');
    assert.ok(['hetero', 'bi', 'gay'].includes(a.orientation!));
  }
  assert.equal(w.agents[w.mayorId].name, 'Maxence');
  const sim = newSim();
  sim.reset({ founders: FOUNDERS });
  assert.equal(Object.keys(sim.world.agents).length, 4);
  assert.equal(metrics([], sim.world).crossings, 0);
});

test('une histoire à 4 fondateurs tourne 5 jours sans planter', async () => {
  const { sim } = await runVillage({ days: 5, founders: FOUNDERS });
  assert.ok(Object.keys(sim.world.agents).length >= 4);
});

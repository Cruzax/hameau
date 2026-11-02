import { test } from 'node:test';
import assert from 'node:assert/strict';
import { satisfaction } from '@hameau/shared';
import { newSim } from './helpers';

test('la satisfaction va de 0 à 1 et grimpe quand tout va bien', () => {
  const w = newSim().world;
  const a = Object.values(w.agents).find((x) => x.id !== w.mayorId)!;
  a.needs = { satiete: 1, energie: 1, humeur: 1, sante: 1 };
  a.job = { workplaceId: 'x', since: 1, wage: 4 };
  a.opinions[w.mayorId] = 1;
  const happy = satisfaction(a, w);
  a.needs = { satiete: 0, energie: 0.2, humeur: 0, sante: 0.2 };
  delete a.job;
  a.opinions[w.mayorId] = -1;
  const miserable = satisfaction(a, w);
  assert.ok(happy > 0.9 && happy <= 1, `heureux : ${happy}`);
  assert.ok(miserable >= 0 && miserable < 0.2, `malheureux : ${miserable}`);
});

test('un enfant n’est pas pénalisé de ne pas travailler', () => {
  const w = newSim().world;
  const [kid, parent] = Object.values(w.agents);
  kid.family = { parentIds: [parent.id], childIds: [] };
  kid.houseId = parent.houseId;
  kid.needs = { satiete: 1, energie: 1, humeur: 1, sante: 1 };
  kid.opinions[w.mayorId] = 1;
  delete kid.job;
  assert.ok(satisfaction(kid, w) > 0.9);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metrics } from '../tools/metrics';
import { LONGRUN_FOUNDERS } from './longrunFounders';
import { runVillage } from './runVillage';

// Lent (plusieurs minutes) : lancé seulement avec LONGRUN=1.
test('longrun : 110 jours à partir de 4 fondateurs, un village qui vit', { skip: !process.env.LONGRUN, timeout: 30 * 60 * 1000 }, async () => {
  const { sim, events } = await runVillage({ days: 110, founders: LONGRUN_FOUNDERS });
  const m = metrics(events, sim.world);
  console.log(JSON.stringify(m));
  assert.ok(m.population >= 30 && m.population <= 50, `population ${m.population}`);
  assert.ok(m.mayorChanges >= 3, `changements de maire ${m.mayorChanges}`);
  const theftBuckets = Object.values(m.thefts).filter((n) => n > 0).length;
  assert.ok(theftBuckets >= 6, `vols dans ${theftBuckets} tranches sur 11`);
  const worstHunger = Math.max(0, ...Object.values(m.starving));
  assert.ok(worstHunger <= 60, `pire tranche de faim : ${worstHunger}`);
  assert.ok(m.jobChanges >= 15, `changements d'emploi ${m.jobChanges}`);
  assert.ok(m.gazetteDays >= 25 && m.gazetteDays <= 90, `jours de gazette ${m.gazetteDays}`);
  assert.equal(m.crossings, 0);
  assert.ok(m.bridges <= 3, `ponts ${m.bridges}`);
});

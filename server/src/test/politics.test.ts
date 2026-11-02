import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSim } from './helpers';

test('le maire banni pendant un vote : le dépouillement ne plante pas', () => {
  const sim = newSim();
  const oldMayor = sim.world.mayorId;
  for (const a of Object.values(sim.world.agents)) a.opinions[oldMayor] = -0.9;
  sim.politics.open(sim, true);
  const vote = sim.world.votes.at(-1)!;
  sim.daily.banish(sim, oldMayor);
  assert.doesNotThrow(() => sim.politics.close(sim, vote));
  assert.ok(sim.world.agents[sim.world.mayorId], 'le village n’a plus de maire');
  assert.equal(vote.status, 'closed');
});

test('un candidat banni pendant le vote ne peut pas être élu', () => {
  const sim = newSim();
  const mayor = sim.world.mayorId;
  for (const a of Object.values(sim.world.agents)) a.opinions[mayor] = -0.9;
  sim.politics.open(sim, true);
  const vote = sim.world.votes.at(-1)!;
  const others = Object.keys(sim.world.agents).filter((id) => id !== mayor);
  const banned = others[0];
  vote.candidates = [banned, others[1]];
  for (const voter of others) vote.ballots.push({ voterId: voter, destitute: true, candidateId: banned } as never);
  sim.daily.banish(sim, banned);
  assert.doesNotThrow(() => sim.politics.close(sim, vote));
  assert.notEqual(sim.world.mayorId, banned);
  assert.ok(sim.world.agents[sim.world.mayorId]);
});

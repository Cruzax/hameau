import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FounderSpec } from '@hameau/shared';
import { createLLMBrain } from '../agents/llmBrain';
import type { LLMProvider, LLMRequest } from '../llm/LLMProvider';
import { Sim } from '../sim/Sim';
import { Journal } from '../store/journal';

/** Faux fournisseur d'IA : répond comme le script, mais compte qui l'appelle. */
function fakeProvider() {
  const calls: string[] = [];
  const provider: LLMProvider = {
    name: 'anthropic',
    async complete<T>(req: LLMRequest<T>) {
      calls.push(req.system.match(/Tu es ([^,]+),/)?.[1] ?? '?');
      return { data: req.scripted(), tokensIn: 10, tokensOut: 5 };
    },
  };
  return { provider, calls };
}

const FOUNDERS: FounderSpec[] = [
  { name: 'Maxence', traits: ['ambitieux'], role: 'MAIRE' },
  { name: 'Rose', traits: ['fouineur'], role: 'ECLAIREUR', ai: true },
  { name: 'Marie', traits: ['reveur'], role: 'ECRIVAIN' },
  { name: 'Gabin', traits: ['bavard'], role: 'CITOYEN' },
];

test('seul le villageois choisi pense avec l’IA ; les autres agissent quand même', async () => {
  const { provider, calls } = fakeProvider();
  const sim = new Sim(createLLMBrain(provider), new Journal(join(mkdtempSync(join(tmpdir(), 'hameau-')), 'j.jsonl')), () => {});
  sim.reset({ founders: FOUNDERS });
  assert.equal(sim.world.agents[sim.world.aiAgentId!].name, 'Rose');
  sim.emit('crime.theft', [], '🚨 Vol chez Gabin cette nuit : 3 pains ont disparu !');
  for (let i = 0; i < 2 * sim.clock.ticksPerDay; i++) {
    sim.tick();
    if (i % 4 === 0) await new Promise((r) => setImmediate(r));
  }
  assert.ok(calls.length > 0, 'l’agent IA n’a jamais été appelé');
  assert.deepEqual([...new Set(calls)], ['Rose']);
  const llmCalls = sim.journal.events.filter((e) => e.type === 'llm.call');
  assert.ok(llmCalls.every((e) => e.actors[0] === sim.world.aiAgentId));
  const others = sim.journal.events.filter((e) => e.type === 'message.sent' && e.actors[0] !== sim.world.aiAgentId);
  assert.ok(others.length > 0, 'les autres habitants ne font plus rien');
});

test('sans agent IA choisi, aucun appel à l’IA', async () => {
  const { provider, calls } = fakeProvider();
  const sim = new Sim(createLLMBrain(provider), new Journal(join(mkdtempSync(join(tmpdir(), 'hameau-')), 'j.jsonl')), () => {});
  sim.reset({ founders: FOUNDERS.map((f) => ({ ...f, ai: false })) });
  for (let i = 0; i < sim.clock.ticksPerDay; i++) {
    sim.tick();
    if (i % 4 === 0) await new Promise((r) => setImmediate(r));
  }
  assert.equal(calls.length, 0);
});

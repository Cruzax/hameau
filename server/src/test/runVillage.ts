import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SimEvent, VillagePreset } from '@hameau/shared';
import { createProvider } from '../llm';
import { LLM_CONFIG } from '../llm/config';
import { createLLMBrain } from '../agents/llmBrain';
import { Sim } from '../sim/Sim';
import { Journal } from '../store/journal';

// Simulation sans écran ni minuterie : N jours en mode gratuit, aussi vite que possible.

export interface RunOptions {
  days: number;
  preset?: VillagePreset;
}

export async function runVillage(opts: RunOptions): Promise<{ sim: Sim; events: SimEvent[] }> {
  const journal = new Journal(join(mkdtempSync(join(tmpdir(), 'hameau-')), 'journal.jsonl'));
  const sim = new Sim(createLLMBrain(createProvider('mock')), journal, () => {});
  if (opts.preset) sim.reset(opts.preset);
  // Même budget d'appels que le serveur réel (index.ts).
  sim.world.llm.budget.maxCallsPerDay = LLM_CONFIG.maxCallsPerDay;
  sim.begin();
  const total = opts.days * sim.clock.ticksPerDay;
  for (let i = 0; i < total; i++) {
    sim.tick();
    // Laisse les promesses du cerveau (même scripté) se résoudre.
    if (i % 4 === 0) await new Promise((r) => setImmediate(r));
  }
  return { sim, events: journal.events };
}

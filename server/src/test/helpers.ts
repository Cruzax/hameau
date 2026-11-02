import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProvider } from '../llm';
import { createLLMBrain } from '../agents/llmBrain';
import { Sim } from '../sim/Sim';
import { Journal } from '../store/journal';

/** Simulation de test en mode gratuit, journal dans un dossier temporaire. */
export function newSim() {
  return new Sim(createLLMBrain(createProvider()), new Journal(join(mkdtempSync(join(tmpdir(), 'hameau-')), 'j.jsonl')), () => {});
}

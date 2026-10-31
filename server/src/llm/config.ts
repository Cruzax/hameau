import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// .env à la racine du projet (facultatif). Les variables déjà définies l'emportent.
const envFile = resolve(import.meta.dirname, '../../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export type ProviderName = 'mock' | 'anthropic' | 'ollama';

const env = process.env;
const provider = (env.LLM_PROVIDER ?? 'mock') as ProviderName;

export const LLM_CONFIG = {
  provider: (['mock', 'anthropic', 'ollama'] as const).includes(provider) ? provider : 'mock',
  /** Garde-fou n°1 : au-delà, les agents se taisent jusqu'au lendemain. */
  maxCallsPerDay: Number(env.LLM_MAX_CALLS_PER_DAY ?? 40),
  /** Garde-fou n°2 : plafond de tokens générés par appel (réflexion comprise). */
  maxTokens: Number(env.LLM_MAX_TOKENS ?? 1024),
  anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
  ollamaUrl: env.OLLAMA_URL ?? 'http://localhost:11434',
  ollamaModel: env.OLLAMA_MODEL ?? 'llama3.1',
};

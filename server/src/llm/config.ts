import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// .env à la racine du projet (facultatif). Les variables déjà définies l'emportent.
export const ENV_FILE = resolve(import.meta.dirname, '../../../.env');
const envFile = ENV_FILE;
if (existsSync(envFile)) process.loadEnvFile(envFile);

/** Relit .env sans redémarrer : une clé ajoutée en cours de partie devient utilisable. */
export function reloadEnv() {
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export type ProviderName = 'mock' | 'anthropic' | 'ollama';

const env = process.env;
const provider = (env.LLM_PROVIDER ?? 'mock') as ProviderName;

export const LLM_CONFIG = {
  provider: ((['mock', 'anthropic', 'ollama'] as const).includes(provider) ? provider : 'mock') as ProviderName,
  /** Garde-fou n°1 : au-delà, les agents se taisent jusqu'au lendemain. */
  maxCallsPerDay: Number(env.LLM_MAX_CALLS_PER_DAY ?? 40),
  /** Garde-fou n°2 : plafond de tokens générés par appel (réflexion comprise). */
  maxTokens: Number(env.LLM_MAX_TOKENS ?? 1024),
  anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
  ollamaUrl: env.OLLAMA_URL ?? 'http://localhost:11434',
  ollamaModel: env.OLLAMA_MODEL ?? 'llama3.1',
};

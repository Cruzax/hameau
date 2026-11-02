import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// .env à la racine du projet (facultatif). Les variables déjà définies l'emportent.
const envFile = resolve(import.meta.dirname, '../../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export type ProviderName = 'mock';

const env = process.env;

export const LLM_CONFIG = {
  /** Appels comptés par jour (affichage de l'estimation ; aucun plafond en mode gratuit). */
  maxCallsPerDay: Number(env.LLM_MAX_CALLS_PER_DAY ?? 40),
  /** Tokens estimés au plus par appel. */
  maxTokens: Number(env.LLM_MAX_TOKENS ?? 1024),
};

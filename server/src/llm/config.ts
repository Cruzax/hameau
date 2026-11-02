import { env } from '../env';

export type ProviderName = 'mock';

export const LLM_CONFIG = {
  /** Appels comptés par jour (affichage de l'estimation ; aucun plafond en mode gratuit). */
  maxCallsPerDay: Number(env.LLM_MAX_CALLS_PER_DAY ?? 40),
  /** Tokens estimés au plus par appel. */
  maxTokens: Number(env.LLM_MAX_TOKENS ?? 1024),
};

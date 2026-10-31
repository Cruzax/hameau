import type { z } from 'zod';
import type { ProviderName } from './config';

export interface LLMRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Réponse scriptée : utilisée telle quelle par le provider mock. */
  scripted: () => T;
}

export interface LLMResult<T> {
  /** null si la réponse est inutilisable (refus, tronquée, JSON invalide, erreur réseau). */
  data: T | null;
  tokensIn: number;
  tokensOut: number;
  error?: string;
}

/** Tout ce que la simulation attend d'un modèle : une réponse JSON conforme à un schéma. */
export interface LLMProvider {
  readonly name: ProviderName;
  complete<T>(req: LLMRequest<T>): Promise<LLMResult<T>>;
}

/** Estimation grossière (~4 caractères par token) pour afficher un coût indicatif en mock. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

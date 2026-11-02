// Estimation de ce que coûterait le village s'il tournait sur Claude (pour plus tard) :
// en mode gratuit, chaque décision scriptée compte quand même ses tokens approximatifs.

/** Le cerveau des agents : uniquement les règles gratuites pour l'instant. */
export type LLMProviderName = 'mock';

/** Prix Claude en dollars par million de tokens (entrée, sortie). */
export const CLAUDE_PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};
/** Conversion approximative pour afficher un ordre de grandeur en euros. */
export const USD_TO_EUR = 0.92;

/** Coût estimé en euros d'un volume de tokens avec un modèle Claude. */
export function claudeCost(model: keyof typeof CLAUDE_PRICES, tokensIn: number, tokensOut: number): number {
  const [pin, pout] = CLAUDE_PRICES[model];
  return ((tokensIn * pin + tokensOut * pout) / 1e6) * USD_TO_EUR;
}

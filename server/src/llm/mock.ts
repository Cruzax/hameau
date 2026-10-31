import { estimateTokens, type LLMProvider, type LLMRequest, type LLMResult } from './LLMProvider';

/** Aucun appel réseau : renvoie la réponse scriptée. Les tokens affichés sont une estimation
 *  de ce que coûterait le même prompt avec un vrai modèle. */
export class MockProvider implements LLMProvider {
  readonly name = 'mock' as const;

  async complete<T>(req: LLMRequest<T>): Promise<LLMResult<T>> {
    const data = req.scripted();
    return {
      data,
      tokensIn: estimateTokens(req.system + req.prompt),
      tokensOut: estimateTokens(JSON.stringify(data)),
    };
  }
}

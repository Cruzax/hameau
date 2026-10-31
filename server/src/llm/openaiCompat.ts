import { z } from 'zod';
import type { LLMProviderName } from '@hameau/shared';
import type { LLMProvider, LLMRequest, LLMResult } from './LLMProvider';

/**
 * Fournisseurs à l'API compatible OpenAI (DeepSeek, OpenAI, OpenRouter, Groq, Grok, Gemini, Mistral).
 * On demande un objet JSON et on décrit le schéma dans le prompt : c'est le plus petit dénominateur
 * commun (DeepSeek, par exemple, ne prend pas de schéma strict). La réponse est validée avec zod.
 */
export class OpenAICompatProvider implements LLMProvider {
  constructor(
    readonly name: LLMProviderName,
    private readonly baseURL: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly maxTokens: number,
  ) {}

  async complete<T>(req: LLMRequest<T>): Promise<LLMResult<T>> {
    const schema = JSON.stringify(z.toJSONSchema(req.schema));
    try {
      const res = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: `${req.prompt}\n\nRéponds UNIQUEMENT avec un objet JSON valide qui respecte ce schéma JSON :\n${schema}` },
          ],
        }),
      });
      if (!res.ok) return { data: null, tokensIn: 0, tokensOut: 0, error: `${this.name} ${res.status} : ${(await res.text()).slice(0, 120)}` };
      const body = (await res.json()) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const tokensIn = body.usage?.prompt_tokens ?? 0;
      const tokensOut = body.usage?.completion_tokens ?? 0;
      const choice = body.choices?.[0];
      if (choice?.finish_reason === 'length') return { data: null, tokensIn, tokensOut, error: 'réponse tronquée (LLM_MAX_TOKENS trop bas)' };
      // Certains modèles entourent le JSON de ```json … ``` malgré la consigne.
      const text = (choice?.message?.content ?? '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '');
      const parsed = req.schema.safeParse(JSON.parse(text || 'null'));
      return parsed.success ? { data: parsed.data, tokensIn, tokensOut } : { data: null, tokensIn, tokensOut, error: 'JSON invalide' };
    } catch (e) {
      return { data: null, tokensIn: 0, tokensOut: 0, error: `${this.name} injoignable ou réponse illisible : ${(e as Error).message}` };
    }
  }
}

/** Liste des modèles accessibles avec cette clé (appel gratuit), ou une erreur lisible. */
export async function listModels(baseURL: string, apiKey: string): Promise<{ models: string[] } | { error: string }> {
  try {
    const res = await fetch(`${baseURL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401 || res.status === 403) return { error: 'clé refusée' };
    if (!res.ok) return { error: `erreur ${res.status}` };
    const body = (await res.json()) as { data?: { id: string }[] };
    return { models: (body.data ?? []).map((m) => m.id.replace(/^models\//, '')) };
  } catch {
    return { error: 'service injoignable' };
  }
}

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { LLMProvider, LLMRequest, LLMResult } from './LLMProvider';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic' as const;
  private readonly client = new Anthropic();

  constructor(
    private readonly model: string,
    private readonly maxTokens: number,
  ) {}

  async complete<T>(req: LLMRequest<T>): Promise<LLMResult<T>> {
    try {
      const res = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: this.maxTokens,
        // Effort bas : des répliques courtes n'ont pas besoin de longue réflexion (coût).
        output_config: { effort: 'low', format: betaZodOutputFormat(req.schema) },
        // Si le modèle décline, l'API relance la requête sur un modèle de repli.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        // Prompt système stable par agent en premier : réutilisable par le cache.
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: req.prompt }],
      });
      const u = res.usage;
      const tokensIn = u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      const tokensOut = u.output_tokens;
      if (res.stop_reason === 'refusal') return { data: null, tokensIn, tokensOut, error: 'refus du modèle' };
      if (res.stop_reason === 'max_tokens') return { data: null, tokensIn, tokensOut, error: 'réponse tronquée (LLM_MAX_TOKENS trop bas)' };
      return { data: res.parsed_output ?? null, tokensIn, tokensOut, error: res.parsed_output ? undefined : 'JSON invalide' };
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) return fail('clé API invalide ou absente (ANTHROPIC_API_KEY)');
      if (e instanceof Anthropic.RateLimitError) return fail('limite de débit atteinte');
      if (e instanceof Anthropic.APIError) return fail(`erreur API ${e.status} : ${e.message}`);
      return fail(`erreur réseau : ${(e as Error).message}`);
    }
  }
}

const fail = (error: string) => ({ data: null, tokensIn: 0, tokensOut: 0, error });

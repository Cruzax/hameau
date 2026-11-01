import { z } from 'zod';
import type { LLMProvider, LLMRequest, LLMResult } from './LLMProvider';

/** Modèle local via Ollama (gratuit, plus lent, moins fiable sur le JSON). */
export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama' as const;

  constructor(
    private readonly url: string,
    private readonly model: string,
    private readonly maxTokens: number,
  ) {}

  async complete<T>(req: LLMRequest<T>): Promise<LLMResult<T>> {
    try {
      const res = await fetch(`${this.url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: z.toJSONSchema(req.schema),
          options: { num_predict: this.maxTokens },
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.prompt },
          ],
        }),
      });
      if (res.status === 404) return { data: null, tokensIn: 0, tokensOut: 0, error: `modèle « ${this.model} » absent (ollama pull ${this.model})` };
      if (!res.ok) return { data: null, tokensIn: 0, tokensOut: 0, error: `Ollama ${res.status}` };
      const body = (await res.json()) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
      const tokensIn = body.prompt_eval_count ?? 0;
      const tokensOut = body.eval_count ?? 0;
      const parsed = req.schema.safeParse(JSON.parse(body.message?.content ?? 'null'));
      return parsed.success ? { data: parsed.data, tokensIn, tokensOut } : { data: null, tokensIn, tokensOut, error: 'JSON invalide' };
    } catch (e) {
      return { data: null, tokensIn: 0, tokensOut: 0, error: `Ollama injoignable : ${(e as Error).message}` };
    }
  }
}

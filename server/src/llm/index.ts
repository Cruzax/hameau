import type { LLMProvider } from './LLMProvider';
import { MockProvider } from './mock';

/** Le cerveau des agents : les règles gratuites (réponses scriptées, tokens estimés). */
export function createProvider(): LLMProvider {
  return new MockProvider();
}

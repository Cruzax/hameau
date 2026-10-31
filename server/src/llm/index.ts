import { LLM_CONFIG } from './config';
import type { LLMProvider } from './LLMProvider';
import { MockProvider } from './mock';
import { AnthropicProvider } from './anthropic';
import { OllamaProvider } from './ollama';

export function createProvider(cfg = LLM_CONFIG): LLMProvider {
  switch (cfg.provider) {
    case 'anthropic':
      return new AnthropicProvider(cfg.anthropicModel, cfg.maxTokens);
    case 'ollama':
      return new OllamaProvider(cfg.ollamaUrl, cfg.ollamaModel, cfg.maxTokens);
    default:
      return new MockProvider();
  }
}

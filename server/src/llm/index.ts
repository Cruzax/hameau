import { PROVIDERS, type LLMProviderName } from '@hameau/shared';
import { LLM_CONFIG } from './config';
import type { LLMProvider } from './LLMProvider';
import { MockProvider } from './mock';
import { AnthropicProvider } from './anthropic';
import { OllamaProvider } from './ollama';
import { OpenAICompatProvider } from './openaiCompat';
import { defaultModel } from './apiKey';

/** Construit le fournisseur demandé. Sans clé pour un fournisseur payant, on retombe sur le mock. */
export function createProvider(name: LLMProviderName = LLM_CONFIG.provider, model?: string): LLMProvider {
  const info = PROVIDERS[name];
  switch (name) {
    case 'mock':
      return new MockProvider();
    case 'anthropic':
      return new AnthropicProvider(model ?? LLM_CONFIG.anthropicModel, LLM_CONFIG.maxTokens);
    case 'ollama':
      return new OllamaProvider(LLM_CONFIG.ollamaUrl, model ?? LLM_CONFIG.ollamaModel, LLM_CONFIG.maxTokens);
    default: {
      const key = info.envKey && process.env[info.envKey];
      if (!key || !info.baseURL) return new MockProvider();
      return new OpenAICompatProvider(name, info.baseURL, key, model ?? defaultModel(name) ?? '', LLM_CONFIG.maxTokens);
    }
  }
}

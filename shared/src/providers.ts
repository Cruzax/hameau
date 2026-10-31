// Fournisseurs d'IA reconnus. Partagé : le serveur s'en sert pour appeler l'API,
// le site pour afficher le fournisseur détecté dès qu'on colle une clé.

export type LLMProviderName =
  | 'mock' | 'anthropic' | 'ollama'
  | 'deepseek' | 'openai' | 'openrouter' | 'groq' | 'xai' | 'gemini' | 'mistral';

export interface ProviderInfo {
  id: LLMProviderName;
  label: string;
  /** Variable du .env qui contient la clé (absent : pas de clé). */
  envKey?: string;
  /** API compatible OpenAI (chat/completions + models). */
  baseURL?: string;
  /** Modèles préférés, du meilleur rapport qualité/prix au moins bon (sous-chaînes). */
  preferred?: string[];
  /** Où créer une clé. */
  console?: string;
}

export const PROVIDERS: Record<LLMProviderName, ProviderInfo> = {
  mock: { id: 'mock', label: 'Gratuit (scripté)' },
  ollama: { id: 'ollama', label: 'Ollama (local)' },
  anthropic: { id: 'anthropic', label: 'Claude (Anthropic)', envKey: 'ANTHROPIC_API_KEY', preferred: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'], console: 'console.anthropic.com' },
  deepseek: { id: 'deepseek', label: 'DeepSeek', envKey: 'DEEPSEEK_API_KEY', baseURL: 'https://api.deepseek.com/v1', preferred: ['deepseek-chat'], console: 'platform.deepseek.com' },
  openai: { id: 'openai', label: 'OpenAI (ChatGPT)', envKey: 'OPENAI_API_KEY', baseURL: 'https://api.openai.com/v1', preferred: ['gpt-4o-mini', 'mini', 'gpt-4o'], console: 'platform.openai.com' },
  openrouter: { id: 'openrouter', label: 'OpenRouter', envKey: 'OPENROUTER_API_KEY', baseURL: 'https://openrouter.ai/api/v1', preferred: ['deepseek/deepseek-chat', 'openai/gpt-4o-mini'], console: 'openrouter.ai' },
  groq: { id: 'groq', label: 'Groq', envKey: 'GROQ_API_KEY', baseURL: 'https://api.groq.com/openai/v1', preferred: ['llama-3.3-70b', 'llama'], console: 'console.groq.com' },
  xai: { id: 'xai', label: 'Grok (xAI)', envKey: 'XAI_API_KEY', baseURL: 'https://api.x.ai/v1', preferred: ['mini', 'grok'], console: 'console.x.ai' },
  gemini: { id: 'gemini', label: 'Gemini (Google)', envKey: 'GEMINI_API_KEY', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', preferred: ['flash-lite', 'flash', 'gemini'], console: 'aistudio.google.com' },
  mistral: { id: 'mistral', label: 'Mistral', envKey: 'MISTRAL_API_KEY', baseURL: 'https://api.mistral.ai/v1', preferred: ['mistral-small-latest', 'small', 'mistral'], console: 'console.mistral.ai' },
};

/** Fournisseurs qui demandent une clé, dans l'ordre d'affichage. */
export const KEYED_PROVIDERS: LLMProviderName[] = ['anthropic', 'deepseek', 'openai', 'openrouter', 'groq', 'xai', 'gemini', 'mistral'];

/**
 * Fournisseurs possibles pour une clé, d'après sa forme (du plus probable au moins probable).
 * Certaines formes sont ambiguës (DeepSeek et les anciennes clés OpenAI se ressemblent) :
 * le serveur tranche en testant la clé, uniquement auprès de ces candidats.
 */
export function detectProviders(rawKey: string): LLMProviderName[] {
  const key = rawKey.trim();
  if (key.startsWith('sk-ant-')) return ['anthropic'];
  if (key.startsWith('sk-or-')) return ['openrouter'];
  if (/^sk-(proj|svcacct|admin)-/.test(key)) return ['openai'];
  if (key.startsWith('gsk_')) return ['groq'];
  if (key.startsWith('xai-')) return ['xai'];
  if (key.startsWith('AIza')) return ['gemini'];
  if (/^sk-[a-f0-9]{32}$/.test(key)) return ['deepseek', 'openai'];
  if (/^sk-[A-Za-z0-9_-]{20,}$/.test(key)) return ['openai', 'deepseek'];
  if (/^[A-Za-z0-9]{32}$/.test(key)) return ['mistral'];
  return [];
}

/** Prix Claude en dollars par million de tokens (entrée, sortie). */
export const CLAUDE_PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};
/** Conversion approximative pour afficher un ordre de grandeur en euros. */
export const USD_TO_EUR = 0.92;

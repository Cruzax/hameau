import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { detectProviders, PROVIDERS, type LLMProviderName } from '@hameau/shared';
import { ENV_FILE } from './config';
import { listModels } from './openaiCompat';

/** Fin de clé affichable (jamais la clé entière). */
export const keyHint = (key?: string) => (key ? `…${key.slice(-4)}` : undefined);

/** Modèles accessibles avec la clé (appel gratuit), ou une erreur lisible. */
export async function verifyKey(provider: LLMProviderName, key: string): Promise<{ models: string[] } | { error: string }> {
  const info = PROVIDERS[provider];
  if (provider === 'anthropic') {
    try {
      const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 10_000 });
      const models: string[] = [];
      for await (const m of client.models.list({ limit: 50 })) models.push(m.id);
      return { models };
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return { error: 'clé refusée' };
      if (e instanceof Anthropic.APIError) return { error: `erreur ${e.status}` };
      return { error: 'service injoignable' };
    }
  }
  if (!info.baseURL) return { error: 'fournisseur sans API' };
  return listModels(info.baseURL, key);
}

/**
 * Reconnaît le fournisseur d'une clé : d'abord sa forme, puis un test gratuit, uniquement
 * auprès des candidats plausibles (on n'envoie jamais une clé à tous les services au hasard).
 */
export async function identifyKey(key: string): Promise<{ provider: LLMProviderName; models: string[] } | { error: string }> {
  const candidates = detectProviders(key);
  if (!candidates.length) return { error: 'format de clé inconnu' };
  const errors: string[] = [];
  for (const provider of candidates) {
    const r = await verifyKey(provider, key);
    if ('models' in r) return { provider, models: r.models };
    errors.push(`${PROVIDERS[provider].label} : ${r.error}`);
  }
  return { error: errors.join(' ; ') };
}

/** Écrit (ou efface) une clé dans .env, qui n'est jamais versionné, et l'applique tout de suite. */
export function storeKey(envKey: string, key: string | null) {
  const pattern = new RegExp(`^\\s*${envKey}\\s*=.*$`, 'm');
  const line = `${envKey}=${key ?? ''}`;
  const current = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
  const next = pattern.test(current) ? current.replace(pattern, line) : `${current}${current && !current.endsWith('\n') ? '\n' : ''}${line}\n`;
  writeFileSync(ENV_FILE, next);
  if (key) process.env[envKey] = key;
  else delete process.env[envKey];
}

/** Modèle par défaut d'un fournisseur : le premier « préféré » disponible, sinon le premier de la liste. */
export function defaultModel(provider: LLMProviderName, models: string[] = []): string | undefined {
  for (const want of PROVIDERS[provider].preferred ?? []) {
    const hit = models.find((m) => m === want) ?? models.find((m) => m.includes(want));
    if (hit) return hit;
  }
  return models[0] ?? PROVIDERS[provider].preferred?.[0];
}

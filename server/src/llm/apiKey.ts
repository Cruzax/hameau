import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { ENV_FILE } from './config';

const KEY_LINE = /^\s*ANTHROPIC_API_KEY\s*=.*$/m;

/** Fin de clé affichable (jamais la clé entière). */
export const keyHint = (key?: string) => (key ? `…${key.slice(-4)}` : undefined);

/** Vérifie la clé auprès d'Anthropic avec un appel gratuit (liste des modèles). */
export async function verifyKey(key: string): Promise<string | null> {
  try {
    await new Anthropic({ apiKey: key, maxRetries: 0, timeout: 10_000 }).models.list({ limit: 1 });
    return null;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return 'clé refusée par Anthropic';
    if (e instanceof Anthropic.PermissionDeniedError) return 'cette clé n’a pas accès à l’API';
    if (e instanceof Anthropic.APIError) return `erreur ${e.status}`;
    return 'Anthropic injoignable (connexion internet ?)';
  }
}

/** Écrit (ou efface) la clé dans .env, qui n'est jamais versionné, et l'applique tout de suite. */
export function storeKey(key: string | null) {
  const line = `ANTHROPIC_API_KEY=${key ?? ''}`;
  const current = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
  const next = KEY_LINE.test(current) ? current.replace(KEY_LINE, line) : `${current}${current && !current.endsWith('\n') ? '\n' : ''}${line}\n`;
  writeFileSync(ENV_FILE, next);
  if (key) process.env.ANTHROPIC_API_KEY = key;
  else delete process.env.ANTHROPIC_API_KEY;
}

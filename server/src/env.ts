/** Variables d'environnement : celles de Node côté serveur, aucune dans le navigateur. */
const node = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
export const env: Record<string, string | undefined> = node?.env ?? {};

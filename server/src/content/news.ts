// Nouvelles fraîches du village, que l'éclaireur peut proposer comme sujet de gazette.
// Alimentées par la vie quotidienne (vols, fêtes, événements…), consommées par la gazette.

const fresh: string[] = [];
const MAX = 12;

export function pushNews(text: string) {
  const clean = text.replace(/^[^\p{L}]+/u, '').split(/[.!]/)[0].trim();
  if (clean.length < 12) return;
  fresh.push(clean);
  if (fresh.length > MAX) fresh.shift();
}

/** La nouvelle la plus récente pas encore traitée, ou undefined. */
export function takeNews(): string | undefined {
  return fresh.pop();
}

import { claudeCost, CLAUDE_PRICES } from '@hameau/shared';
import { useHameau } from '../net/store';

// Badge 🧠 : les agents tournent en gratuit (règles scriptées), mais on estime ce que coûterait une vraie IA.

const kTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const euros = (x: number) => (x < 0.01 ? '< 0,01 €' : `${x.toLocaleString('fr-FR', { maximumFractionDigits: x < 1 ? 2 : 1 })} €`);

const MODELS: [keyof typeof CLAUDE_PRICES, string][] = [
  ['claude-haiku-5-5', 'Haiku'],
  ['claude-sonnet-5-5', 'Sonnet'],
  ['claude-opus-5-5', 'Opus'],
];

export function Estimate() {
  const b = useHameau((s) => s.world.llm.budget);
  const sonnet = claudeCost('claude-sonnet-5-5', b.tokensIn, b.tokensOut);
  const detail = MODELS.map(([m, label]) => `${label} : ${euros(claudeCost(m, b.tokensIn, b.tokensOut))}`).join('\n');
  return (
    <span
      className="controls__llm"
      title={`Les habitants pensent avec des règles gratuites.\nTokens estimés depuis le début : ${b.tokensIn} en entrée, ${b.tokensOut} en sortie.\nCe que ça aurait coûté avec Claude :\n${detail}`}
    >
      🧠 gratuit · {b.callsToday} décisions aujourd’hui · {kTokens(b.tokensIn)}↓ {kTokens(b.tokensOut)}↑ · ≈ {euros(sonnet)} avec Claude
    </span>
  );
}

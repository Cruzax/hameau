import { useEffect, useState } from 'react';
import { CLAUDE_PRICES, detectProviders, KEYED_PROVIDERS, PROVIDERS, USD_TO_EUR, type LLMProviderName } from '@hameau/shared';
import { useHameau } from '../net/store';

/** Ordre de grandeur mesuré en mock : tokens consommés par jour simulé (décisions, votes, mémoire). */
const TOKENS_PER_DAY = { in: 15_000, out: 5_000 };

const CLAUDE_LABELS: Record<string, string> = {
  'claude-opus-5-5': 'Opus 5.5 — le plus fin',
  'claude-sonnet-5-5': 'Sonnet 5.5 — équilibré',
  'claude-haiku-5-5': 'Haiku 5.5 — le moins cher',
};

const kTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const euros = (x: number) => (x < 0.01 ? '< 0,01 €' : `${x.toLocaleString('fr-FR', { maximumFractionDigits: x < 1 ? 2 : 1 })} €`);

/** Coût en euros d'un volume de tokens avec un modèle Claude (null si prix inconnu). */
function claudeCost(model: string | undefined, tokensIn: number, tokensOut: number) {
  const price = model && CLAUDE_PRICES[model];
  return price ? ((tokensIn * price[0] + tokensOut * price[1]) / 1e6) * USD_TO_EUR : null;
}

/** Ce que la clé collée semble être, avant même de l'envoyer. */
function guess(key: string) {
  if (!key.trim()) return '';
  const c = detectProviders(key);
  if (!c.length) return 'Format de clé inconnu.';
  if (c.length === 1) return `Clé ${PROVIDERS[c[0]].label} détectée.`;
  return `${c.map((p) => PROVIDERS[p].label).join(' ou ')} : je vérifie à l’enregistrement.`;
}

/** Badge 🧠 + menu : gratuit, une clé API (fournisseur reconnu automatiquement), ou Ollama. */
export function BrainMenu() {
  const llm = useHameau((s) => s.world.llm);
  const aiAgent = useHameau((s) => (s.world.aiAgentId ? s.world.agents[s.world.aiAgentId]?.name : undefined));
  const clock = useHameau((s) => s.world.clock);
  const send = useHameau((s) => s.send);
  const connected = useHameau((s) => s.connected);
  const feedback = useHameau((s) => [...s.events].reverse().find((e) => e.type === 'llm.config'));
  const [open, setOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState<Partial<Record<LLMProviderName, string>>>({});
  useEffect(() => setSaving(false), [feedback?.seq]);

  const b = llm.budget;
  const available = llm.available ?? {};
  const spent = llm.provider === 'anthropic' ? claudeCost(llm.model, b.tokensIn, b.tokensOut) : null;
  const daysPerHour = 3600 / ((clock.ticksPerDay * clock.tickMs) / 1000);

  const modelsFor = (p: LLMProviderName) =>
    p === 'anthropic' ? Object.keys(CLAUDE_PRICES) : (llm.models?.[p] ?? []).slice().sort();
  const modelFor = (p: LLMProviderName) =>
    picked[p] ?? (llm.provider === p ? llm.model : undefined) ?? (p === 'anthropic' ? 'claude-opus-5-5' : modelsFor(p)[0]);

  const activate = (provider: LLMProviderName, model?: string) => {
    send({ type: 'llm.config', provider, model });
    setOpen(false);
  };

  return (
    <span className="brain">
      <button
        className={`controls__llm ${b.callsToday >= b.maxCallsPerDay ? 'is-exhausted' : ''}`}
        onClick={() => setOpen(!open)}
        title="Choisir le cerveau des agents"
      >
        🧠 {llm.provider === 'mock' ? 'gratuit' : PROVIDERS[llm.provider].label} · {b.callsToday}/{b.maxCallsPerDay} · {kTokens(b.tokensIn)}↓{' '}
        {kTokens(b.tokensOut)}↑{spent !== null ? ` · ≈ ${euros(spent)}` : ''} ▾
      </button>
      {open && (
        <div className="brain__menu">
          <div className="brain__title">Cerveau des agents</div>
          <span className="brain__small">
            {aiAgent
              ? `L’IA choisie ici ne pilote que ${aiAgent} ; tout le reste du village suit les règles gratuites.`
              : 'Aucun villageois n’est piloté par l’IA : choisis-en un dans « Nouvelle histoire ».'}
          </span>

          <button className={`brain__opt ${llm.provider === 'mock' ? 'is-current' : ''}`} disabled={!connected} onClick={() => activate('mock')}>
            <strong>🆓 Gratuit</strong>
            <span>Réponses scriptées, 0 €. Les tokens affichés sont une estimation.</span>
          </button>

          <form
            className="brain__opt brain__keyform"
            onSubmit={(e) => {
              e.preventDefault();
              if (!keyInput.trim()) return;
              setSaving(true);
              send({ type: 'llm.key', key: keyInput.trim() });
              setKeyInput('');
            }}
          >
            <strong>🔑 Ajouter une clé API</strong>
            <span>Claude, DeepSeek, OpenAI, OpenRouter, Groq, Grok, Gemini ou Mistral : le fournisseur est reconnu tout seul.</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={keyInput}
              placeholder="Colle ta clé ici"
              onChange={(e) => setKeyInput(e.target.value)}
            />
            {keyInput && <span className="brain__guess">{guess(keyInput)}</span>}
            <button type="submit" disabled={!connected || saving || !keyInput.trim()}>
              {saving ? 'Vérification…' : 'Enregistrer'}
            </button>
            <span className="brain__small">La clé reste sur ton PC (fichier .env, jamais commité) ; seule sa fin est affichée.</span>
            {feedback?.payload.key === true && <em className={feedback.payload.ok ? 'is-ok' : ''}>{feedback.text}</em>}
          </form>

          {KEYED_PROVIDERS.filter((p) => llm.keyHints?.[p]).map((p) => {
            const models = modelsFor(p);
            const model = modelFor(p);
            const perDay = p === 'anthropic' ? claudeCost(model, TOKENS_PER_DAY.in, TOKENS_PER_DAY.out) : null;
            return (
              <div key={p} className={`brain__opt ${llm.provider === p ? 'is-current' : ''}`}>
                <strong>
                  ✨ {PROVIDERS[p].label} <span className="brain__hint">{llm.keyHints?.[p]}</span>
                </strong>
                <div className="brain__row">
                  <select value={model ?? ''} onChange={(e) => setPicked({ ...picked, [p]: e.target.value })}>
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {CLAUDE_LABELS[m] ?? m}
                      </option>
                    ))}
                  </select>
                  <button disabled={!connected || !available[p]} onClick={() => activate(p, model)}>
                    Activer
                  </button>
                </div>
                {perDay !== null && (
                  <span>
                    ≈ {euros(perDay)} par jour simulé, soit ≈ {euros(perDay * daysPerHour)} par heure de simulation à ×1
                    (plafonné à {b.maxCallsPerDay} appels par jour).
                  </span>
                )}
                <button className="brain__link" onClick={() => send({ type: 'llm.key', key: null, provider: p })}>
                  effacer la clé
                </button>
              </div>
            );
          })}

          <div className={`brain__opt ${llm.provider === 'ollama' ? 'is-current' : ''} ${available.ollama ? '' : 'is-off'}`}>
            <strong>🖥 Ollama (modèle local)</strong>
            <span>
              Logiciel gratuit qui fait tourner une IA open source (Llama, DeepSeek, Mistral…) sur ton PC, sans internet ni clé.
              Moins malin et plus lent. Installe-le depuis ollama.com, puis par exemple <code>ollama pull deepseek-r1:8b</code>.
            </span>
            <div className="brain__row">
              {available.ollama && modelsFor('ollama').length > 0 && (
                <select value={modelFor('ollama') ?? ''} onChange={(e) => setPicked({ ...picked, ollama: e.target.value })}>
                  {modelsFor('ollama').map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
              <button disabled={!connected || !available.ollama} onClick={() => activate('ollama', modelFor('ollama'))}>
                Activer
              </button>
              {!available.ollama && (
                <button className="brain__link" onClick={() => send({ type: 'llm.config', provider: 'ollama' })}>
                  Ollama lancé ? Revérifier
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

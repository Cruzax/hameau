import { useState } from 'react';
import type { LLMProviderName } from '@hameau/shared';
import { useHameau } from '../net/store';

const CLAUDE_MODELS: [string, string][] = [
  ['claude-opus-5-5', 'Opus 5.5 — le plus fin'],
  ['claude-sonnet-5-5', 'Sonnet 5.5 — équilibré'],
  ['claude-haiku-5-5', 'Haiku 5.5 — le moins cher'],
];

const kTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** Badge 🧠 du bandeau + menu pour choisir le cerveau des agents (gratuit, Claude, Ollama). */
export function BrainMenu() {
  const llm = useHameau((s) => s.world.llm);
  const send = useHameau((s) => s.send);
  const connected = useHameau((s) => s.connected);
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState(llm.provider === 'anthropic' && llm.model ? llm.model : CLAUDE_MODELS[0][0]);
  const b = llm.budget;
  const available = llm.available ?? { mock: true, anthropic: false, ollama: false };
  const label = llm.provider === 'mock' ? 'gratuit' : llm.provider === 'anthropic' ? 'Claude' : 'Ollama';

  const choose = (provider: LLMProviderName, m?: string) => {
    send({ type: 'llm.config', provider, model: m });
    setOpen(false);
  };

  return (
    <span className="brain">
      <button
        className={`controls__llm ${b.callsToday >= b.maxCallsPerDay ? 'is-exhausted' : ''}`}
        onClick={() => setOpen(!open)}
        title="Choisir le cerveau des agents"
      >
        🧠 {label} · {b.callsToday}/{b.maxCallsPerDay} · {kTokens(b.tokensIn)}↓ {kTokens(b.tokensOut)}↑ ▾
      </button>
      {open && (
        <div className="brain__menu">
          <div className="brain__title">Cerveau des agents</div>

          <button className={`brain__opt ${llm.provider === 'mock' ? 'is-current' : ''}`} disabled={!connected} onClick={() => choose('mock')}>
            <strong>🆓 Gratuit</strong>
            <span>Réponses scriptées, 0 €. Les tokens affichés sont une estimation.</span>
          </button>

          <div className={`brain__opt ${llm.provider === 'anthropic' ? 'is-current' : ''} ${available.anthropic ? '' : 'is-off'}`}>
            <strong>✨ Claude (API Anthropic)</strong>
            <span>
              Les agents pensent vraiment. Quelques centimes par jour simulé, plafonné à {b.maxCallsPerDay} appels par jour.
            </span>
            <div className="brain__row">
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {CLAUDE_MODELS.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <button disabled={!connected || !available.anthropic} onClick={() => choose('anthropic', model)}>
                Activer
              </button>
            </div>
            {!available.anthropic && (
              <em>
                Clé absente : copie <code>.env.example</code> en <code>.env</code> et remplis <code>ANTHROPIC_API_KEY</code>, puis{' '}
                <button className="brain__link" onClick={() => send({ type: 'llm.config', provider: 'anthropic', model })}>
                  revérifie
                </button>
                .
              </em>
            )}
          </div>

          <div className={`brain__opt ${llm.provider === 'ollama' ? 'is-current' : ''} ${available.ollama ? '' : 'is-off'}`}>
            <strong>🖥 Ollama (modèle local)</strong>
            <span>Gratuit, tourne sur ton PC. Plus lent et moins fiable.</span>
            <div className="brain__row">
              <button disabled={!connected || !available.ollama} onClick={() => choose('ollama')}>
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

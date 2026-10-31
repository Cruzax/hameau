import { useEffect, useState } from 'react';
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
  const [keyInput, setKeyInput] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [saving, setSaving] = useState(false);
  // Dernier retour du serveur sur la clé ou le fournisseur (succès ou erreur).
  const feedback = useHameau((s) => [...s.events].reverse().find((e) => e.type === 'llm.config'));
  useEffect(() => setSaving(false), [feedback?.seq]);
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
            {llm.keyHint && !editingKey ? (
              <div className="brain__key">
                🔑 Clé enregistrée ({llm.keyHint})
                <button className="brain__link" onClick={() => setEditingKey(true)}>changer</button>
                <button className="brain__link" onClick={() => send({ type: 'llm.key', key: null })}>effacer</button>
              </div>
            ) : (
              <form
                className="brain__keyform"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!keyInput.trim()) return;
                  setSaving(true);
                  send({ type: 'llm.key', key: keyInput.trim() });
                  setKeyInput('');
                  setEditingKey(false);
                }}
              >
                <label>
                  Ta clé API (sk-ant-…)
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={keyInput}
                    placeholder="sk-ant-api03-…"
                    onChange={(e) => setKeyInput(e.target.value)}
                  />
                </label>
                <button type="submit" disabled={!connected || saving || !keyInput.trim()}>
                  {saving ? 'Vérification…' : 'Enregistrer'}
                </button>
                <span className="brain__small">
                  Elle reste sur ton PC (fichier <code>.env</code>, jamais commité). Pour en créer une : console.anthropic.com → API Keys.
                </span>
              </form>
            )}
            {feedback && feedback.text.includes('Clé') && <em className={feedback.payload.ok ? 'is-ok' : ''}>{feedback.text}</em>}
          </div>

          <div className={`brain__opt ${llm.provider === 'ollama' ? 'is-current' : ''} ${available.ollama ? '' : 'is-off'}`}>
            <strong>🖥 Ollama (modèle local)</strong>
            <span>
              Ollama est un logiciel gratuit qui fait tourner une IA open source (Llama, Mistral…) directement sur ton PC,
              sans internet ni clé. Moins malin que Claude et plus lent, surtout sans bonne carte graphique.
              Pour l’essayer : installe-le depuis ollama.com, puis lance <code>ollama pull llama3.1</code>.
            </span>
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

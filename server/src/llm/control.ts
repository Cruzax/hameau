import { KEYED_PROVIDERS, PROVIDERS, type ClientToServer, type LLMProviderName } from '@hameau/shared';
import type { Sim } from '../sim/Sim';
import type { LLMProvider } from './LLMProvider';
import { LLM_CONFIG, reloadEnv } from './config';
import { defaultModel, identifyKey, keyHint, storeKey, verifyKey } from './apiKey';
import { createProvider } from '.';

/**
 * Menu « cerveau des agents » : quels fournisseurs sont prêts, quelles clés sont enregistrées,
 * quels modèles proposer, et le changement de fournisseur en direct.
 */
export class LLMControl {
  constructor(
    private readonly sim: Sim,
    private readonly setProvider: (p: LLMProvider) => void,
  ) {}

  private get llm() {
    return this.sim.world.llm;
  }

  /** Recalcule ce qui est disponible (clés présentes, Ollama joignable) et le publie. */
  async refresh() {
    reloadEnv();
    const available: Partial<Record<LLMProviderName, boolean>> = { mock: true };
    const keyHints: Partial<Record<LLMProviderName, string>> = {};
    for (const p of KEYED_PROVIDERS) {
      const key = process.env[PROVIDERS[p].envKey!];
      available[p] = !!key;
      if (key) keyHints[p] = keyHint(key);
    }
    try {
      const res = await fetch(`${LLM_CONFIG.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(800) });
      const tags = res.ok ? ((await res.json()) as { models?: { name: string }[] }) : null;
      available.ollama = !!tags;
      if (tags) this.llm.models = { ...this.llm.models, ollama: (tags.models ?? []).map((m) => m.name) };
    } catch {
      available.ollama = false;
    }
    this.llm.available = available;
    this.llm.keyHints = keyHints;
    this.sim.touchLLM();
  }

  /** Au démarrage : récupère la liste des modèles des clés déjà enregistrées. */
  async warmUp() {
    await this.refresh();
    for (const p of KEYED_PROVIDERS) {
      const key = process.env[PROVIDERS[p].envKey!];
      if (!key) continue;
      const r = await verifyKey(p, key);
      if ('models' in r) this.llm.models = { ...this.llm.models, [p]: r.models };
    }
    this.sim.touchLLM();
  }

  /** Clé collée sur le site : on reconnaît le fournisseur, on vérifie, on enregistre. */
  async setKey(c: Extract<ClientToServer, { type: 'llm.key' }>) {
    const sim = this.sim;
    if (c.key === null) {
      const p = c.provider;
      if (!p || !PROVIDERS[p].envKey) return;
      storeKey(PROVIDERS[p].envKey!, null);
      sim.emit('llm.config', [], `🔑 Clé ${PROVIDERS[p].label} effacée.`, { ok: true, provider: p, key: true });
      if (this.llm.provider === p) await this.configure({ type: 'llm.config', provider: 'mock' });
      await this.refresh();
      return;
    }
    const found = await identifyKey(c.key);
    if ('error' in found) {
      sim.emit('llm.config', [], `⚠️ Clé non enregistrée — ${found.error}.`, { ok: false, key: true });
      sim.touchLLM();
      return;
    }
    const info = PROVIDERS[found.provider];
    storeKey(info.envKey!, c.key.trim());
    this.llm.models = { ...this.llm.models, [found.provider]: found.models };
    sim.emit('llm.config', [], `🔑 Clé ${info.label} reconnue, vérifiée et enregistrée. Tu peux l’activer.`, {
      ok: true, provider: found.provider, key: true,
    });
    await this.refresh();
  }

  /** Change le cerveau des agents sans redémarrer la simulation. */
  async configure(c: Extract<ClientToServer, { type: 'llm.config' }>) {
    const sim = this.sim;
    await this.refresh();
    const info = PROVIDERS[c.provider];
    if (!this.llm.available?.[c.provider]) {
      const why = c.provider === 'ollama' ? 'lance Ollama sur ce PC' : `ajoute une clé ${info.label} dans le menu`;
      sim.emit('llm.config', [], `⚠️ Impossible de passer sur ${info.label} : ${why}.`, { provider: c.provider, ok: false });
      return;
    }
    const known = this.llm.models?.[c.provider] ?? [];
    const model =
      c.provider === 'mock'
        ? undefined
        : c.model && (known.includes(c.model) || !known.length)
          ? c.model
          : c.provider === 'anthropic'
            ? LLM_CONFIG.anthropicModel
            : c.provider === 'ollama'
              ? // Le modèle par défaut s'il est installé, sinon le premier modèle présent sur ce PC.
                known.includes(LLM_CONFIG.ollamaModel) || !known.length ? LLM_CONFIG.ollamaModel : known[0]
              : defaultModel(c.provider, known);
    this.setProvider(createProvider(c.provider, model));
    this.llm.provider = c.provider;
    this.llm.model = model;
    const label = c.provider === 'mock' ? 'gratuit (réponses scriptées)' : `${info.label} · ${model}`;
    sim.emit('llm.config', [], `🧠 Cerveau des agents : ${label}.`, { provider: c.provider, model, ok: true });
    sim.touchLLM();
  }
}

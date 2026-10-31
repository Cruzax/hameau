import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { SERVER_PORT, type ClientToServer, type LLMProviderName, type ServerToClient } from '@hameau/shared';
import { LLM_CONFIG, reloadEnv } from './llm/config';
import { keyHint, storeKey, verifyKey } from './llm/apiKey';
import { createProvider } from './llm';
import { Sim } from './sim/Sim';
import { Journal } from './store/journal';
import { createLLMBrain } from './agents/llmBrain';

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const journal = new Journal(resolve(import.meta.dirname, `../../data/journal-${stamp}.jsonl`));

const clients = new Set<WebSocket>();
const broadcast = (msg: ServerToClient) => {
  const data = JSON.stringify(msg);
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(data);
};

const provider = createProvider();
const brain = createLLMBrain(provider);
const sim = new Sim(brain, journal, broadcast);
sim.world.voteEveryDays = Math.max(1, Number(process.env.VOTE_EVERY_DAYS ?? sim.world.voteEveryDays));
sim.world.llm = {
  provider: provider.name,
  model: modelOf(provider.name),
  budget: { maxCallsPerDay: LLM_CONFIG.maxCallsPerDay, callsToday: 0, maxTokens: LLM_CONFIG.maxTokens, tokensIn: 0, tokensOut: 0 },
};

/** Modèles Claude proposés dans le menu (du plus capable au moins cher). */
const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];

function modelOf(name: LLMProviderName, cfg = LLM_CONFIG) {
  return name === 'anthropic' ? cfg.anthropicModel : name === 'ollama' ? cfg.ollamaModel : undefined;
}

/** Ce qui est utilisable tout de suite : clé Claude dans .env, Ollama qui répond. */
async function availability(): Promise<Record<LLMProviderName, boolean>> {
  reloadEnv();
  let ollama = false;
  try {
    ollama = (await fetch(`${LLM_CONFIG.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(800) })).ok;
  } catch {
    ollama = false;
  }
  return { mock: true, anthropic: !!process.env.ANTHROPIC_API_KEY, ollama };
}

async function refreshAvailability() {
  sim.world.llm.available = await availability();
  sim.world.llm.keyHint = keyHint(process.env.ANTHROPIC_API_KEY);
  sim.touchLLM();
}

/** Formulaire « clé API » du site : vérifiée auprès d'Anthropic, puis écrite dans .env. */
async function setApiKey(key: string | null) {
  if (key === null) {
    storeKey(null);
    sim.emit('llm.config', [], '🔑 Clé API effacée.', { ok: true });
    if (sim.world.llm.provider === 'anthropic') sim.onLLMConfig?.({ type: 'llm.config', provider: 'mock' });
  } else {
    const clean = key.trim();
    const error = /^sk-ant-[\w-]{20,}$/.test(clean) ? await verifyKey(clean) : 'ça ne ressemble pas à une clé Anthropic (elle commence par sk-ant-)';
    if (error) {
      sim.emit('llm.config', [], `⚠️ Clé API non enregistrée : ${error}.`, { ok: false });
      sim.touchLLM();
      return;
    }
    storeKey(clean);
    sim.emit('llm.config', [], '🔑 Clé API vérifiée et enregistrée dans .env. Claude est disponible.', { ok: true });
  }
  await refreshAvailability();
}

// Menu « cerveau des agents » : on change de fournisseur sans redémarrer la simulation.
sim.onLLMConfig = async (c) => {
  const available = await availability();
  sim.world.llm.available = available;
  if (!available[c.provider]) {
    const why = c.provider === 'anthropic' ? 'ajoute ANTHROPIC_API_KEY dans le fichier .env puis relance' : 'lance Ollama sur ce PC';
    sim.emit('llm.config', [], `⚠️ Impossible de passer sur ${c.provider} : ${why}.`, { provider: c.provider, ok: false });
    sim.touchLLM();
    return;
  }
  const cfg = {
    ...LLM_CONFIG,
    provider: c.provider,
    anthropicModel: c.provider === 'anthropic' && c.model && CLAUDE_MODELS.includes(c.model) ? c.model : LLM_CONFIG.anthropicModel,
  };
  brain.setProvider(createProvider(cfg));
  sim.world.llm.provider = c.provider;
  sim.world.llm.model = modelOf(c.provider, cfg);
  const label = c.provider === 'mock' ? 'gratuit (réponses scriptées)' : `${c.provider} · ${sim.world.llm.model}`;
  sim.emit('llm.config', [], `🧠 Cerveau des agents : ${label}.`, { provider: c.provider, model: sim.world.llm.model, ok: true });
  sim.touchLLM();
};

// HTTP : export du journal (script des vidéos).
const http = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/journal.json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="hameau-journal-${stamp}.json"`);
    res.end(JSON.stringify(journal.events, null, 2));
    return;
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(`Hameau — jour ${sim.clock.day}, tick ${sim.clock.tick}. WebSocket sur ce port, journal sur /journal.json`);
});

const wss = new WebSocketServer({ server: http });
wss.on('connection', (ws, req) => {
  clients.add(ws);
  const hello: ServerToClient = { type: 'snapshot', world: sim.world, events: journal.events.slice(-200) };
  ws.send(JSON.stringify(hello));
  // La clé ne peut être envoyée que depuis ce PC, jamais depuis un autre appareil du réseau.
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
  ws.on('message', (raw) => {
    try {
      const cmd = JSON.parse(String(raw)) as ClientToServer;
      if (cmd.type === 'llm.key') {
        if (local) void setApiKey(cmd.key);
        return;
      }
      sim.command(cmd);
    } catch (e) {
      console.warn('Commande invalide', e);
    }
  });
  ws.on('close', () => clients.delete(ws));
});

http.listen(SERVER_PORT, () => {
  const model = provider.name === 'anthropic' ? ` (${LLM_CONFIG.anthropicModel})` : provider.name === 'ollama' ? ` (${LLM_CONFIG.ollamaModel})` : '';
  console.log(`🏡 Hameau — simulation sur http://localhost:${SERVER_PORT}`);
  console.log(`🧠 LLM : ${provider.name}${model} · max ${LLM_CONFIG.maxCallsPerDay} appels/jour · max_tokens ${LLM_CONFIG.maxTokens}`);
  if (provider.name === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️  ANTHROPIC_API_KEY absente de .env : les appels échoueront si aucun profil `ant auth login` n’est actif.');
  }
  void refreshAvailability();
  sim.start();
});

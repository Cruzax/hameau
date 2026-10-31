import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { SERVER_PORT, type ClientToServer, type ServerToClient } from '@hameau/shared';
import { LLM_CONFIG } from './llm/config';
import { LLMControl } from './llm/control';
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
  model: provider.name === 'anthropic' ? LLM_CONFIG.anthropicModel : provider.name === 'ollama' ? LLM_CONFIG.ollamaModel : undefined,
  budget: { maxCallsPerDay: LLM_CONFIG.maxCallsPerDay, callsToday: 0, maxTokens: LLM_CONFIG.maxTokens, tokensIn: 0, tokensOut: 0 },
};
const llmControl = new LLMControl(sim, (p) => brain.setProvider(p));
sim.onLLMConfig = (c) => void llmControl.configure(c);

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
        if (local) void llmControl.setKey(cmd);
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
  void llmControl.warmUp();
  sim.start();
});

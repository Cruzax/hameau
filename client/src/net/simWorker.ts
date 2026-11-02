/// <reference lib="webworker" />
import type { ClientToServer, ServerToClient } from '@hameau/shared';
import { createLLMBrain } from '../../../server/src/agents/llmBrain';
import { createProvider } from '../../../server/src/llm';
import { LLM_CONFIG } from '../../../server/src/llm/config';
import { Sim } from '../../../server/src/sim/Sim';
import { MemoryJournal } from '../../../server/src/store/memoryJournal';
import { readSave, writeSave } from './saveStore';

// La simulation tourne ici, dans un fil à part du navigateur : c'est le « serveur » du site en ligne.
// Elle parle à la page avec les mêmes messages que le serveur Node par WebSocket.

/** Demandes propres au navigateur, en plus du protocole habituel. */
export type WorkerRequest = ClientToServer | { type: 'journal.request' } | { type: 'snapshot.request' } | { type: 'save.request' };
export type WorkerReply =
  | ServerToClient
  | { type: 'journal'; events: MemoryJournal['events'] }
  /** La partie de la dernière visite a été reprise (sinon : village neuf). */
  | { type: 'save.status'; restored: boolean };

/** Sauvegarde régulière, en plus de celle faite quand on quitte l'onglet. */
const AUTOSAVE_MS = 60_000;

const post = (msg: WorkerReply) => self.postMessage(msg);

const journal = new MemoryJournal();
const provider = createProvider();
const sim = new Sim(createLLMBrain(provider), journal, post);
sim.world.llm = {
  provider: provider.name,
  budget: { maxCallsPerDay: LLM_CONFIG.maxCallsPerDay, callsToday: 0, maxTokens: LLM_CONFIG.maxTokens, tokensIn: 0, tokensOut: 0 },
};

let started = false;
const queued: WorkerRequest[] = [];

function handle(msg: WorkerRequest) {
  if (msg.type === 'journal.request') {
    post({ type: 'journal', events: journal.events });
    return;
  }
  if (msg.type === 'snapshot.request') {
    post({ type: 'snapshot', world: sim.world, events: journal.events.slice(-200) });
    return;
  }
  if (msg.type === 'save.request') {
    void writeSave(sim.save());
    return;
  }
  sim.command(msg);
}

// Les ordres reçus pendant qu'on relit la sauvegarde attendent la fin du chargement.
self.onmessage = (ev: MessageEvent<WorkerRequest>) => (started ? handle(ev.data) : queued.push(ev.data));

// Premier contact : on reprend la partie gardée s'il y en a une, puis l'instantané du monde et c'est parti.
void (async () => {
  const saved = await readSave();
  let restored = false;
  let morningDone = false;
  try {
    restored = !!saved && sim.load(saved);
  } catch (err) {
    console.warn('Sauvegarde illisible, nouveau village :', err);
    sim.reset('origine'); // repart d'un village propre (le matin est déjà lancé)
    morningDone = true;
  }
  post({ type: 'save.status', restored });
  post({ type: 'snapshot', world: sim.world, events: journal.events.slice(-200) });
  sim.start(restored || morningDone);
  started = true;
  for (const m of queued.splice(0)) handle(m);
  setInterval(() => void writeSave(sim.save()), AUTOSAVE_MS);
})();

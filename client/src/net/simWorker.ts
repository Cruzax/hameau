/// <reference lib="webworker" />
import type { ClientToServer, ServerToClient } from '@hameau/shared';
import { createLLMBrain } from '../../../server/src/agents/llmBrain';
import { createProvider } from '../../../server/src/llm';
import { LLM_CONFIG } from '../../../server/src/llm/config';
import { Sim } from '../../../server/src/sim/Sim';
import { MemoryJournal } from '../../../server/src/store/memoryJournal';

// La simulation tourne ici, dans un fil à part du navigateur : c'est le « serveur » du site en ligne.
// Elle parle à la page avec les mêmes messages que le serveur Node par WebSocket.

/** Demandes propres au navigateur, en plus du protocole habituel. */
export type WorkerRequest = ClientToServer | { type: 'journal.request' } | { type: 'snapshot.request' };
export type WorkerReply = ServerToClient | { type: 'journal'; events: MemoryJournal['events'] };

const post = (msg: WorkerReply) => self.postMessage(msg);

const journal = new MemoryJournal();
const provider = createProvider();
const sim = new Sim(createLLMBrain(provider), journal, post);
sim.world.llm = {
  provider: provider.name,
  budget: { maxCallsPerDay: LLM_CONFIG.maxCallsPerDay, callsToday: 0, maxTokens: LLM_CONFIG.maxTokens, tokensIn: 0, tokensOut: 0 },
};

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (msg.type === 'journal.request') {
    post({ type: 'journal', events: journal.events });
    return;
  }
  if (msg.type === 'snapshot.request') {
    post({ type: 'snapshot', world: sim.world, events: journal.events.slice(-200) });
    return;
  }
  sim.command(msg);
};

// Premier contact : l'instantané du monde, puis la simulation démarre.
post({ type: 'snapshot', world: sim.world, events: journal.events.slice(-200) });
sim.start();

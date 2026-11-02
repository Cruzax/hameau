import type { Agent, AgentId } from '@hameau/shared';
import type { Brain, Sim } from '../sim/Sim';
import { neighbors } from '../sim/network';
import type { LLMProvider, LLMRequest } from '../llm/LLMProvider';
import { DecisionSchema, SummarySchema, VoteSchema, toActions, voteActions } from './decision';
import { situationPrompt, summaryPrompt, systemPrompt, votePrompt, type Trigger } from './prompts';
import { CHATTER, createScript } from './scripted';
import { LLM_CONFIG } from '../llm/config';

/** Ticks entre la réponse du modèle et l'exécution (le temps d'enfiler son manteau). */
const ACT_DELAY = 2;
/** Probabilité de répondre à un simple bavardage (chaque réponse coûte un appel). */
const CHAT_REPLY_CHANCE = 0.4;
/** Appels LLM par habitant et par jour (le plafond ne descend jamais sous LLM_MAX_CALLS_PER_DAY). */

/**
 * Cerveau piloté par un LLMProvider. Un agent se « réveille » sur un déclencheur
 * (début de journée, message reçu, événement), le modèle décide, et les actions validées
 * sont rejouées dans la simulation. En mock, le provider renvoie la réponse scriptée.
 */
export function createLLMBrain(initial: LLMProvider, seed?: number): Brain & { setProvider(p: LLMProvider): void } {
  // Le fournisseur peut changer en cours de partie (menu « cerveau des agents »).
  let provider = initial;
  const script = createScript(seed);
  const busy = new Set<AgentId>();
  const queued = new Map<AgentId, Trigger[]>();
  let exhaustedDay = 0;

  /** Réserve un appel dans le budget du jour. false si le budget est épuisé. */
  function reserve(sim: Sim): boolean {
    const b = sim.world.llm.budget;
    // Le mode gratuit ne coûte rien : on compte les appels, sans plafond.
    if (provider.name === 'mock') {
      b.callsToday++;
      return true;
    }
    if (b.callsToday < b.maxCallsPerDay) {
      b.callsToday++;
      return true;
    }
    if (exhaustedDay !== sim.clock.day) {
      exhaustedDay = sim.clock.day;
      sim.emit('llm.budget_exhausted', [], `🧠 Budget LLM du jour épuisé (${b.maxCallsPerDay} appels) : le village se tait jusqu’à demain.`);
    }
    return false;
  }

  /** Seul le villageois choisi à la création pense avec l'IA ; les autres suivent le script (gratuit). */
  function usesAI(sim: Sim, agentId: AgentId) {
    return provider.name !== 'mock' && sim.world.aiAgentId === agentId;
  }

  async function call<T>(sim: Sim, agent: Agent, purpose: string, req: LLMRequest<T>): Promise<T | null> {
    const res = await provider.complete(req);
    const b = sim.world.llm.budget;
    b.tokensIn += res.tokensIn;
    b.tokensOut += res.tokensOut;
    sim.touchLLM();
    sim.emit('llm.call', [agent.id], `🧠 ${agent.name} · ${purpose} · ${res.tokensIn}→${res.tokensOut} tokens${res.error ? ` · ⚠️ ${res.error}` : ''}`, {
      provider: provider.name, purpose, tokensIn: res.tokensIn, tokensOut: res.tokensOut, error: res.error,
    });
    // Appel raté (modèle absent, JSON invalide…) : l'agent agit comme en mode gratuit plutôt que de rester muet.
    return res.data ?? req.scripted();
  }

  async function wake(sim: Sim, agentId: AgentId, trigger: Trigger) {
    if (busy.has(agentId)) {
      queued.set(agentId, [...(queued.get(agentId) ?? []), trigger]);
      return;
    }
    const agent = sim.agent(agentId);
    if (!agent) return;
    busy.add(agentId);
    sim.setActivity(agentId, 'thinking');
    try {
      const scripted = () => script.decide(sim.world, agent, trigger);
      // Budget épuisé : l'agent IA retombe sur le script plutôt que de se taire.
      const decision = usesAI(sim, agentId) && reserve(sim)
        ? await call(sim, agent, 'décision', {
          system: systemPrompt(agent, agent.id === sim.world.mayorId),
          prompt: situationPrompt(sim.world, agent, trigger),
          schema: DecisionSchema,
          scripted,
        })
        : (provider.name === 'mock' && reserve(sim), scripted()); // en gratuit, on compte quand même pour l'affichage
      const actions = decision ? toActions(sim.world, agent, decision) : [{ type: 'think' as const, text: '…' }];
      if (actions.length) sim.plan(agentId, ACT_DELAY, actions);
      else sim.setActivity(agentId, 'idle');
    } finally {
      busy.delete(agentId);
      const next = queued.get(agentId)?.shift();
      if (next) void wake(sim, agentId, next);
    }
  }

  return {
    setProvider(p) {
      provider = p;
    },

    onDayStart(sim) {
      script.newDay();
      // Un seul villageois pense avec l'IA : le plafond d'appels ne dépend plus de la population.
      sim.world.llm.budget.maxCallsPerDay = LLM_CONFIG.maxCallsPerDay;
      sim.touchLLM();
    },

    onMessage(sim, agent, msg) {
      if (msg.kind === 'chat' && script.rand() > CHAT_REPLY_CHANCE) return;
      void wake(sim, agent.id, { type: 'message', msg });
    },

    onNews(sim, headline) {
      // Nouveau numéro : le dossier repart de zéro, le sujet est tout trouvé.
      script.newDay();
      script.inject(headline);
      void wake(sim, sim.world.mayorId, { type: 'news', text: headline });
    },

    onInject(sim, text) {
      script.inject(text);
      const scout = Object.values(sim.world.agents).find((a) => a.role === 'ECLAIREUR');
      if (scout) void wake(sim, scout.id, { type: 'inject', text });
    },

    onVoteOpened(sim, vote) {
      // Chaque habitant remplit son bulletin. Sans budget, le bulletin scripté (gratuit) prend le relais :
      // un vote ne doit jamais être bloqué par le compteur.
      for (const agent of Object.values(sim.world.agents)) {
        const scripted = () => script.vote(sim.world, agent, vote);
        const delay = 3 + Math.floor(script.rand() * 30);
        if (!usesAI(sim, agent.id) || !reserve(sim)) {
          sim.plan(agent.id, delay, voteActions(sim.world, agent, scripted()));
          continue;
        }
        sim.setActivity(agent.id, 'voting');
        void call(sim, agent, 'vote', {
          system: systemPrompt(agent, agent.id === sim.world.mayorId),
          prompt: votePrompt(sim.world, agent, vote),
          schema: VoteSchema,
          scripted,
        }).then((v) => sim.plan(agent.id, 2, voteActions(sim.world, agent, v ?? scripted())));
      }
    },

    onDayEnd(sim) {
      if (provider.name === 'mock') {
        for (const s of script.moodSwings(sim.world)) sim.adjustOpinion(s.who, s.about, s.delta);
      }
      // Mémoire longue : résumé par le modèle s'il reste du budget, sinon registre scripté (gratuit).
      for (const agent of Object.values(sim.world.agents)) {
        if (!agent.memory.short.some((m) => m.day === sim.clock.day)) continue;
        const fallback = script.summarize(sim.world, agent);
        // Un jour sur deux seulement : le résumé par l'IA coûtait un quart des appels.
        if (!usesAI(sim, agent.id) || sim.clock.day % 2 === 1 || !reserve(sim)) {
          agent.memory.long = fallback;
          continue;
        }
        void call(sim, agent, 'mémoire', {
          system: systemPrompt(agent, agent.id === sim.world.mayorId),
          prompt: summaryPrompt(sim.world, agent),
          schema: SummarySchema,
          scripted: () => ({ summary: fallback }),
        }).then((s) => (agent.memory.long = s?.summary.slice(0, 600) ?? fallback));
      }
    },

    onTick(sim) {
      // Bavardage d'ambiance, gratuit (scripté, sans appel LLM) : rare, un seul à la fois.
      if (script.rand() > 0.012) return;
      if (Object.values(sim.world.messages).some((m) => m.kind === 'chat')) return;
      const idle = Object.values(sim.world.agents).filter((a) => a.activity === 'idle' && !busy.has(a.id));
      if (!idle.length) return;
      const a = script.pick(idle);
      const ns = neighbors(sim.world, a.id);
      if (!ns.length) return;
      sim.plan(a.id, 1, [{ type: 'send', to: script.pick(ns), kind: 'chat', body: script.pick(CHATTER[a.role] ?? ['Bonjour !']) }]);
    },
  };
}

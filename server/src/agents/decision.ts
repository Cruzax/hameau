import { z } from 'zod';
import type { Agent, MessageKind, WorldState } from '@hameau/shared';
import type { Action } from '../sim/Sim';

const KINDS = ['chat', 'task', 'topic', 'draft', 'edit', 'review', 'decision', 'campaign'] as const satisfies readonly MessageKind[];

/** Ce qu'un agent répond à chaque réveil. Imposé au modèle via les sorties structurées. */
export const DecisionSchema = z.object({
  thought: z.string().describe('Pensée intime très courte, visible des spectateurs (max 100 caractères).'),
  messages: z
    .array(
      z.object({
        to: z.string().describe('id de l’habitant destinataire'),
        kind: z.enum(KINDS),
        body: z.string().describe('Contenu du message, 1 à 3 phrases.'),
      }),
    )
    .describe('0 à 2 messages à envoyer.'),
  publish: z
    .object({ headline: z.string(), body: z.string() })
    .nullable()
    .describe('Réservé au maire : publier la gazette du jour. null sinon.'),
  opinions: z
    .array(
      z.object({
        about: z.string().describe('id de l’habitant'),
        delta: z.number().describe('Variation de ton opinion, entre -0.3 et +0.3'),
        reason: z.string().describe('Pourquoi, en quelques mots'),
      }),
    )
    .describe('Seulement si ce qui vient de se passer change ce que tu penses de quelqu’un. Souvent vide.'),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const VoteSchema = z.object({
  destitute: z.boolean().describe('true pour destituer le maire'),
  candidate: z.string().nullable().describe('Si destitution : id de l’habitant que tu veux comme maire (toi compris). null sinon.'),
  reason: z.string().describe('Ta raison, en une phrase (secrète)'),
  campaign: z
    .object({ to: z.string(), body: z.string() })
    .nullable()
    .describe('Facultatif : un message pour convaincre un voisin. null sinon.'),
});
export type VoteDecision = z.infer<typeof VoteSchema>;

export const SummarySchema = z.object({
  summary: z.string().describe('Résumé à la première personne, max 400 caractères.'),
});
export type Summary = z.infer<typeof SummarySchema>;

const MAX_MESSAGES = 2;
const MAX_OPINION_DELTA = 0.3;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s.trim());

/** Le modèle peut citer un habitant par son id ou par son prénom. */
export function resolveAgent(world: WorldState, ref: string | null | undefined) {
  const key = (ref ?? '').trim().toLowerCase();
  return Object.values(world.agents).find((a) => a.id === key || a.name.toLowerCase() === key)?.id;
}

/** Bulletin + éventuel message de campagne. Le candidat doit exister et ne pas être le maire visé. */
export function voteActions(world: WorldState, agent: Agent, v: VoteDecision): Action[] {
  const candidate = resolveAgent(world, v.candidate);
  const actions: Action[] = [
    {
      type: 'ballot',
      ballot: { destitute: v.destitute, candidateId: v.destitute && candidate !== world.mayorId ? candidate : undefined, reason: clip(v.reason, 200) },
    },
  ];
  const to = v.campaign && resolveAgent(world, v.campaign.to);
  if (v.campaign && to && to !== agent.id && v.campaign.body.trim()) {
    actions.push({ type: 'send', to, kind: 'campaign', body: clip(v.campaign.body, 280) });
  }
  return actions;
}

/**
 * Transforme une décision du modèle en actions sûres : destinataires existants, pas plus de
 * 2 messages, publication réservée au maire et une seule par jour. Le reste est ignoré.
 */
export function toActions(world: WorldState, agent: Agent, d: Decision): Action[] {
  const actions: Action[] = [];
  if (d.thought.trim()) actions.push({ type: 'think', text: clip(d.thought, 120) });

  // Un agent peut s'écrire à lui-même quand il cumule deux rôles (ex. maire et éclaireur).
  for (const m of d.messages.slice(0, MAX_MESSAGES)) {
    const to = resolveAgent(world, m.to);
    if (!to || !m.body.trim()) continue;
    actions.push({ type: 'send', to, kind: m.kind, body: clip(m.body, 280) });
  }

  for (const o of d.opinions.slice(0, 3)) {
    const about = resolveAgent(world, o.about);
    if (!about || about === agent.id || !Number.isFinite(o.delta)) continue;
    actions.push({ type: 'opinion', about, delta: Math.max(-MAX_OPINION_DELTA, Math.min(MAX_OPINION_DELTA, o.delta)), reason: clip(o.reason, 120) });
  }

  const alreadyPublished = world.gazettes.some((g) => g.day === world.clock.day);
  if (d.publish && agent.id === world.mayorId && !alreadyPublished && d.publish.headline.trim()) {
    actions.push({
      type: 'publish',
      gazette: {
        headline: clip(d.publish.headline, 90),
        articles: [{ title: clip(d.publish.headline, 90), body: clip(d.publish.body, 600) }],
      },
    });
  }
  return actions;
}

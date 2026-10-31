import { mulberry32, type Agent, type AgentId, type Role, type VoteSession, type WorldState } from '@hameau/shared';
import type { Decision, VoteDecision } from './decision';
import type { Trigger } from './prompts';
import { neighbors } from '../sim/graph';

// Réponses scriptées du mode mock : zéro appel LLM, comportement crédible pour tester la simulation.

const TOPICS = [
  'Le puits de la place fait un bruit étrange la nuit',
  'Une chèvre a été vue sur le toit de la mairie',
  'Le pont grince plus que d’habitude',
  'Des champignons géants poussent près de la rivière',
  'Quelqu’un a repeint le panneau d’affichage en rose',
  'Le four à pain est en panne depuis l’aube',
  'Une lettre anonyme critique le maire',
  'Les arbres ont roussi en une seule nuit',
];
const TASKS = ['Trouve-nous un sujet pour la gazette du jour !', 'Il me faut un sujet avant midi. Au travail !', 'La gazette n’attend pas : un sujet, vite.'];
const SCOUTING = ['Je file voir du côté de la rivière…', 'J’ai entendu des rumeurs près du puits !', 'Il se passe toujours quelque chose au pont.'];
const DRAFTS = [
  (t: string) => `${t}. Les habitants s’interrogent, et la rumeur enfle comme une marée d’automne.`,
  (t: string) => `${t}. Personne n’a rien vu, mais tout le monde a un avis.`,
  (t: string) => `${t}. Un mystère de plus pour notre paisible hameau.`,
];
const REVIEWS: [number, string][] = [
  [4, 'Enfin un sujet qui nous concerne. 4/5.'],
  [2, 'Trop lyrique, on n’y comprend rien. 2/5.'],
  [3, 'Correct, mais où sont les faits ? 3/5.'],
  [5, 'Je l’ai lu deux fois. 5/5 !'],
  [1, 'Du vent. 1/5.'],
];
const CAMPAIGN = ['Il est temps de changer de maire !', 'Ce maire ne nous écoute pas. Vote avec moi.', 'Une autre gazette est possible !'];
export const CHATTER: Partial<Record<Role, string[]>> = {
  MAIRE: ['Tout se passe comme prévu ?', 'N’oubliez pas qui tient ce village.'],
  ECLAIREUR: ['Tu as vu le ciel ce matin ?', 'J’ai une piste, je t’en dis plus bientôt !'],
  ECRIVAIN: ['Je cherche une rime à « rivière »…', 'L’éditeur va encore tout couper.'],
  EDITEUR: ['Trois fautes dans ta dernière lettre.', 'Sois bref.'],
  LECTEUR: ['On ne m’écoute jamais, de ce côté du pont.', 'La gazette d’hier était longue.'],
  CITOYEN: ['Ah, c’était mieux quand j’étais maire.', 'Tu as des nouvelles de la mairie ?'],
};

const decision = (d: Partial<Decision>): Decision => ({ thought: '', messages: [], publish: null, opinions: [], ...d });

export function createScript(seed = Date.now()) {
  const rand = mulberry32(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const injected: string[] = [];
  let day: { topic?: string; edited?: string; review?: number } = {};
  let lastTopic = '';

  const byRole = (w: WorldState, role: Role): AgentId | undefined => Object.values(w.agents).find((a) => a.role === role)?.id;

  return {
    rand,
    pick,
    newDay() {
      day = {};
    },
    inject(text: string) {
      injected.push(text);
    },

    /** Ce que ferait l'agent « par défaut » : la gazette suit son circuit, les humeurs suivent. */
    decide(w: WorldState, agent: Agent, trigger: Trigger): Decision {
      const isMayor = agent.id === w.mayorId;
      if (trigger.type === 'day') {
        const scout = byRole(w, 'ECLAIREUR');
        if (!isMayor || !scout) return decision({});
        return decision({ thought: 'Nouvelle journée. Il nous faut une gazette !', messages: [{ to: scout, kind: 'task', body: pick(TASKS) }] });
      }
      if (trigger.type === 'inject') {
        injected.push(trigger.text);
        return decision({ thought: 'Il faut que la gazette en parle !' });
      }
      const msg = trigger.msg;
      const from = msg.origin ?? msg.from;
      const writer = byRole(w, 'ECRIVAIN');
      const editor = byRole(w, 'EDITEUR');
      const reader = byRole(w, 'LECTEUR');

      if (agent.role === 'ECLAIREUR' && msg.kind === 'task' && writer) {
        day.topic = injected.shift() ?? pick(TOPICS.filter((t) => t !== lastTopic));
        lastTopic = day.topic;
        return decision({ thought: pick(SCOUTING), messages: [{ to: writer, kind: 'topic', body: `Sujet : ${day.topic} !` }] });
      }
      if (agent.role === 'ECRIVAIN' && msg.kind === 'topic' && editor) {
        const draft = pick(DRAFTS)(day.topic ?? msg.body.replace(/^Sujet : |\s*!$/g, ''));
        return decision({ thought: 'Laissez-moi trouver les mots justes…', messages: [{ to: editor, kind: 'draft', body: draft }] });
      }
      if (agent.role === 'EDITEUR' && msg.kind === 'draft') {
        day.edited = msg.body.split('.')[0] + '.';
        return decision({ thought: 'Trop long. Je coupe.', messages: [{ to: w.mayorId, kind: 'edit', body: day.edited }] });
      }
      if (isMayor && msg.kind === 'edit' && reader) {
        return decision({ messages: [{ to: reader, kind: 'task', body: `Ton avis avant publication ? « ${msg.body} »` }] });
      }
      if (agent.role === 'LECTEUR' && msg.kind === 'task') {
        const [score, text] = pick(REVIEWS);
        day.review = score;
        return decision({ messages: [{ to: w.mayorId, kind: 'review', body: text }] });
      }
      if (isMayor && msg.kind === 'review' && day.topic) {
        const harsh = (day.review ?? 3) <= 2;
        const ok = !harsh || rand() < 0.5;
        if (!ok) {
          return decision({
            thought: 'La critique est trop dure… je ne publie pas ça.',
            messages: writer ? [{ to: writer, kind: 'decision', body: 'Refusé. Pas de gazette aujourd’hui.' }] : [],
          });
        }
        return decision({
          thought: harsh ? 'Tant pis pour l’avis du lecteur, on publie.' : 'Bon pour publication. J’y appose mon sceau.',
          messages: [
            ...(writer ? [{ to: writer, kind: 'decision' as const, body: 'Publié ! Bravo pour l’article.' }] : []),
            ...(harsh && reader ? [{ to: reader, kind: 'decision' as const, body: 'J’ai publié quand même.' }] : []),
          ],
          publish: { headline: day.topic, body: day.edited ?? '' },
        });
      }
      if (msg.kind === 'decision') {
        if (/refus/i.test(msg.body)) return decision({ thought: 'Tout ce travail pour rien…', opinions: [{ about: from, delta: -0.25, reason: 'Mon article a été refusé' }] });
        if (/quand même/i.test(msg.body)) return decision({ thought: 'Pourquoi me demander mon avis, alors ?', opinions: [{ about: from, delta: -0.25, reason: 'Mon avis ne compte pas' }] });
        return decision({ opinions: [{ about: from, delta: 0.15, reason: 'Mon article est publié' }] });
      }
      if (msg.kind === 'campaign') {
        const trust = agent.opinions[from] ?? 0;
        return trust > 0
          ? decision({ thought: 'Ce n’est pas faux…', opinions: [{ about: w.mayorId, delta: -0.15, reason: 'La campagne m’a convaincu·e' }] })
          : decision({ thought: 'Propagande !' });
      }
      if (msg.kind === 'chat') {
        const reply = rand() < 0.5 ? [{ to: from, kind: 'chat' as const, body: pick(CHATTER[agent.role] ?? ['Hm.']) }] : [];
        return decision({ messages: reply, opinions: [{ about: from, delta: 0.05, reason: '' }] });
      }
      return decision({});
    },

    /** Bulletin scripté : on vote selon son opinion du maire ; les ambitieux votent pour eux-mêmes. */
    vote(w: WorldState, agent: Agent, vote: VoteSession): VoteDecision {
      const mayor = vote.targetMayorId;
      const ns = neighbors(w, agent.id);
      if (agent.id === mayor) {
        return { destitute: false, candidate: null, reason: 'Je reste.', campaign: ns.length ? { to: pick(ns), body: 'Restez fidèles, je compte sur vous.' } : null };
      }
      const destitute = (agent.opinions[mayor] ?? 0) < 0;
      const favourite = vote.candidates
        .filter((id) => id !== agent.id)
        .sort((a, b) => (agent.opinions[b] ?? 0) - (agent.opinions[a] ?? 0))[0];
      const candidate = agent.personality.ambition >= 0.6 ? agent.id : favourite;
      const targets = ns.filter((id) => id !== mayor);
      const campaign = agent.id === vote.proposerId && targets.length ? { to: pick(targets), body: pick(CAMPAIGN) } : null;
      return {
        destitute,
        candidate: destitute ? candidate ?? null : null,
        reason: destitute ? 'Le maire a perdu ma confiance.' : 'Le maire fait son travail.',
        campaign,
      };
    },

    /** Petites sautes d'humeur quotidiennes (mock uniquement) : de quoi faire bouger la politique. */
    moodSwings(w: WorldState) {
      const out: { who: AgentId; about: AgentId; delta: number }[] = [];
      for (const a of Object.values(w.agents)) for (const b of Object.keys(w.agents)) if (a.id !== b) out.push({ who: a.id, about: b, delta: (rand() - 0.5) * 0.16 });
      return out;
    },

    /** Mémoire longue sans LLM : un simple registre des interlocuteurs du jour. */
    summarize(w: WorldState, agent: Agent): string {
      const today = agent.memory.short.filter((m) => m.day === w.clock.day);
      const people = [...new Set(today.map((m) => w.agents[m.with]?.name).filter(Boolean))];
      const line = people.length ? `J${w.clock.day} : échangé avec ${people.join(', ')}.` : `J${w.clock.day} : journée calme.`;
      return [agent.memory.long, line].filter(Boolean).join(' ').slice(-600);
    },
  };
}

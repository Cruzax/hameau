import { mulberry32, type Agent, type AgentId, type Role, type VoteSession, type WorldState } from '@hameau/shared';
import type { Decision, VoteDecision } from './decision';
import type { Trigger } from './prompts';
import {
  DRAFT_ENDINGS, DRAFT_LEADS, DRAFT_MIDDLES, REVIEW_BETTER, REVIEW_ON_THEME, REVIEW_REACTIONS, REVIEW_SAME_THEME, REVIEW_WORSE,
  REVIEW_WRITER, TOPICS, themeOf, type Theme,
} from '../content/gazette';
import { takeNews } from '../content/news';
import { neighbors } from '../sim/network';
import { gazetteStaff } from '../sim/newsworthy';

// Réponses scriptées du mode mock : zéro appel LLM, comportement crédible pour tester la simulation.

const TASKS = ['Trouve-nous un sujet pour la gazette du jour !', 'Il me faut un sujet avant midi. Au travail !', 'La gazette n’attend pas : un sujet, vite.'];
const SCOUTING = ['Je file voir du côté de la rivière…', 'J’ai entendu des rumeurs près du puits !', 'Il se passe toujours quelque chose au pont.'];
const CAMPAIGN = ['Il est temps de changer de maire !', 'Ce maire ne nous écoute pas. Vote avec moi.', 'Une autre gazette est possible !'];
export const CHATTER: Partial<Record<Role, string[]>> = {
  MAIRE: ['Tout se passe comme prévu ?', 'N’oubliez pas qui tient ce village.'],
  ECLAIREUR: ['Tu as vu le ciel ce matin ?', 'J’ai une piste, je t’en dis plus bientôt !'],
  ECRIVAIN: ['Je cherche une rime à « rivière »…', 'L’éditeur va encore tout couper.'],
  EDITEUR: ['Trois fautes dans ta dernière lettre.', 'Sois bref.'],
  LECTEUR: ['On ne m’écoute jamais, de ce côté du pont.', 'La gazette d’hier était longue.'],
  CITOYEN: ['Belle journée pour couper du bois.', 'Tu as des nouvelles de la mairie ?'],
};

const decision = (d: Partial<Decision>): Decision => ({ thought: '', messages: [], publish: null, opinions: [], go: null, ...d });

export function createScript(seed = Date.now()) {
  const rand = mulberry32(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const injected: string[] = [];
  let day: { topic?: string; edited?: string; review?: number } = {};
  /** Sujets déjà traités : on ne publie pas deux fois la même nouvelle. */
  const usedTopics = new Set<string>();
  /** Tournures récemment employées : on évite de se répéter d'un numéro à l'autre. */
  const recent: string[] = [];
  const fresh = <T,>(xs: T[], key: (x: T) => string = String): T => {
    const left = xs.filter((x) => !recent.includes(key(x)));
    const chosen = pick(left.length ? left : xs);
    recent.push(key(chosen));
    if (recent.length > 24) recent.shift();
    return chosen;
  };
  /** Ce dont le lecteur se souvient des numéros précédents. */
  const readerLog: { theme: Theme; score: number }[] = [];
  const PLACES = ['la place', 'la rivière', 'la lisière de la forêt', 'le pont', 'le puits'];
  const freshNews = () => {
    for (let n = takeNews(); n; n = takeNews()) if (!usedTopics.has(n)) return n;
    return undefined;
  };


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
      const staff = gazetteStaff(w);
      if (trigger.type === 'day' || trigger.type === 'deadline') return decision({});
      if (trigger.type === 'news') {
        // Il s'est passé quelque chose : le maire lance la gazette.
        if (!isMayor) return decision({});
        return decision({ thought: 'Voilà qui mérite un numéro !', messages: [{ to: staff.ECLAIREUR, kind: 'task', body: pick(TASKS) }] });
      }
      if (trigger.type === 'inject') {
        injected.push(trigger.text);
        return decision({ thought: 'Il faut que la gazette en parle !' });
      }
      const msg = trigger.msg;
      const from = msg.origin ?? msg.from;
      // Dans un petit village, une même personne peut tenir plusieurs étapes.
      const writer = staff.ECRIVAIN;
      const editor = staff.EDITEUR;
      const reader = staff.LECTEUR;
      const asksReview = msg.kind === 'task' && /avis/i.test(msg.body);

      if (agent.id === reader && asksReview) return review();
      if (agent.id === staff.ECLAIREUR && msg.kind === 'task' && !asksReview) {
        // Priorité : un événement injecté, puis une vraie nouvelle du village, sinon un sujet de secours.
        const unused = TOPICS.filter((t) => !usedTopics.has(t));
        day.topic = injected.shift() ?? (rand() < 0.75 ? freshNews() : undefined) ?? pick(unused.length ? unused : TOPICS);
        usedTopics.add(day.topic);
        return decision({ thought: pick(SCOUTING), messages: [{ to: writer, kind: 'topic', body: `Sujet : ${day.topic} !` }] });
      }
      if (agent.id === writer && msg.kind === 'topic') {
        // Attaque + développement + chute, avec de vrais habitants ; le titre n'est pas recopié.
        const topic = day.topic ?? msg.body.replace(/^Sujet : |\s*!$/g, '');
        const names = Object.values(w.agents).filter((x) => x.id !== agent.id).map((x) => x.name);
        const witness = pick(names) ?? 'Un voisin';
        const ctx = { witness, other: pick(names.filter((n) => n !== witness)) ?? 'un voisin', place: pick(PLACES) };
        const lead = fresh(DRAFT_LEADS[themeOf(topic)], (f) => f(ctx).slice(0, 20))(ctx);
        const middle = fresh(DRAFT_MIDDLES, (f) => f(ctx).slice(-20))(ctx);
        const draft = [lead, middle, fresh(DRAFT_ENDINGS)].join(' ');
        return decision({ thought: 'Laissez-moi trouver les mots justes…', messages: [{ to: editor, kind: 'draft', body: draft }] });
      }
      if (agent.id === editor && msg.kind === 'draft') {
        // On resserre, parfois : la phrase du milieu saute une fois sur deux.
        // Coupe entre deux phrases, jamais au milieu d'une citation « … ».
        const parts = msg.body.split(/(?<=[.!?…]|[.!?…] »)\s+(?=[A-ZÀ-Ý«])/);
        day.edited = (parts.length > 2 && rand() < 0.5 ? [parts[0], ...parts.slice(2)] : parts).join(' ');
        return decision({ thought: 'Trop long. Je coupe.', messages: [{ to: w.mayorId, kind: 'edit', body: day.edited }] });
      }
      if (isMayor && msg.kind === 'edit') {
        return decision({ messages: [{ to: reader, kind: 'task', body: `Ton avis avant publication ? « ${msg.body} »` }] });
      }
      function review(): Decision {
        // La note dépend de l'humeur du lecteur, de la nouveauté du thème et de la longueur du texte.
        const theme = themeOf(day.topic ?? '');
        const last = readerLog.at(-1);
        const same = readerLog.slice(-2).filter((r) => r.theme === theme).length;
        const words = (day.edited ?? '').split(/\s+/).length;
        const mood = agent.needs?.humeur ?? 0.6;
        const score = Math.max(1, Math.min(5, Math.round(0.9 + mood * 2 + (words > 25 ? 0.5 : 0) - same * 0.8 + rand() * 2.8)));
        day.review = score;
        const good = score >= 4;
        const bits = [fresh(REVIEW_REACTIONS[score])];
        if (same >= 1 && !good) bits.push(fresh(REVIEW_SAME_THEME));
        else if (rand() < 0.7) bits.push(fresh(good || (score === 3 && rand() < 0.5) ? REVIEW_ON_THEME[theme].good : REVIEW_ON_THEME[theme].bad));
        if (last && score - last.score >= 2) bits.push(fresh(REVIEW_BETTER));
        else if (last && last.score - score >= 2) bits.push(fresh(REVIEW_WORSE));
        else if (writer && rand() < 0.35) bits.push(fresh(good ? REVIEW_WRITER.good : REVIEW_WRITER.bad, (f) => f(''))(w.agents[writer].name));
        readerLog.push({ theme, score });
        const text = `${bits.join(' ')} ${score}/5.`;
        return decision({ messages: [{ to: w.mayorId, kind: 'review', body: text }] });
      }
      if (isMayor && msg.kind === 'review' && day.topic) {
        const harsh = (day.review ?? 3) <= 2;
        // Une vraie nouvelle se publie toujours ; un avis sévère fâche seulement le lecteur.
        const ok = true;
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
          ? decision({ thought: 'Ce n’est pas faux…', opinions: [{ about: w.mayorId, delta: -0.15, reason: 'Cette campagne me parle' }] })
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

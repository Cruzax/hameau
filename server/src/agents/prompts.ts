import { formatHour, isNight, villageHour, ROLE_LABEL, type Agent, type Message, type Role, type VoteSession, type WorldState } from '@hameau/shared';
import { neighbors } from '../sim/graph';
import { peekNews } from '../content/news';

const DUTIES: Record<Role, string> = {
  MAIRE:
    'Tu coordonnes la gazette. Le matin, tu demandes un sujet à l’éclaireur. Quand l’éditeur te renvoie l’article corrigé, ' +
    'tu le transmets au lecteur pour avoir son avis. Après l’avis, tu tranches : publier (champ "publish", avec un titre ' +
    'et le texte final). Toi seul peux publier, une fois par jour. La gazette doit paraître CHAQUE jour avant 20 h, ' +
    'même imparfaite : un avis sévère se publie avec le reste, il ne bloque pas la parution.',
  ECLAIREUR: 'Quand on te le demande, tu trouves un sujet de gazette surprenant mais plausible pour un petit village, et tu l’envoies à l’écrivain.',
  ECRIVAIN: 'Quand tu reçois un sujet, tu écris aussitôt un court article vivant (2-3 phrases, en entier dans ton message) et tu l’envoies à l’éditeur.',
  EDITEUR: 'Quand tu reçois un brouillon, tu le corriges et le resserres, puis tu envoies la version finale (le texte complet) au maire.',
  LECTEUR: 'Quand le maire te soumet un article, tu le notes tel quel (avis franc + note sur 5) sans réclamer d’autre version.',
  BOULANGER: 'Chaque matin tu cuis le pain (il te faut du bois) et tu le vends aux habitants, une pièce le pain.',
  FORGERON: 'Tu fabriques des outils et tu répares les ponts et les routes abîmés par la crue ou l’orage.',
  HERBORISTE: 'Tu soignes les malades contre quelques pièces, et tu sais garder (ou monnayer) les secrets qu’on te confie.',
  CRIEUR: 'Tu vas sur la place annoncer les nouvelles à tout le village d’un coup : tu es le seul à pouvoir parler à tous.',
  AUBERGISTE: 'Tu tiens l’auberge : le soir, les habitants viennent boire et bavarder. Tu entends toutes les rumeurs.',
  GARDE: 'Tu enquêtes sur les vols et les mensonges, et tu peux accuser quelqu’un devant le village.',
  BARDE: 'Chaque soir à l’auberge, tu chantes ce qui s’est passé au village, à ta façon.',
  VOLEUR: 'En apparence un simple vagabond. En secret, tu voles du pain et des pièces la nuit. Ne te fais jamais démasquer.',
  CITOYEN: 'Tu n’as plus de rôle dans la gazette. Tu vis ta vie, tu discutes, tu as des opinions.',
  MENTEUR: 'Tu mens volontiers et déformes ce que tu relaies, pour semer le trouble sans te faire prendre.',
};

const KIND_LABEL: Record<Message['kind'], string> = {
  chat: 'discussion', task: 'demande', topic: 'sujet', draft: 'brouillon', edit: 'version corrigée',
  review: 'avis', decision: 'décision', campaign: 'message de campagne', ballot: 'bulletin',
};

/** Prompt système : stable pour un agent tant qu'il ne change pas de fonction (cache du provider). */
export function systemPrompt(agent: Agent, isMayor: boolean): string {
  const p = agent.personality;
  return [
    `Tu es ${agent.name}, ${ROLE_LABEL[agent.role].toLowerCase()} d’un hameau de quelques habitants.`,
    '',
    'RÈGLE DU MONDE : on ne communique qu’en envoyant un messager à pied le long des routes. Un message vers ' +
      'quelqu’un qui n’est pas ton voisin direct est relayé par d’autres habitants : c’est lent, et les relais le lisent. ' +
      'Si aucune route ne mène au destinataire, le message est perdu.',
    'MISSION COMMUNE : produire chaque jour la gazette du village. C’est un petit journal plein d’anecdotes et de ' +
      'rumeurs : on raconte, on ne prouve pas ; inutile de réclamer des chiffres ou des preuves, et personne ne bloque la parution.',
    `TON RÔLE : ${DUTIES[agent.role]}`,
    isMayor && agent.role !== 'MAIRE' ? `TU ES AUSSI LE MAIRE ÉLU : ${DUTIES.MAIRE}` : '',
    'POLITIQUE : tous les quelques jours, un habitant mécontent peut demander la destitution du maire. Chacun envoie ' +
      'alors un bulletin secret, porté par messager jusqu’à la maison du maire ; il faut la majorité absolue du village.',
    '',
    `PERSONNALITÉ : ${p.traits.join(', ')}. Ta façon de parler : ${p.tone}. ` +
      `Honnêteté ${Math.round(p.honesty * 10)}/10, ambition ${Math.round(p.ambition * 10)}/10.`,
    `TES OBJECTIFS : ${agent.goals.join(' ; ')}.`,
    '',
    'CONSIGNES : réponds en français, dans ton style. Messages courts (200 caractères max). ' +
      'N’envoie un message que s’il sert à quelque chose ; ne réponds pas aux politesses. ' +
      '"thought" est une pensée intime très courte que les spectateurs verront. ' +
      'Dans "to" et "about", utilise l’id de l’habitant.',
  ]
    .filter((l, i, xs) => l !== '' || xs[i - 1] !== '')
    .join('\n');
}

export type Trigger =
  | { type: 'day' }
  | { type: 'message'; msg: Message }
  | { type: 'inject'; text: string }
  | { type: 'deadline' };

function villageTime(w: WorldState) {
  const h = villageHour(w.clock.tick, w.clock.ticksPerDay);
  return `${formatHour(h).replace(':', 'h')}${isNight(w.clock) ? ' (la nuit)' : ''}`;
}

const signed = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(2);

const level = (x: number, words: [string, string, string]) => (x < 0.3 ? words[0] : x < 0.65 ? words[1] : words[2]);

function stateLine(w: WorldState, agent: Agent): string {
  const n = agent.needs;
  const inv = agent.inventory;
  if (!n || !inv) return '';
  const where =
    agent.location?.kind === 'at'
      ? agent.location.place === 'place'
        ? 'sur la place'
        : `chez ${w.agents[w.houses[agent.location.place]?.ownerId ?? '']?.name ?? 'quelqu’un'}`
      : agent.location?.kind === 'walking'
        ? 'en chemin'
        : 'chez toi';
  return (
    `Ton état : ${level(n.satiete, ['affamé·e', 'un peu faim', 'rassasié·e'])}, ${level(n.energie, ['épuisé·e', 'fatigué·e', 'en forme'])}, ` +
    `moral ${level(n.humeur, ['au plus bas', 'moyen', 'bon'])}${n.sante < 0.5 ? ', malade' : ''}. ` +
    `Tu as ${inv.pain} pain(s), ${inv.bois} bûche(s), ${inv.outils} outil(s), ${inv.pieces} pièce(s). Tu es ${where}.`
  );
}

function rumorLine(w: WorldState, agent: Agent): string {
  // Seulement les rumeurs des deux derniers jours : sinon la même revient sans fin.
  const heard = (w.rumors ?? []).filter((r) => r.knownBy.includes(agent.id) && w.clock.day - r.day <= 1).slice(-3);
  return heard.length ? `Ce que tu as entendu dire : ${heard.map((r) => `« ${r.text} »`).join(' ; ')}.` : '';
}

/** Pour l'éclaireur et le maire : ce qui s'est vraiment passé, et ce qui est déjà paru. */
function newsroomLine(w: WorldState, agent: Agent): string {
  if (agent.role !== 'ECLAIREUR' && agent.role !== 'ECRIVAIN' && agent.id !== w.mayorId) return '';
  const facts = peekNews(5);
  const past = w.gazettes.slice(-5).map((g) => `« ${g.headline} »`);
  return [
    facts.length ? `FAITS RÉCENTS AU VILLAGE (sujets de gazette tout trouvés) : ${facts.map((f) => `« ${f} »`).join(' ; ')}.` : '',
    past.length ? `DÉJÀ PARUS (ne pas les reprendre, ni leurs thèmes) : ${past.join(' ; ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Les seuls endroits où l'on peut aller (aucun autre lieu n'existe). */
function placesLine(): string {
  return 'LIEUX RÉELS où tu peux aller (champ "go") : la place (place), la forêt (foret), la rivière (riviere), ou chez un habitant (son id). Aucun autre lieu n’existe.';
}

/** Le dossier de la gazette, visible de ceux qui la fabriquent. */
function dossierLine(w: WorldState, agent: Agent): string {
  const d = w.gazetteDraft;
  const makers: Role[] = ['MAIRE', 'ECLAIREUR', 'ECRIVAIN', 'EDITEUR', 'LECTEUR'];
  if (!d || d.day !== w.clock.day || (!makers.includes(agent.role) && agent.id !== w.mayorId)) return '';
  if (w.gazettes.some((g) => g.day === w.clock.day)) return '';
  const name = (id?: string) => (id ? w.agents[id]?.name ?? '?' : '?');
  const parts = [
    d.topic ? `sujet (${name(d.topicBy)}) : « ${d.topic} »` : 'pas encore de sujet',
    d.draft ? `brouillon (${name(d.draftBy)}) : « ${d.draft} »` : '',
    d.edited ? `version corrigée (${name(d.editedBy)}) : « ${d.edited} »` : '',
    d.review ? `avis (${name(d.review.by)}, ${d.review.score}/5) : « ${d.review.text} »` : '',
  ].filter(Boolean);
  return `Dossier de la gazette du jour — ${parts.join(' ; ')}.`;
}

function familyLine(w: WorldState, agent: Agent): string {
  const f = agent.family;
  if (!f) return '';
  const names = (ids: string[]) => ids.map((id) => w.agents[id]?.name).filter(Boolean).join(', ');
  const parts = [
    f.partnerId && w.agents[f.partnerId] ? `en couple avec ${w.agents[f.partnerId].name}` : '',
    f.parentIds.length ? `enfant de ${names(f.parentIds)}` : '',
    f.childIds.length ? `parent de ${names(f.childIds)}` : '',
  ].filter(Boolean);
  return parts.length ? `Ta famille : ${parts.join(' ; ')}.` : '';
}

/** Contexte commun : qui est où, ce que l'agent sait et pense. */
function context(w: WorldState, agent: Agent, skipText?: string): string[] {
  const name = (id: string) => w.agents[id]?.name ?? id;
  const near = neighbors(w, agent.id);
  const far = Object.keys(w.agents).filter((id) => id !== agent.id && !near.includes(id));
  const who = (id: string) => `${name(id)} (id: ${id}, ${ROLE_LABEL[w.agents[id].role].toLowerCase()})`;
  const today = w.gazettes.find((g) => g.day === w.clock.day);
  // Seulement les opinions marquées, pour garder le contexte court.
  const opinions = Object.entries(agent.opinions)
    .filter(([id, x]) => w.agents[id] && Math.abs(x) >= 0.1)
    .map(([id, x]) => `${name(id)} ${signed(x)}`);

  // Le message qui réveille l'agent est déjà en mémoire courte : on ne le répète pas.
  const short = agent.memory.short.filter((m) => !(skipText && m.direction === 'in' && m.text === skipText)).slice(-8);
  const memory = short.map((m) => `- [J${m.day}] ${m.direction === 'in' ? 'reçu de' : 'envoyé à'} ${name(m.with)} : « ${m.text} »`);

  return [
    `Jour ${w.clock.day}, ${villageTime(w)}. Maire actuel : ${name(w.mayorId)}${w.mayorId === agent.id ? ' (toi)' : ''}.`,
    `Tes voisins directs (par une route) : ${near.length ? near.map(who).join(', ') : 'personne, tu es isolé·e'}.`,
    far.length ? `Joignables seulement par relais : ${far.map(who).join(', ')}.` : '',
    today ? `Gazette du jour : déjà publiée (« ${today.headline} »).` : 'Gazette du jour : pas encore publiée.',
    opinions.length ? `Ce que tu penses des autres (de -1 à +1) : ${opinions.join(', ')}.` : '',
    familyLine(w, agent),
    dossierLine(w, agent),
    newsroomLine(w, agent),
    placesLine(),
    stateLine(w, agent),
    rumorLine(w, agent),
    agent.memory.long ? `Ta mémoire des jours passés : ${agent.memory.long}` : '',
    memory.length ? `Tes derniers échanges :\n${memory.join('\n')}` : '',
  ];
}

/** Prompt de situation : ce que l'agent sait au moment où il se réveille. */
export function situationPrompt(w: WorldState, agent: Agent, trigger: Trigger): string {
  const name = (id: string) => w.agents[id]?.name ?? id;
  let now: string;
  if (trigger.type === 'day') now = 'Une nouvelle journée commence.';
  else if (trigger.type === 'deadline')
    now = `Il est ${villageTime(w)} et la gazette du jour n’est toujours pas parue. Si le dossier contient un texte, publie-le MAINTENANT (champ "publish"), même imparfait ; sinon relance ton équipe pour qu’elle te l’envoie vite.`;
  else if (trigger.type === 'inject') now = `Un événement imprévu secoue le village : ${trigger.text}`;
  else {
    const m = trigger.msg;
    const origin = m.origin ?? m.from;
    const via = origin !== m.from ? ` (relayé par ${name(m.from)})` : '';
    now = `Tu viens de recevoir un message de ${name(origin)}${via} — ${KIND_LABEL[m.kind]} : « ${m.body} »`;
  }
  const skip = trigger.type === 'message' ? trigger.msg.body : undefined;
  return [...context(w, agent, skip), '', `MAINTENANT : ${now}`, 'Que fais-tu ?'].filter(Boolean).join('\n');
}

export function votePrompt(w: WorldState, agent: Agent, vote: VoteSession): string {
  const name = (id: string) => w.agents[id]?.name ?? id;
  const target = vote.targetMayorId === agent.id ? 'toi' : name(vote.targetMayorId);
  return [
    ...context(w, agent),
    '',
    `MAINTENANT : ${vote.proposerId === agent.id ? 'TU as toi-même lancé cette motion pour demander' : `${name(vote.proposerId)} demande`} la destitution du maire (${target}). Le conseil vote aujourd’hui.`,
    vote.proposerId === agent.id ? 'Sauf si tu as vraiment changé d’avis, vote pour la destitution (destitute: true).' : '',
    `Candidats possibles : ${vote.candidates.map((id) => `${name(id)} (id: ${id})`).join(', ')}.`,
    'Remplis ton bulletin secret. Tu peux aussi envoyer un message de campagne à un habitant.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function summaryPrompt(w: WorldState, agent: Agent): string {
  const name = (id: string) => w.agents[id]?.name ?? id;
  const lines = agent.memory.short.map((m) => `- ${m.direction === 'in' ? 'reçu de' : 'envoyé à'} ${name(m.with)} : « ${m.text} »`);
  return [
    `Fin du jour ${w.clock.day}. Ancienne mémoire : ${agent.memory.long || '(vide)'}`,
    `Échanges récents :\n${lines.join('\n')}`,
    'Mets à jour ta mémoire : ce qui compte, ce que tu penses des autres, ce que tu retiens. Garde l’essentiel de l’ancienne.',
  ].join('\n');
}

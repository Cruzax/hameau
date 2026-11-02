import type { SimEvent, WorldState } from '@hameau/shared';

// Tout ce qui entoure la une : les brèves, la météo et le mot du maire. Calculé à la parution,
// à partir du journal depuis le numéro précédent, pour qu'on puisse lire ce qui s'est passé en son absence.

/** Ce qui mérite une brève. */
const BRIEF_TYPES = new Set<SimEvent['type']>([
  'agent.born', 'couple.formed', 'couple.split', 'agent.added', 'agent.left', 'workplace.opened', 'workplace.closed',
  'crime.theft', 'trial.verdict', 'treasure.found', 'village.event', 'house.destroyed', 'house.rebuilt', 'god.gift', 'mayor.elected', 'party', 'repair.done',
]);
const MAX_BRIEFS = 7;

/** Le texte d'un événement, sans son emoji de tête : pour l'insérer dans une phrase. */
export const plain = (text: string) => text.replace(/^[^\p{L}«]+/u, '').trim();

/** Les brèves : les autres nouvelles depuis le numéro précédent, la plus récente d'abord. */
export function briefsSince(events: SimEvent[], headlineSeq?: number): string[] {
  const seen = new Set<string>();
  const briefs: string[] = [];
  const hires = events.filter((e) => e.type === 'job.changed' && (e.payload as { hired?: boolean }).hired).length;
  const losses = events.filter((e) => e.type === 'job.changed' && (e.payload as { lost?: boolean }).lost).length;
  for (const e of [...events].reverse()) {
    if (!BRIEF_TYPES.has(e.type) || e.seq === headlineSeq || seen.has(e.text)) continue;
    seen.add(e.text);
    briefs.push(e.text);
    if (briefs.length >= MAX_BRIEFS) break;
  }
  if (hires || losses) {
    const parts = [hires && `${hires} embauche${hires > 1 ? 's' : ''}`, losses && `${losses} renvoi${losses > 1 ? 's' : ''}`].filter(Boolean);
    briefs.push(`🧰 Côté travail : ${parts.join(' et ')} depuis le dernier numéro.`);
  }
  return briefs;
}

const WEATHER_LABEL: Record<string, string> = {
  storm: 'orage', flood: 'crue de la rivière', tornado: 'tornade', well: 'lueur dorée au puits',
};
const FAIR = ['☀️ Grand soleil sur le hameau.', '🌤 Temps doux, ciel dégagé.', '☁️ Ciel gris, mais pas une goutte.', '🌬 Un peu de vent, rien de méchant.'];

/** La météo depuis le dernier numéro. */
export function weatherSince(events: SimEvent[]): string {
  const kinds = events
    .filter((e) => e.type === 'world.effect' && (e.payload as { phase?: string }).phase === 'start')
    .map((e) => (e.payload as { effect?: { kind?: string } }).effect?.kind ?? '');
  const labels = [...new Set(kinds)].map((k) => WEATHER_LABEL[k]).filter(Boolean);
  if (!labels.length) return FAIR[events.length % FAIR.length];
  const icon = { orage: '⛈', 'crue de la rivière': '🌊', tornade: '🌪', 'lueur dorée au puits': '✨' }[labels[0]] ?? '🌦';
  const text = labels.join(', puis ');
  return `${icon} ${text[0].toUpperCase()}${text.slice(1)}.`;
}

/** Le mot du maire, selon ce qui préoccupe le village. */
export function mayorWord(events: SimEvent[], w: WorldState): string | undefined {
  const mayor = w.agents[w.mayorId];
  if (!mayor) return undefined;
  const has = (type: SimEvent['type']) => events.some((e) => e.type === type);
  const hungry = events.some((e) => /meurt de faim/.test(e.text));
  const pool = has('house.destroyed')
    ? ['On rebâtira, pierre par pierre. Ensemble.', 'Merci à ceux qui ouvrent leur porte aux sinistrés.']
    : hungry
      ? ['Que personne n’ait faim : partagez votre pain.', 'La boulangerie tourne à plein, tenez bon.']
      : has('crime.theft')
        ? ['Fermez vos portes la nuit : le garde veille.', 'Un voleur rôde. Ouvrez l’œil, mais n’accusez pas à tort.']
        : has('treasure.found')
          ? ['La chance sourit à qui se lève tôt.', 'Un trésor ? Pensez quand même à payer vos impôts.']
          : has('agent.born') || has('couple.formed')
            ? ['Le village grandit, et c’est une joie.', 'Longue vie aux nouveaux foyers !']
            : ['Le hameau se porte bien. Continuons comme ça.', 'Ma porte est ouverte à tous, le matin.', 'Pensez à saluer vos voisins, ça ne coûte rien.'];
  return `${pool[events.length % pool.length]} — ${mayor.name}`;
}

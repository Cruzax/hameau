import { de, type Agent } from '@hameau/shared';
import type { Sim } from '../sim/Sim';
import { createRumor } from '../sim/rumors';

// Petits événements du quotidien, tirés au hasard chaque jour. Chacun a un effet réel
// (humeur, argent, nourriture, relations) et alimente la gazette et les chansons.
// Pour en ajouter un : une entrée de plus dans EVENTS.

export const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const dayName = (day: number) => DAY_NAMES[(day - 1) % 7];

export interface VillageEvent {
  id: string;
  weight: number;
  /** Heure à laquelle il se produit (sinon tirée entre 8 h et 20 h). */
  hour?: number;
  when?: (sim: Sim) => boolean;
  /** Applique l'événement ; renvoie le texte affiché, ou null s'il n'a pas pu avoir lieu. */
  run: (sim: Sim, h: Helpers) => string | null;
}

export interface Helpers {
  pick: <T>(xs: T[]) => T;
  someone: (filter?: (a: Agent) => boolean) => Agent | undefined;
  mood: (a: Agent, delta: number) => void;
  moodAll: (delta: number) => void;
  gather: (hour: number, until: number) => void;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function helpers(sim: Sim): Helpers {
  const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
  const mood = (a: Agent, d: number) => a.needs && (a.needs.humeur = clamp01(a.needs.humeur + d));
  return {
    pick,
    someone: (f) => {
      const xs = Object.values(sim.world.agents).filter((a) => !f || f(a));
      return xs.length ? pick(xs) : undefined;
    },
    mood,
    moodAll: (d) => Object.values(sim.world.agents).forEach((a) => mood(a, d)),
    gather: (from, to) => sim.daily.gather(sim, 'fete', from, to),
  };
}

const inv = (a: Agent) => (a.inventory ??= { pain: 0, bois: 0, outils: 0, pieces: 0 });

export const EVENTS: VillageEvent[] = [
  {
    id: 'renard', weight: 3,
    run: (_sim, h) => {
      const a = h.someone();
      if (!a) return null;
      h.mood(a, -0.2);
      return `🦊 Un renard a dévasté le poulailler ${de(a.name)}. Plus un œuf !`;
    },
  },
  {
    id: 'colporteur', weight: 3,
    run: (_sim, h) => {
      const a = h.someone((x) => inv(x).pieces >= 3);
      if (!a) return null;
      inv(a).pieces -= 2;
      h.mood(a, 0.2);
      const item = h.pick(['un miroir porte-bonheur', 'un chapeau à plume', 'une fiole d’élixir douteux', 'une carte au trésor (sûrement fausse)', 'un ruban de soie', 'une boîte à musique']);
      return `🧳 Un colporteur traverse le hameau. ${a.name} lui achète ${item}.`;
    },
  },
  {
    id: 'brouillard', weight: 2, hour: 7,
    run: (_sim, h) => {
      h.moodAll(-0.04);
      return '🌫 Un brouillard épais enveloppe le hameau ; on n’y voit pas à trois pas.';
    },
  },
  {
    id: 'etoile', weight: 2, hour: 23,
    run: (_sim, h) => {
      const a = h.someone((x) => !x.asleep) ?? h.someone();
      if (!a) return null;
      h.mood(a, 0.25);
      const wish = h.pick(['trouver l’amour', 'devenir maire', 'ne plus jamais avoir faim', 'que la rivière se calme', 'retrouver un vieil ami']);
      return `🌠 Une étoile filante ! ${a.name} fait le vœu de ${wish}.`;
    },
  },
  {
    id: 'loup', weight: 2,
    run: (sim, h) => {
      h.moodAll(-0.08);
      sim.daily.forestClosedUntil = sim.clock.tick + Math.round(sim.clock.ticksPerDay / 2);
      return '🐺 Des hurlements de loup résonnent dans la forêt. Personne n’ose y aller.';
    },
  },
  {
    id: 'tartes', weight: 2, hour: 15,
    run: (sim, h) => {
      const baker = Object.values(sim.world.agents).find((a) => a.role === 'BOULANGER');
      const winner = Math.random() < 0.5 && baker ? baker : h.someone();
      if (!winner) return null;
      h.gather(15, 17);
      for (const a of Object.values(sim.world.agents)) if (a.id !== winner.id) sim.adjustOpinion(a.id, winner.id, 0.05);
      h.mood(winner, 0.3);
      const pie = h.pick(['aux pommes', 'à la rhubarbe', 'aux myrtilles', 'au potiron', 'aux noix']);
      return `🥧 Concours de tartes sur la place : ${winner.name} l’emporte avec sa tarte ${pie} !`;
    },
  },
  {
    id: 'puits-sec', weight: 1,
    run: (_sim, h) => {
      h.moodAll(-0.05);
      return '🪣 Le puits de la place est à sec ce matin. Les seaux reviennent vides.';
    },
  },
  {
    id: 'bourse', weight: 2,
    run: (sim, h) => {
      const a = h.someone();
      if (!a) return null;
      inv(a).pieces += 3;
      h.mood(a, 0.15);
      createRumor(sim, a.id, 'riche', a.id, true);
      return `💰 ${a.name} trouve une bourse oubliée sur le chemin : trois pièces !`;
    },
  },
  {
    id: 'chat', weight: 2,
    run: (sim, h) => {
      const owner = h.someone();
      const finder = h.someone((x) => x.id !== owner?.id);
      if (!owner || !finder) return null;
      sim.adjustOpinion(owner.id, finder.id, 0.25, 'Merci d’avoir retrouvé mon chat');
      return `🐈 Le chat ${de(owner.name)} avait disparu… ${finder.name} le retrouve perché dans un arbre.`;
    },
  },
  {
    id: 'pommier', weight: 2,
    run: (_sim, h) => {
      const a = h.someone();
      if (!a) return null;
      inv(a).pain += 2;
      return `🍎 Le pommier ${de(a.name)} croule sous les fruits. De quoi tenir quelques jours.`;
    },
  },
  {
    id: 'cloture', weight: 3,
    run: (sim, h) => {
      const a = h.someone();
      const b = h.someone((x) => x.id !== a?.id);
      if (!a || !b) return null;
      const why = h.pick(['une histoire de clôture', 'des poules qui ont franchi la haie', 'un tas de bois mal rangé', 'une dette jamais remboursée', 'une chanson moqueuse']);
      sim.adjustOpinion(a.id, b.id, -0.2, why);
      sim.adjustOpinion(b.id, a.id, -0.2, why);
      return `💢 ${a.name} et ${b.name} se fâchent pour ${why}.`;
    },
  },
  {
    id: 'cadeau', weight: 3,
    run: (sim, h) => {
      const a = h.someone();
      if (!a) return null;
      const fav = Object.entries(a.opinions).sort((x, y) => y[1] - x[1])[0]?.[0];
      const b = fav && sim.agent(fav);
      if (!b) return null;
      sim.adjustOpinion(b.id, a.id, 0.2, 'Un si joli cadeau');
      const gift = h.pick(['un bouquet de fleurs des champs', 'une écharpe tricotée', 'un pot de miel', 'un caillou en forme de cœur', 'une flûte taillée dans du saule']);
      return `🎁 ${a.name} offre ${gift} à ${b.name}.`;
    },
  },
  {
    id: 'prophetie', weight: 1,
    when: (sim) => Object.values(sim.world.agents).some((a) => a.role === 'HERBORISTE'),
    run: (sim, h) => {
      const seer = Object.values(sim.world.agents).find((a) => a.role === 'HERBORISTE')!;
      const target = h.someone((x) => x.id !== seer.id);
      if (!target) return null;
      createRumor(sim, seer.id, h.pick(['amoureux', 'malade', 'riche']), target.id, false, h.someone((x) => x.id !== target.id)?.id);
      const omen = h.pick(['un grand changement', 'une rencontre inattendue', 'une perte cruelle', 'une fortune soudaine']);
      return `🔮 ${seer.name} lit les feuilles de thé et prédit à ${target.name} ${omen}.`;
    },
  },
  {
    id: 'chevre', weight: 2,
    run: (_sim, h) => {
      const a = h.someone();
      if (!a) return null;
      h.moodAll(0.03);
      const where = h.pick(['sur le toit de la mairie', 'dans l’auberge', 'au milieu de la fontaine', 'sur le pont']);
      return `🐐 La chèvre ${de(a.name)} s’est échappée et broute ${where}. Fou rire général.`;
    },
  },
  {
    id: 'cheminee', weight: 1,
    run: (sim, h) => {
      const a = h.someone((x) => x.role !== 'FORGERON');
      const smith = Object.values(sim.world.agents).find((x) => x.role === 'FORGERON');
      if (!a) return null;
      h.mood(a, -0.15);
      if (smith) {
        sim.adjustOpinion(a.id, smith.id, 0.2, 'Merci d’avoir sauvé ma maison');
        sim.daily.trip(sim, smith, a.houseId, 'reparer', 1);
        return `🔥 Feu de cheminée chez ${a.name} ! ${smith.name} accourt avec des seaux.`;
      }
      return `🔥 Feu de cheminée chez ${a.name} ! Tout le monde fait la chaîne.`;
    },
  },
  {
    id: 'duel-poesie', weight: 1, hour: 20,
    when: (sim) => ['BARDE', 'ECRIVAIN'].every((r) => Object.values(sim.world.agents).some((a) => a.role === r)),
    run: (sim, h) => {
      const bard = Object.values(sim.world.agents).find((a) => a.role === 'BARDE')!;
      const writer = Object.values(sim.world.agents).find((a) => a.role === 'ECRIVAIN')!;
      const [winner, loser] = Math.random() < 0.5 ? [bard, writer] : [writer, bard];
      sim.adjustOpinion(loser.id, winner.id, -0.15, 'Défaite au duel de poésie');
      h.mood(winner, 0.2);
      return `✒️ Duel de poésie à l’auberge entre ${bard.name} et ${writer.name}. ${winner.name} triomphe sous les applaudissements.`;
    },
  },
  {
    id: 'arc-en-ciel', weight: 3,
    when: (sim) => sim.journal.events.some((e) => e.type === 'world.effect' && e.day === sim.clock.day && (e.payload as { phase?: string }).phase === 'end'),
    run: (_sim, h) => {
      h.moodAll(0.1);
      return '🌈 Un arc-en-ciel se dessine au-dessus du hameau.';
    },
  },
  {
    id: 'lettre', weight: 1,
    run: (sim, h) => {
      const author = h.someone((x) => x.id !== sim.world.mayorId);
      if (!author) return null;
      createRumor(sim, author.id, 'tricheur', sim.world.mayorId, false);
      for (const a of Object.values(sim.world.agents)) if (a.id !== sim.world.mayorId) sim.adjustOpinion(a.id, sim.world.mayorId, -0.08);
      return `✉️ Une lettre anonyme clouée sur la porte de la mairie accuse ${sim.agent(sim.world.mayorId)?.name} de tricher.`;
    },
  },
  {
    id: 'musique', weight: 2, hour: 19,
    run: (_sim, h) => {
      const a = h.someone();
      if (!a) return null;
      h.moodAll(0.04);
      const inst = h.pick(['du violon', 'de la flûte', 'de l’accordéon', 'du tambourin']);
      return `🎻 ${a.name} joue ${inst} à sa fenêtre ; tout le quartier fredonne.`;
    },
  },
  {
    id: 'potager', weight: 2,
    run: (_sim, h) => {
      const a = h.someone();
      if (!a) return null;
      const veg = h.pick(['un potiron énorme', 'des carottes biscornues', 'un chou géant', 'des radis tout ronds']);
      h.mood(a, 0.1);
      return `🥕 ${a.name} récolte ${veg} dans son potager, et s’en vante à tout le monde.`;
    },
  },
];

/** Événements du calendrier : marché le mercredi, pique-nique le dimanche. */
export const CALENDAR: Record<string, { hour: number; until: number; text: string; mood: number }> = {
  mercredi: { hour: 10, until: 12, text: '🧺 Jour de marché ! Les étals s’installent sur la place.', mood: 0.08 },
  dimanche: { hour: 12, until: 14, text: '🧺 Pique-nique du dimanche sur la place : on partage le pain et les ragots.', mood: 0.12 },
};

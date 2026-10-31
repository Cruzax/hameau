import type { Agent, Role } from '@hameau/shared';

// Répliques écrites à la main, choisies selon le métier, l'humeur et la situation.
// Pour enrichir le village : ajouter des lignes ici, aucune autre modification n'est nécessaire.

export interface TalkContext {
  speaker: Agent;
  listener: Agent;
  /** Estime mutuelle (min des deux opinions), de -1 à +1. */
  mutual: number;
  night: boolean;
  storm: boolean;
  flood: boolean;
  place: string;
  dayName: string;
  mayorName: string;
  /** Ce que celui qui parle pense du maire. */
  mayorOpinion: number;
}

/** Une réplique et, parfois, la réponse de l'autre. */
export interface Exchange {
  line: string;
  reply?: string;
  /** Effet sur l'estime mutuelle. */
  bond: number;
}

const BY_ROLE: Partial<Record<Role, string[]>> = {
  MAIRE: [
    'Le village tient debout grâce à moi, ne l’oublie pas.',
    'Tu as lu la gazette ce matin ?',
    'J’ai de grands projets pour la place.',
    'Les impôts, c’est pour ton bien, tu sais.',
    'Un maire ne dort jamais vraiment.',
    'Je compte sur ton vote au prochain conseil.',
    'Cette écharpe pèse plus lourd qu’on ne croit.',
  ],
  ECLAIREUR: [
    'J’ai vu un truc fou près de la rivière !',
    'Il se passe toujours quelque chose, il suffit de regarder.',
    'Tu savais que le vieux chêne a une cavité secrète ?',
    'Je suis monté au sommet de la colline ce matin, quelle vue !',
    'J’ai suivi des traces de sabots jusqu’à la forêt.',
    'Un jour, j’irai voir ce qu’il y a après les collines.',
  ],
  ECRIVAIN: [
    'Je cherche l’article du siècle.',
    'Les mots me fuient aujourd’hui.',
    'Tu ferais un personnage magnifique, tu sais.',
    'L’éditeur a encore massacré ma plus belle phrase.',
    'J’écris un roman. Enfin, j’y pense très fort.',
    'La lumière du soir sur la rivière… il faut que je l’écrive.',
  ],
  EDITEUR: ['Trop long.', 'Sois bref.', 'Il y a une faute dans ta phrase, je l’entends.', 'Les virgules, c’est sérieux.', 'Je relis tout. Deux fois.'],
  LECTEUR: [
    'On ne m’écoute jamais, de ce côté du pont.',
    'La gazette d’hier ? Bof.',
    'J’aimerais lire un article sur les vrais gens d’ici.',
    'Un jour, j’écrirai mes propres critiques au crieur.',
    'Je lis tout. Même les recettes.',
  ],
  BOULANGER: [
    'Le four a chanté ce matin !',
    'Encore des miettes chez moi, c’est louche.',
    'Une miche bien dorée, c’est le bonheur.',
    'Sans bois, pas de pain. Dis-le aux bûcherons !',
    'Je me lève avant le soleil, moi.',
    'Goûte, c’est une nouvelle recette au miel.',
    'Le pain d’hier se garde mieux qu’on ne croit.',
  ],
  FORGERON: ['Ça tient. Ça tiendra.', 'Le pont a besoin d’un coup de marteau.', 'Le fer ne ment pas.', 'Apporte-moi du bois et je te fais une merveille.', 'J’ai les bras qui chauffent.', 'Un bon outil, c’est pour la vie.'],
  HERBORISTE: [
    'Bois une tisane, tu as mauvaise mine.',
    'Je sais des choses, tu sais.',
    'La camomille cueillie à l’aube soigne les colères.',
    'Ton teint me dit que tu dors mal.',
    'Les plantes parlent, il suffit d’écouter.',
    'Il me manque de la sauge. Tu en as vu ?',
  ],
  CRIEUR: ['Tu connais la dernière ?', 'OYEZ ! Enfin… entre nous.', 'J’ai la voix qui s’éraille à force de crier.', 'Demain, j’annonce un truc énorme.', 'Rien ne m’échappe, et tout le monde le saura.'],
  AUBERGISTE: [
    'Une chope, comme d’habitude ?',
    'On m’en raconte de belles, ici.',
    'Mon ragoût du soir, tu m’en diras des nouvelles.',
    'Les murs de l’auberge ont des oreilles. Les miennes.',
    'Ce soir, la tournée est pour… non, je plaisante.',
    'Tu as une ardoise, je te rappelle.',
  ],
  GARDE: ['Où étais-tu cette nuit ?', 'Rien ne m’échappe.', 'Circule.', 'Les règles sont les règles.', 'J’ai l’œil sur toi.', 'Le voleur finira par faire une erreur.'],
  BARDE: [
    'J’ai une rime pour toi : « hameau, rameau, chameau ».',
    'Ta vie mérite une chanson.',
    'La la la… pardon, je compose.',
    'Il me manque un refrain pour ce soir.',
    'Tu as une tête de ballade tragique.',
    'Je vais chanter tes exploits. Enfin, ceux que j’inventerai.',
  ],
  VOLEUR: ['Belle soirée, n’est-ce pas ?', 'Moi ? Je ne fais que passer.', 'Tu as une bien jolie bourse.', 'Je dors le jour, je rêve la nuit.', 'Les portes fermées, ça n’existe pas vraiment.'],
  MENTEUR: ['Je te jure que c’est vrai.', 'Tu ne devineras jamais ce que j’ai vu.', 'Entre nous, je ne fais confiance à personne d’autre que toi.'],
  CITOYEN: ['Belle journée, non ?', 'La vie est simple ici, et c’est bien.', 'Tu as des nouvelles de la mairie ?', 'J’ai coupé du bois toute la matinée.'],
};

/** Répliques selon la situation, quel que soit le métier. */
const SITUATIONS: { when: (c: TalkContext) => boolean; lines: string[] }[] = [
  { when: (c) => c.storm, lines: ['Quel temps de chien !', 'Rentre vite, l’orage gronde.', 'J’ai perdu mon chapeau dans la bourrasque.', 'Le tonnerre a fait trembler mes casseroles.'] },
  { when: (c) => c.flood, lines: ['La rivière a tout emporté !', 'Le pont est sous l’eau, on est coupés du monde.', 'Mes bottes sont pleines d’eau.'] },
  { when: (c) => c.night, lines: ['Tu ne dors pas, toi non plus ?', 'La lune est belle ce soir.', 'Chut, tout le monde dort.'] },
  { when: (c) => (c.speaker.needs?.satiete ?? 1) < 0.3, lines: ['J’ai un trou dans l’estomac.', 'Tu n’aurais pas un bout de pain ?', 'Je mangerais une botte de foin.'] },
  { when: (c) => (c.speaker.needs?.energie ?? 1) < 0.3, lines: ['Je tombe de sommeil.', 'Je pourrais dormir debout.', 'Ne m’en veux pas si je bâille.'] },
  { when: (c) => (c.speaker.needs?.humeur ?? 1) < 0.3, lines: ['Rien ne va en ce moment.', 'Laisse-moi tranquille, s’il te plaît.', 'J’ai le cœur gros.'] },
  { when: (c) => (c.speaker.needs?.sante ?? 1) < 0.5, lines: ['Atchoum ! Pardon.', 'Je suis tout patraque.', 'Ne t’approche pas, je suis malade.'] },
  { when: (c) => (c.speaker.inventory?.pieces ?? 0) === 0, lines: ['Je n’ai plus un sou.', 'Tu me prêterais une pièce ?', 'La vie est chère au hameau.'] },
  { when: (c) => (c.speaker.inventory?.pieces ?? 0) > 20, lines: ['Les affaires marchent bien, je ne me plains pas.', 'Tu veux que je t’offre une chope ?'] },
  { when: (c) => c.dayName === 'dimanche', lines: ['Ah, le dimanche… rien à faire, quel bonheur.', 'On pique-nique sur la place, tu viens ?'] },
  { when: (c) => c.dayName === 'mercredi', lines: ['Tu vas au marché ?', 'Il paraît qu’un colporteur passe aujourd’hui.'] },
  { when: (c) => c.place === 'la place', lines: ['La fontaine chante, aujourd’hui.', 'On se croirait un jour de fête.'] },
  { when: (c) => c.place === 'l’auberge', lines: ['À ta santé !', 'Encore une, et je rentre.', 'Ce ragoût est divin.'] },
  { when: (c) => c.mayorOpinion < -0.2, lines: ['Ce maire nous mène droit dans le mur.', 'Au prochain conseil, je vote contre.', 'On paie l’impôt pour quoi, au juste ?'] },
  { when: (c) => c.mayorOpinion > 0.4, lines: ['On a un bon maire, quand même.', 'Le maire fait ce qu’il peut.'] },
];

/** Échanges complets selon la relation. */
const FRIENDLY: [string, string][] = [
  ['Content de te voir !', 'Moi aussi, ça faisait longtemps.'],
  ['Tu veux qu’on se promène vers la rivière ?', 'Avec plaisir.'],
  ['Merci pour l’autre jour.', 'Entre voisins, c’est normal.'],
  ['Tu as l’air en forme aujourd’hui.', 'C’est grâce à toi, peut-être.'],
  ['Je t’ai gardé une part de tarte.', 'Tu es un trésor.'],
  ['On fait la paire, tous les deux.', 'Comme le pain et le beurre.'],
];
const FLIRT: [string, string][] = [
  ['Tes yeux brillent plus que la lune.', 'Arrête, tu me fais rougir.'],
  ['Je pense souvent à toi, tu sais.', 'Moi aussi… plus que je ne le devrais.'],
  ['Viendras-tu danser à la prochaine fête ?', 'Seulement si c’est avec toi.'],
  ['Je t’ai cueilli une fleur près du moulin.', 'Elle est magnifique.'],
];
const HOSTILE: [string, string][] = [
  ['Toi, je ne te parle pas.', 'Ça tombe bien.'],
  ['Je sais ce que tu as dit sur moi.', 'Je n’ai dit que la vérité.'],
  ['Tu as encore quelque chose à me reprocher ?', 'La liste est longue.'],
  ['Écarte-toi de mon chemin.', 'Le chemin est à tout le monde.'],
  ['Un jour, tu paieras.', 'Essaie donc.'],
];
const COLD: [string, string][] = [
  ['Bonjour.', 'Hm.'],
  ['Il fait beau.', 'Si tu le dis.'],
  ['Tu vas bien ?', 'On fait aller.'],
];

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Ce qu'un habitant dit à un autre, en tenant compte de tout le contexte. */
export function chooseExchange(c: TalkContext): Exchange {
  if (c.mutual < -0.4) {
    const [line, reply] = pick(HOSTILE);
    return { line, reply, bond: -0.05 };
  }
  const partners = c.speaker.family?.partnerId === c.listener.id;
  if ((partners || c.mutual > 0.55) && Math.random() < 0.5) {
    const [line, reply] = pick(c.mutual > 0.6 || partners ? FLIRT : FRIENDLY);
    return { line, reply, bond: 0.05 };
  }
  const situational = SITUATIONS.filter((s) => s.when(c) && s.lines.length);
  if (situational.length && Math.random() < 0.55) return { line: pick(pick(situational).lines), bond: 0.02 };
  if (c.mutual < 0) {
    const [line, reply] = pick(COLD);
    return { line, reply, bond: 0 };
  }
  if (c.mutual > 0.3 && Math.random() < 0.4) {
    const [line, reply] = pick(FRIENDLY);
    return { line, reply, bond: 0.04 };
  }
  return { line: pick(BY_ROLE[c.speaker.role] ?? BY_ROLE.CITOYEN!), bond: 0.03 };
}

/** Pensées qui traversent la tête d'un habitant seul (bulles en pointillés). */
export const MUSINGS: Partial<Record<Role, string[]>> = {
  MAIRE: ['Et si je faisais construire une statue ?', 'Il me faut un discours pour dimanche.'],
  BOULANGER: ['Demain, j’essaie une brioche.', 'Il me faut plus de bois…'],
  FORGERON: ['Le marteau est mon seul ami.', 'Un jour, je forgerai une cloche pour la place.'],
  HERBORISTE: ['La pleine lune approche, bon moment pour cueillir.', 'Qui viendra frapper à ma porte aujourd’hui ?'],
  CRIEUR: ['Quelle nouvelle annoncerai-je demain ?'],
  AUBERGISTE: ['Il me faut des chopes neuves.', 'Qui va payer son ardoise ce soir ?'],
  GARDE: ['Quelqu’un ment dans ce village.', 'Je sens que le voleur est proche.'],
  BARDE: ['Il me faut une rime en « -ette ».', 'Ce village est une épopée.'],
  VOLEUR: ['Ce soir, peut-être…', 'Personne ne se doute de rien.'],
  ECLAIREUR: ['Et si je partais explorer les collines ?'],
  ECRIVAIN: ['Le titre, tout est dans le titre.'],
  EDITEUR: ['Moins, c’est mieux.'],
  LECTEUR: ['Pourquoi le pont est-il si loin ?'],
};

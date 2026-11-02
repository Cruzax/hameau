import { attracted, type Agent, type Role } from '@hameau/shared';

// Répliques écrites à la main, choisies selon le métier, l'humeur, la relation et la vraie situation de chacun.
// Ton familier, phrases courtes, comme on se parle entre voisins. Règle d'écriture : rien qui change selon
// le sexe de qui parle ou de qui écoute (pas de « je suis content », « t'es crevé »…).
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
  /** Où travaille celui qui parle (« la ferme »…), s'il travaille. */
  job?: string;
  /** Où travaille celui qui écoute. */
  listenerJob?: string;
  /** Adulte sans emploi. */
  jobless?: boolean;
  /** Titre de la dernière gazette (récente). */
  headline?: string;
  /** Prénom du ou de la partenaire de celui qui parle. */
  partner?: string;
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
    'Le village tient debout, et c’est pas grâce au hasard.',
    'T’as lu la gazette ? On parle encore de moi.',
    'J’ai des grands projets pour la place, tu verras.',
    'Les impôts, c’est pour ton bien, promis.',
    'Un maire, ça dort jamais vraiment.',
    'Je compte sur toi au prochain conseil, hein.',
    'Cette écharpe, elle pèse plus lourd qu’on croit.',
    'Si t’as un souci, ma porte est ouverte. Enfin, le mardi.',
    'On me critique, mais personne veut ma place, bizarrement.',
    'Faudrait un deuxième pont, non ? Je réfléchis.',
    'Un sourire, voilà, c’est pour la gazette.',
    'Le village grandit vite, faut suivre !',
  ],
  ECLAIREUR: [
    'J’ai vu un truc de dingue près de la rivière !',
    'Il se passe toujours un truc, faut juste ouvrir l’œil.',
    'Tu savais que le vieux chêne est creux ? Secret, hein.',
    'J’ai grimpé la colline ce matin, la vue, j’te raconte pas.',
    'Des traces de sabots jusqu’à la forêt. Louche.',
    'Un jour, je file voir ce qu’il y a derrière les collines.',
    'T’as rien remarqué de bizarre, toi, ces jours-ci ?',
    'J’ai un scoop. Enfin, presque.',
    'Ça bouge du côté du moulin, je le sens.',
    'J’ai pas fermé l’œil, j’étais sur une piste.',
    'Tu me promets de pas répéter ? …Bon, je te dirai plus tard.',
  ],
  ECRIVAIN: [
    'Je cherche l’article du siècle, rien que ça.',
    'Les mots me fuient, aujourd’hui.',
    'Tu ferais un super personnage, tu sais.',
    'L’éditeur a encore massacré ma plus belle phrase.',
    'J’écris un roman. Enfin, j’y pense très fort.',
    'La lumière du soir sur la rivière… faut que je l’écrive.',
    'Un bon titre, c’est la moitié du boulot.',
    'Raconte-moi un truc, n’importe quoi, j’ai besoin d’inspiration.',
    'J’ai rayé trois pages ce matin. C’est bon signe, je crois.',
    'Mon encre gèle presque, la nuit, tu sais ?',
    'Ce village, c’est un feuilleton à lui tout seul.',
  ],
  EDITEUR: [
    'Trop long.',
    'Sois bref.',
    'Y a une faute dans ta phrase, je l’entends.',
    'Les virgules, c’est sérieux.',
    'Je relis tout. Deux fois.',
    'Moins d’adjectifs, plus de faits.',
    'Trois mots suffisent. Deux, c’est mieux.',
    'J’ai coupé la moitié de l’article. La meilleure moitié.',
    'Les points d’exclamation, on se calme.',
    'Une phrase, une idée. C’est pas compliqué.',
  ],
  LECTEUR: [
    'On m’écoute jamais, de ce côté du pont.',
    'La gazette d’hier ? Bof.',
    'J’aimerais lire un truc sur les vrais gens d’ici.',
    'Un jour, j’écrirai mes critiques sur la place.',
    'Je lis tout. Même les recettes.',
    'Trois fautes dans le dernier numéro. Trois.',
    'Le titre promettait, l’article beaucoup moins.',
    'Franchement, je lis la gazette pour les potins.',
    'Si on me demandait mon avis… ah, on me le demande, en fait.',
    'J’ai noté le numéro de la semaine. Sévèrement.',
  ],
  BOULANGER: [
    'Le four a chanté, ce matin !',
    'Encore des miettes partout, c’est louche.',
    'Une miche bien dorée, y a rien de mieux.',
    'Sans bois, pas de pain, faut le dire à la scierie !',
    'Debout avant le soleil, comme toujours.',
    'Goûte, c’est une nouvelle recette au miel.',
    'Le pain d’hier, ça se garde mieux qu’on croit.',
    'J’ai de la farine jusque dans les oreilles.',
    'Garde-moi une place à la fête, j’apporte les brioches.',
    'Le secret ? Du temps. Et un peu de sel.',
  ],
  FORGERON: [
    'Ça tient. Ça tiendra.',
    'Le pont a besoin d’un coup de marteau.',
    'Le fer, ça ment pas.',
    'Ramène du bois, je te fais une merveille.',
    'J’ai les bras en feu.',
    'Un bon outil, c’est pour la vie.',
    'Écoute-moi ce son… c’est du bel ouvrage, ça.',
    'Tape fort, tape juste, c’est tout le métier.',
    'J’ai cassé un manche ce matin. Le troisième.',
    'Si ça grince, tu me l’amènes.',
  ],
  HERBORISTE: [
    'Bois une tisane, t’as une petite mine.',
    'Je sais des choses, tu sais.',
    'La camomille de l’aube, ça calme les colères.',
    'Ton teint me dit que tu dors mal.',
    'Les plantes parlent, faut juste écouter.',
    'Il me manque de la sauge, t’en as vu ?',
    'Une infusion de thym, et demain ça ira.',
    'Reviens me voir si ça passe pas.',
    'Y a une racine près de la rivière qui fait des miracles.',
    'Je te ferai un prix, pour une fois.',
  ],
  CRIEUR: [
    'Tu connais la dernière ?',
    'OYEZ ! Enfin… entre nous.',
    'J’ai la voix qui déraille à force de crier.',
    'Demain, j’annonce un truc énorme.',
    'Rien ne m’échappe, et tout le monde le saura.',
    'Approche, approche, j’en ai une bonne !',
    'Si c’est pas dans ma bouche, c’est pas une nouvelle.',
    'J’ai annoncé trois fois la même chose, personne a écouté.',
    'Un jour, on m’entendra jusqu’aux collines.',
    'Chut… celle-là, je la garde pour la place.',
  ],
  AUBERGISTE: [
    'Une chope, comme d’hab ?',
    'On m’en raconte de belles, ici.',
    'Mon ragoût du soir, tu m’en diras des nouvelles.',
    'Les murs de l’auberge ont des oreilles. Les miennes.',
    'Ce soir, la tournée est pour… non, je rigole.',
    'T’as une ardoise, je te rappelle.',
    'Assieds-toi, raconte, j’ai tout mon temps.',
    'Hier soir, y avait un monde fou.',
    'J’ai un tonneau qui fuit, faudrait un coup de main.',
    'Le dernier qui part éteint les bougies !',
  ],
  GARDE: [
    'T’étais où, cette nuit ?',
    'Rien ne m’échappe.',
    'Circule.',
    'Les règles, c’est les règles.',
    'J’ai l’œil sur toi.',
    'Le voleur finira par faire une erreur.',
    'Si tu vois un truc louche, tu viens me voir.',
    'J’ai fait trois rondes, j’ai mal aux pieds.',
    'Ferme bien ta porte, ce soir.',
    'Je pose des questions, c’est mon boulot.',
  ],
  BARDE: [
    'J’ai une rime pour toi : « hameau, rameau, chameau ».',
    'Ta vie mériterait une chanson.',
    'La la la… pardon, je compose.',
    'Il me manque un refrain pour ce soir.',
    'T’as une tête de ballade tragique.',
    'Je vais chanter tes exploits. Ceux que j’inventerai, surtout.',
    'Tu fredonnes ? Non ? Dommage.',
    'Une chope, une corde, une chanson, et la nuit est sauvée.',
    'J’ai une nouvelle chanson, elle parle du maire. Chut.',
    'Le luth est désaccordé, comme moi.',
  ],
  VOLEUR: [
    'Belle soirée, hein ?',
    'Moi ? Je fais que passer.',
    'T’as une bien jolie bourse.',
    'Je dors le jour, je rêve la nuit.',
    'Les portes fermées, ça existe pas vraiment.',
    'Tu laisses ta fenêtre ouverte, la nuit ? Pour savoir.',
    'J’ai rien vu, rien entendu, rien pris.',
    'Les riches dorment mal, il paraît.',
    'Je cherche du travail. Enfin, si on veut.',
    'Ça coûte rien de demander, si ?',
  ],
  MENTEUR: [
    'Je te jure que c’est vrai.',
    'Tu devineras jamais ce que j’ai vu.',
    'Entre nous, je fais confiance qu’à toi.',
    'On m’a dit des trucs sur toi… mais je les crois pas, hein.',
    'Si je te le dis, c’est que c’est vrai.',
    'Le maire ? Il cache des choses, j’en mettrais ma main au feu.',
    'J’étais là quand c’est arrivé. Enfin, presque.',
    'Tout le monde le sait, voyons.',
    'Je dis ça, je dis rien.',
    'Garde-le pour toi, surtout.',
  ],
  CITOYEN: [
    'Belle journée, non ?',
    'La vie est simple, ici, et c’est très bien.',
    'T’as des nouvelles de la mairie ?',
    'Quelle journée, j’en peux plus.',
    'On se fait une soupe un de ces soirs ?',
    'Le pain était bon, ce matin.',
    'Il paraît que le moulin tourne à plein.',
    'Faudrait qu’on répare la clôture, un de ces jours.',
    'T’as vu le ciel ? Ça va tourner.',
    'Allez, à plus !',
    'Rien de neuf. Et c’est tant mieux.',
  ],
};

/** Ce qu'un habitant dit selon ce qui lui arrive vraiment (métier, gazette, couple, argent, temps qu'il fait…). */
const SITUATIONS: { when: (c: TalkContext) => boolean; lines: (c: TalkContext) => string[] }[] = [
  {
    when: (c) => !!c.job,
    lines: (c) => [
      `Grosse journée à ${c.job}, j’en peux plus.`,
      `À ${c.job}, on n’arrête pas en ce moment.`,
      `Le patron de ${c.job} m’a encore à l’œil.`,
      `Si tu cherches du boulot, ils embauchent peut-être à ${c.job}.`,
      `Je rentre de ${c.job}, j’ai les mains en compote.`,
      `Ça paie pas des masses, ${c.job}, mais ça nourrit.`,
    ],
  },
  {
    when: (c) => !!c.listenerJob && !c.jobless,
    lines: (c) => [`Alors, ça se passe comment à ${c.listenerJob} ?`, `Toujours à ${c.listenerJob}, toi ?`, `Il paraît que ça tourne bien, à ${c.listenerJob}.`],
  },
  {
    when: (c) => !!c.jobless,
    lines: () => [
      'Toujours pas de boulot… ça commence à faire long.',
      'Si t’entends parler d’une embauche, pense à moi.',
      'Sans travail, les journées sont longues, j’te jure.',
      'Je ferais n’importe quoi pour un emploi, là.',
      'Le potager, ça nourrit, mais ça paie pas.',
    ],
  },
  {
    // On parle de moi dans la gazette : on ne commente pas sa propre nouvelle comme un étranger.
    when: (c) => !!c.headline && mentions(c.headline, c.speaker.name),
    lines: () => [
      'T’as vu ? Je suis dans la gazette !',
      'Oui, c’est bien de moi qu’ils parlent dans le journal.',
      'Tout le monde me regarde depuis la gazette, c’est gênant.',
      'J’ai découpé l’article, je le garde.',
      'Me parle pas de la gazette, s’il te plaît.',
    ],
  },
  {
    when: (c) => !!c.headline && !mentions(c.headline, c.speaker.name),
    lines: (c) => [
      `T’as lu la gazette ? « ${c.headline} »`,
      `« ${c.headline} »… Tout le village en parle.`,
      `Alors, « ${c.headline} » : t’en penses quoi ?`,
      `J’ai lu « ${c.headline} » ce matin, au petit-déj.`,
      `Je l’ai appris par la gazette : « ${c.headline} ».`,
      `Avec « ${c.headline} », y a de quoi causer pour la semaine.`,
      `Le crieur l’a gueulé sur la place : « ${c.headline} ».`,
      `« ${c.headline} » : qui l’eût cru ?`,
      `On parle que de ça : « ${c.headline} ».`,
    ],
  },
  {
    when: (c) => !!c.partner,
    lines: (c) => [
      `${c.partner} m’a fait une surprise, hier soir.`,
      `On s’est encore chamaillés avec ${c.partner}… pour une histoire de soupe.`,
      `Avec ${c.partner}, on pense à agrandir la maison.`,
      `${c.partner} te passe le bonjour !`,
    ],
  },
  { when: (c) => c.storm, lines: () => ['Quel temps de chien !', 'Rentre vite, l’orage gronde.', 'J’ai perdu mon chapeau dans la bourrasque.', 'Le tonnerre a fait trembler mes casseroles.', 'Ça va déborder, cette nuit, je le sens.'] },
  { when: (c) => c.flood, lines: () => ['La rivière a tout emporté !', 'Le pont est sous l’eau, on est coupés du monde.', 'Mes bottes sont pleines d’eau.', 'J’ai jamais vu la rivière aussi haute.'] },
  { when: (c) => c.night, lines: () => ['Tu dors pas, toi non plus ?', 'La lune est belle, ce soir.', 'Chut, tout le monde dort.', 'Il fait noir comme dans un four.'] },
  { when: (c) => (c.speaker.needs?.satiete ?? 1) < 0.3, lines: () => ['J’ai un trou dans l’estomac.', 'T’aurais pas un bout de pain ?', 'Je mangerais une botte de foin.', 'Mon ventre fait plus de bruit que le crieur.'] },
  { when: (c) => (c.speaker.needs?.energie ?? 1) < 0.3, lines: () => ['Je tombe de sommeil.', 'Je pourrais dormir debout.', 'M’en veux pas si je bâille.', 'J’ai plus de jambes.'] },
  { when: (c) => (c.speaker.needs?.humeur ?? 1) < 0.3, lines: () => ['Rien va, en ce moment.', 'Laisse-moi tranquille, s’il te plaît.', 'J’ai le cœur gros.', 'C’est pas mon jour. Ni ma semaine.'] },
  { when: (c) => (c.speaker.needs?.sante ?? 1) < 0.5, lines: () => ['Atchoum ! Pardon.', 'J’ai la crève.', 'Approche pas, je suis malade comme un chien.', 'L’herboriste m’a donné un truc infect.'] },
  { when: (c) => (c.speaker.inventory?.pieces ?? 0) === 0, lines: () => ['J’ai plus un sou.', 'Tu me prêterais une pièce ?', 'La vie est chère, au hameau.', 'Ma bourse sonne creux.'] },
  { when: (c) => (c.speaker.inventory?.pieces ?? 0) > 20, lines: () => ['Les affaires marchent bien, je me plains pas.', 'Tu veux que je t’offre une chope ?', 'J’ai mis un peu de côté, pour une fois.'] },
  { when: (c) => c.dayName === 'dimanche', lines: () => ['Ah, le dimanche… rien à faire, le bonheur.', 'On pique-nique sur la place, tu viens ?', 'Grasse matinée, enfin.'] },
  { when: (c) => c.dayName === 'mercredi', lines: () => ['Tu vas au marché ?', 'Il paraît qu’un colporteur passe aujourd’hui.'] },
  { when: (c) => c.dayName === 'lundi', lines: () => ['Lundi… déjà.', 'Allez, une nouvelle semaine.'] },
  { when: (c) => c.place === 'la place', lines: () => ['La fontaine chante, aujourd’hui.', 'On se croirait un jour de fête.', 'Y a du monde, sur la place.'] },
  { when: (c) => c.place === 'l’auberge', lines: () => ['À la tienne !', 'Encore une, et je rentre.', 'Ce ragoût, une merveille.', 'Qui paie la tournée ?'] },
  { when: (c) => c.mayorOpinion < -0.2, lines: (c) => [`${c.mayorName} nous mène droit dans le mur.`, 'Au prochain conseil, je vote contre.', 'On paie l’impôt pour quoi, au juste ?', `${c.mayorName}, faut que ça change.`] },
  { when: (c) => c.mayorOpinion > 0.4, lines: (c) => [`On a un bon maire, quand même.`, `${c.mayorName} fait ce qui peut être fait.`, `Franchement, ${c.mayorName}, c’est pas si mal.`] },
];

/** Échanges complets selon la relation. */
const FRIENDLY: [string, string][] = [
  ['Ça fait plaisir de te voir !', 'Pareil, ça faisait un bail.'],
  ['On se fait un tour vers la rivière ?', 'Carrément.'],
  ['Merci pour l’autre jour.', 'Entre voisins, c’est normal.'],
  ['T’as l’air en forme, aujourd’hui.', 'C’est grâce à toi, peut-être.'],
  ['Je t’ai gardé une part de tarte.', 'T’es un trésor.'],
  ['On fait la paire, tous les deux.', 'Comme le pain et le beurre.'],
  ['Viens manger à la maison, ce soir.', 'J’apporte le pain !'],
  ['T’as besoin d’un coup de main ?', 'Volontiers, c’est gentil.'],
  ['Je pensais justement à toi.', 'En bien, j’espère ?'],
  ['On rigole bien, toi et moi.', 'Faudrait le faire plus souvent.'],
  ['T’as une seconde ? Faut que je te raconte un truc.', 'Toujours, vas-y.'],
  ['Allez, on se voit à la fête ?', 'Évidemment, je raterais pas ça.'],
];
const FLIRT: [string, string][] = [
  ['Tes yeux brillent plus que la lune.', 'Arrête, tu me fais rougir.'],
  ['Je pense souvent à toi, tu sais.', 'Moi aussi… plus que je devrais.'],
  ['Tu viens danser, à la prochaine fête ?', 'Seulement si c’est avec toi.'],
  ['Je t’ai cueilli une fleur près de la rivière.', 'Elle est magnifique.'],
  ['On se fait une balade au clair de lune ?', 'J’attendais que tu demandes.'],
  ['T’as un sourire qui réchauffe tout le village.', 'Et toi, t’as le chic pour me déstabiliser.'],
  ['Je te garde la dernière part de brioche.', 'Ça, c’est une preuve d’amour.'],
  ['Quand je te vois, j’oublie ce que j’allais dire.', 'Alors dis rien, et reste.'],
  ['Tu sens bon le pain chaud.', 'C’est mon nouveau parfum.'],
  ['Assieds-toi près de moi, ce soir.', 'Garde-moi la place.'],
];
/** Entre parents et enfants, ou entre frères et sœurs : de la tendresse, jamais de flirt. */
const KIN: [string, string][] = [
  ['T’as bien mangé, au moins ?', 'Oui, t’inquiète pas pour moi.'],
  ['Passe à la maison ce soir, il reste de la soupe.', 'J’apporterai du pain.'],
  ['Tu grandis trop vite.', 'C’est toi qui le dis à chaque fois !'],
  ['Quelle fierté de te voir comme ça, tu sais.', 'Merci… ça compte beaucoup.'],
  ['Tu te souviens quand tu tombais dans la rivière ?', 'Raconte pas ça à tout le monde !'],
  ['Couvre-toi, le vent se lève.', 'Oui, oui…'],
  ['T’as rangé ta chambre ?', 'Presque. Enfin… bientôt.'],
  ['On mange tous ensemble dimanche, hein ?', 'Comme toujours.'],
  ['Si t’as un souci, tu me le dis, d’accord ?', 'Promis.'],
  ['Tu ressembles de plus en plus à ta grand-mère.', 'C’est un compliment, j’espère ?'],
];

/** Même famille (parent, enfant, frère ou sœur) ? */
const kin = (a: Agent, b: Agent) => {
  const pa = a.family?.parentIds ?? [];
  const pb = b.family?.parentIds ?? [];
  return pa.includes(b.id) || pb.includes(a.id) || pa.some((p) => pb.includes(p));
};
const HOSTILE: [string, string][] = [
  ['Toi, je te parle pas.', 'Ça tombe bien.'],
  ['Je sais ce que t’as dit sur moi.', 'J’ai dit que la vérité.'],
  ['T’as encore un truc à me reprocher ?', 'La liste est longue.'],
  ['Pousse-toi de mon chemin.', 'Le chemin est à tout le monde.'],
  ['Un jour, tu paieras.', 'Essaie, pour voir.'],
  ['Te revoilà, toi.', 'Quel plaisir… ou pas.'],
  ['Arrête de me regarder comme ça.', 'Comme quoi ? Comme tu le mérites ?'],
  ['Va répandre tes rumeurs ailleurs.', 'Je répands rien, je constate.'],
  ['T’as du culot de te montrer ici.', 'Le village est à moi aussi.'],
  ['Je t’ai à l’œil.', 'Garde-le bien ouvert, alors.'],
];
const COLD: [string, string][] = [
  ['Salut.', 'Hm.'],
  ['Il fait beau.', 'Si tu le dis.'],
  ['Ça va ?', 'On fait aller.'],
  ['Tiens, toi.', 'Tiens.'],
  ['Bonne journée.', 'Ouais. Toi aussi.'],
  ['T’as vu l’heure ?', 'J’ai vu.'],
  ['On se croise souvent, ces temps-ci.', 'Le village est petit.'],
  ['Rien de neuf ?', 'Rien.'],
  ['Tu passes par là ?', 'J’y suis, apparemment.'],
  ['À plus.', 'C’est ça.'],
];

/** Toutes les répliques, pour les relire ou les compter. */
export const BANKS = { BY_ROLE, SITUATIONS, FRIENDLY, FLIRT, KIN, HOSTILE, COLD };

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Le titre parle-t-il de cette personne ? (prénom entier, pas un morceau d'un autre) */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (text: string, name: string) => new RegExp(`(^|[^\\p{L}])${escapeRe(name)}([^\\p{L}]|$)`, 'u').test(text);

/** Les dernières répliques entendues au village : on évite que tout le monde répète la même phrase. */
const recent: string[] = [];
const RECENT_MAX = 40;
function pickFresh(lines: string[]): string {
  const fresh = lines.filter((l) => !recent.includes(l));
  // Tout a déjà été dit récemment : on reprend la phrase la plus ancienne.
  const line = fresh.length ? pick(fresh) : lines.reduce((a, b) => (recent.lastIndexOf(a) <= recent.lastIndexOf(b) ? a : b));
  const was = recent.indexOf(line);
  if (was >= 0) recent.splice(was, 1);
  recent.push(line);
  if (recent.length > RECENT_MAX) recent.shift();
  return line;
}

/** Ce qu'un habitant dit à un autre, en tenant compte de tout le contexte. */
export function chooseExchange(c: TalkContext): Exchange {
  if (c.mutual < -0.4) {
    const [line, reply] = pick(HOSTILE);
    return { line, reply, bond: -0.05 };
  }
  if (kin(c.speaker, c.listener) && Math.random() < 0.5) {
    const [line, reply] = pick(KIN);
    return { line, reply, bond: 0.04 };
  }
  const partners = c.speaker.family?.partnerId === c.listener.id;
  // On ne flirte qu'avec son partenaire, ou entre célibataires sans lien de famille.
  const single = (x: Agent) => !x.family?.partnerId;
  const mayFlirt = partners || (c.mutual > 0.6 && single(c.speaker) && single(c.listener) && !kin(c.speaker, c.listener) && attracted(c.speaker, c.listener) && attracted(c.listener, c.speaker));
  if ((partners || c.mutual > 0.55) && Math.random() < 0.5) {
    const [line, reply] = pick(mayFlirt ? FLIRT : FRIENDLY);
    return { line, reply, bond: 0.05 };
  }
  const situational = SITUATIONS.filter((s) => s.when(c));
  if (situational.length && Math.random() < 0.6) return { line: pickFresh(pick(situational).lines(c)), bond: 0.02 };
  if (c.mutual < 0) {
    const [line, reply] = pick(COLD);
    return { line, reply, bond: 0 };
  }
  if (c.mutual > 0.3 && Math.random() < 0.4) {
    const [line, reply] = pick(FRIENDLY);
    return { line, reply, bond: 0.04 };
  }
  return { line: pickFresh(BY_ROLE[c.speaker.role] ?? BY_ROLE.CITOYEN!), bond: 0.03 };
}

/** Pensées qui traversent la tête d'un habitant seul (bulles en pointillés). */
export const MUSINGS: Partial<Record<Role, string[]>> = {
  MAIRE: ['Et si je faisais construire une statue ?', 'Il me faut un discours pour dimanche.', 'Qui va encore me critiquer aujourd’hui ?', 'Un deuxième pont… ou une fontaine ?'],
  BOULANGER: ['Demain, j’essaie une brioche.', 'Il me faut plus de farine…', 'Et si je faisais des croissants ?'],
  FORGERON: ['Le marteau, mon seul vrai ami.', 'Un jour, je forgerai une cloche pour la place.', 'Faut que j’aiguise tout ça.'],
  HERBORISTE: ['La pleine lune approche, bon moment pour cueillir.', 'Qui viendra frapper à ma porte aujourd’hui ?'],
  CRIEUR: ['Quelle nouvelle j’annonce demain ?', 'Faut que je ménage ma voix.'],
  AUBERGISTE: ['Il me faut des chopes neuves.', 'Qui va payer son ardoise, ce soir ?'],
  GARDE: ['Quelqu’un ment, dans ce village.', 'Je sens que le voleur est pas loin.'],
  BARDE: ['Il me faut une rime en « -ette ».', 'Ce village, c’est une épopée.'],
  VOLEUR: ['Ce soir, peut-être…', 'Personne se doute de rien.'],
  ECLAIREUR: ['Et si je partais explorer les collines ?', 'Y a forcément une histoire quelque part.'],
  ECRIVAIN: ['Le titre, tout est dans le titre.', 'Et si j’écrivais sur les gens d’ici ?'],
  EDITEUR: ['Moins, c’est mieux.', 'Encore trop de mots.'],
  LECTEUR: ['Pourquoi le pont est si loin ?', 'J’espère que le prochain numéro sera meilleur.'],
  CITOYEN: ['Faudrait que je repeigne les volets.', 'Qu’est-ce que je vais manger ce soir ?', 'Et si je changeais de vie ?'],
};

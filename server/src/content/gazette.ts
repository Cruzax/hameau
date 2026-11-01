// Matière première de la gazette en mode gratuit : sujets, brouillons, critiques.
// Les vrais événements du village (content/news.ts) passent avant ces sujets de secours.

export const TOPICS = [
  'Le puits de la place fait un bruit étrange la nuit',
  'Une chèvre a été vue sur le toit de la mairie',
  'Le pont grince plus que d’habitude',
  'Des champignons géants poussent près de la rivière',
  'Quelqu’un a repeint le panneau d’affichage en rose',
  'Le four à pain est en panne depuis l’aube',
  'Une lettre anonyme critique le maire',
  'Les arbres ont roussi en une seule nuit',
  'Un hibou s’est installé dans le clocher de la tour',
  'La fontaine coule à l’envers depuis mardi',
  'Un épouvantail a changé de champ pendant la nuit',
  'On a retrouvé une clé ancienne au fond de la rivière',
  'Les poules ne pondent plus que des œufs doubles',
  'Le brouillard du matin sentait la cannelle',
  'Un mystérieux voyageur a laissé un chapeau à l’auberge',
  'Les grenouilles chantent faux cette année',
  'La forge a produit une étincelle verte',
  'Le chemin de la forêt est couvert de plumes',
  'Une course d’escargots est prévue dimanche',
  'Le vent a emporté tous les draps du village',
  'Une citrouille pèse plus lourd que le forgeron',
  'Un chant mystérieux s’élève du moulin chaque soir',
  'La boulangerie invente un pain en forme de lune',
  'Le maire porterait une perruque',
  'Un écureuil vole les noisettes de toute la place',
  'Le crieur a perdu sa voix pendant une heure',
  'Les cloches ont sonné toutes seules à minuit',
  'Un trésor serait caché sous le vieux chêne',
  'Les enfants ont construit une cabane dans la forêt',
  'Le pont serait hanté par un ancien péager',
  'La rivière a charrié un tonneau de cidre',
  'Le garde aurait peur du noir',
  'Une étoile filante est tombée derrière la colline',
  'L’auberge manque de chopes après une fête mémorable',
  'L’herboriste aurait trouvé une plante qui fait rire',
  'Une fourmilière géante menace la place',
  'Les moutons du voisin ont appris à ouvrir les barrières',
  'Le vieux moulin tourne sans vent',
  'Une pluie de grenouilles aurait été observée',
  'On cherche le propriétaire d’un parapluie rouge',
];

/** De quoi parle un sujet : sert à varier l'article et l'avis du lecteur. */
export type Theme = 'crime' | 'amour' | 'politique' | 'meteo' | 'fete' | 'sante' | 'village' | 'mystere';

export function themeOf(topic: string): Theme {
  const t = topic.toLowerCase();
  if (/\bvol\b|\bvole|voleur|coupable|banni|accus|procès|innocent|enquête|rôd/.test(t)) return 'crime';
  if (/couple|amour|naissance|\bmarié|mariage|fian|bébé|se fâchent|dispute/.test(t)) return 'amour';
  if (/maire|vote|destitu|écharpe|conseil|lettre anonyme|impôt|route/.test(t)) return 'politique';
  if (/orage|\bpluie|brouillard|\bcrue|neige|\bvent\b|tempête|soleil|\bgel\b|sécheresse/.test(t)) return 'meteo';
  if (/fête|\bbal\b|danse|chant|violon|musique|fredonne|concours|banquet|marché|course/.test(t)) return 'fete';
  if (/malade|soign|fièvre|herbor|tousse|guéri/.test(t)) return 'sante';
  if (/nouveau|nouvelle maison|arrive|quitte|adulte|construit|boulang|forge|puits|pont|four/.test(t)) return 'village';
  return 'mystere';
}

/** Ce que l'écrivain a sous la main pour broder : des habitants et un lieu. */
export interface DraftCtx {
  witness: string;
  other: string;
  place: string;
}

// Un article = une attaque + un développement + une chute. Jamais le titre recopié.
export const DRAFT_LEADS: Record<Theme, ((c: DraftCtx) => string)[]> = {
  crime: [
    () => 'Le village ne dort plus tranquille.',
    (c) => `C’est ${c.witness} qui a donné l’alerte, au petit matin.`,
    () => 'Les volets se ferment plus tôt ces jours-ci.',
    () => 'L’affaire agite toutes les maisons depuis l’aube.',
  ],
  amour: [
    () => 'Le cœur du hameau bat un peu plus fort.',
    (c) => `${c.witness} jure l’avoir senti venir depuis des semaines.`,
    () => 'Les commères n’ont pas chômé.',
    () => 'Une bonne nouvelle, pour une fois.',
  ],
  politique: [
    () => 'La mairie est de nouveau au centre des conversations.',
    (c) => `${c.witness} n’a pas mâché ses mots sur la place.`,
    () => 'Le conseil n’a pas fini de faire parler de lui.',
    () => 'Au village, chacun a désormais un avis sur la question.',
  ],
  meteo: [
    () => 'Le ciel a encore décidé à notre place.',
    (c) => `Depuis ${c.place}, le spectacle était saisissant.`,
    () => 'Les anciens avaient prévenu, personne ne les a crus.',
    () => 'Il a fallu rentrer le linge en courant.',
  ],
  fete: [
    () => 'Le village avait bien besoin de souffler.',
    (c) => `${c.witness} a dansé jusqu’à en perdre ses sabots.`,
    () => 'On en parlera encore longtemps à l’auberge.',
    () => 'Rires, chansons et quelques chopes renversées.',
  ],
  sante: [
    () => 'L’herboristerie ne désemplit pas.',
    (c) => `${c.witness} recommande une tisane de thym et du repos.`,
    () => 'Une mauvaise passe, qui rappelle que l’hiver approche.',
    () => 'Le village croise les doigts.',
  ],
  village: [
    () => 'Le hameau change, un peu chaque jour.',
    (c) => `${c.witness} a été parmi les premiers au courant.`,
    () => 'Une page se tourne dans notre petit monde.',
    () => 'Voilà qui va changer les habitudes de certains.',
  ],
  mystere: [
    () => 'Personne n’a d’explication, mais tout le monde a une théorie.',
    (c) => `${c.witness} affirme avoir tout vu depuis ${c.place}.`,
    () => 'Le phénomène intrigue jusqu’aux plus sceptiques.',
    () => 'L’affaire a commencé tôt ce matin, dans le plus grand silence.',
  ],
};

export const DRAFT_MIDDLES: ((c: DraftCtx) => string)[] = [
  (c) => `${c.other} hausse les épaules : « On en a vu d’autres. »`,
  (c) => `À en croire ${c.other}, ce n’est que le début.`,
  () => 'À l’auberge, les avis sont partagés.',
  (c) => `${c.witness} et ${c.other} ne sont pas d’accord sur les détails.`,
  (c) => `On a vu du monde se rassembler vers ${c.place}.`,
  () => 'Certains y voient un présage, d’autres une simple farce.',
  (c) => `« Je l’avais dit ! », répète ${c.other} à qui veut l’entendre.`,
  () => 'Un témoin, qui préfère rester anonyme, assure que ce n’est pas fini.',
  () => 'Nos anciens disent que cela s’est déjà produit, il y a bien longtemps.',
  (c) => `${c.other} propose d’en parler au prochain conseil.`,
];

export const DRAFT_ENDINGS: string[] = [
  'Faut-il s’en inquiéter ? Le village est divisé.',
  'La suite au prochain numéro.',
  'Notre enquête continue.',
  'Le maire n’a pas souhaité commenter.',
  'Voilà qui alimentera les conversations au marché.',
  'Affaire à suivre, évidemment.',
  'Nous tiendrons nos lecteurs informés.',
  'Reste à savoir qui aura le dernier mot.',
];

// Avis du lecteur : une réaction selon la note, une remarque sur le thème, parfois sur la plume ou sur la veille.
export const REVIEW_REACTIONS: Record<number, string[]> = {
  1: ['Du vent.', 'Je m’en servirai pour allumer le feu.', 'Rien appris, rien senti.', 'J’ai décroché à la deuxième ligne.'],
  2: ['Le sujet méritait mieux.', 'Trop court pour en tirer quelque chose.', 'On a déjà oublié.', 'Bof.'],
  3: ['Correct, sans plus.', 'Il manque un détail qui accroche.', 'Ni chaud ni froid.', 'Ça se lit.'],
  4: ['Bien vu, et bien dit.', 'Ça sent le vécu, j’aime.', 'Enfin un sujet qui nous concerne.', 'Agréable à lire.'],
  5: ['Je l’ai lu deux fois !', 'Le meilleur numéro de la semaine.', 'Tout le village va en parler.', 'Chapeau.'],
};

export const REVIEW_ON_THEME: Record<Theme, { good: string[]; bad: string[] }> = {
  crime: { good: ['On tremble avec le village.', 'Enfin une vraie enquête.'], bad: ['On accuse vite, ici.', 'Des rumeurs, pas des faits.'] },
  amour: { good: ['Ça réchauffe le cœur.', 'Un peu de douceur, ça fait du bien.'], bad: ['Les histoires de cœur, ça ne me regarde pas.', 'Trop sucré pour moi.'] },
  politique: { good: ['Courageux, vis-à-vis de la mairie.', 'Ça bouscule, et c’est tant mieux.'], bad: ['On sent la gazette du maire.', 'Trop prudent avec la mairie.'] },
  meteo: { good: ['On s’y croirait, sous l’averse.', 'Bien raconté, ce ciel.'], bad: ['Parler de la pluie… vraiment ?', 'La météo, je la vois par ma fenêtre.'] },
  fete: { good: ['On entend presque la musique.', 'Ça donne envie d’y retourner.'], bad: ['Et ceux qui n’étaient pas invités ?', 'Beaucoup de bruit pour une fête.'] },
  sante: { good: ['Touchant, et utile.', 'Bon conseil de tisane.'], bad: ['Un peu triste pour un matin.', 'Laissez les malades tranquilles.'] },
  village: { good: ['C’est notre village, ça.', 'Bon à savoir.'], bad: ['Tout le monde était déjà au courant.', 'Rien de neuf sous le clocher.'] },
  mystere: { good: ['Intrigant, je veux la suite.', 'Ça fait jaser, bravo.'], bad: ['On n’y croit pas une seconde.', 'Encore une légende de comptoir.'] },
};

export const REVIEW_SAME_THEME = ['Encore ce genre de sujet ?', 'On tourne en rond, non ?', 'Toujours la même chanson.'];
export const REVIEW_BETTER = ['Mieux qu’hier.', 'En progrès !', 'Ça remonte.'];
export const REVIEW_WORSE = ['Moins bon qu’hier.', 'On a connu mieux cette semaine.', 'Petite baisse de forme.'];
export const REVIEW_WRITER = {
  good: [(w: string) => `${w} a la plume en forme.`, (w: string) => `On reconnaît le style de ${w}.`],
  bad: [(w: string) => `${w} peut mieux faire.`, (w: string) => `${w} a écrit ça les yeux fermés ?`],
};

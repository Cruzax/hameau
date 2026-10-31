// Chansons du barde et annonces du crieur, écrites à la main.

export const SONGS: ((t: string) => string)[] = [
  (t) => `🎵 « Au hameau, l’on raconte encore / que ${t}… et que le pain n’est plus d’or ! »`,
  (t) => `🎵 « Lève ta chope, mon voisin, / car ${t}, et demain, plus rien ! »`,
  (t) => `🎵 « Ô rivière, ô moulin, / ${t}, et ça finira bien. »`,
  (t) => `🎵 « Qui l’eût cru, qui l’eût dit ? / ${t}, mes amis ! »`,
  (t) => `🎵 « Dans la nuit sans un bruit, / ${t}… et le garde s’enfuit ! »`,
  (t) => `🎵 « Tralala, tralalère, / ${t}, quelle affaire ! »`,
  (t) => `🎵 « Le maire a dit, le crieur a crié : / ${t}, c’est la vérité ! »`,
  (t) => `🎵 « Sous la lune et les étoiles, / ${t}, tissons la toile. »`,
  (t) => `🎵 « Un, deux, trois, le hameau s’agite, / ${t}, et tout va trop vite ! »`,
  (t) => `🎵 « Ma belle, mon beau, écoute bien : / ${t}, et nous n’y pouvons rien. »`,
  (t) => `🎵 « Les chopes tintent, les cœurs aussi, / ${t}, voilà notre vie. »`,
  (t) => `🎵 « Au fond du puits, on l’a juré : / ${t}, ça restera gravé. »`,
];

export const CRIER_EXTRAS: string[] = [
  'le temps sera clément jusqu’à ce soir',
  'il est interdit de faire boire les chèvres dans la fontaine',
  'l’auberge offre la soupe aux courageux qui ont coupé du bois',
  'on recherche le propriétaire d’un sabot gauche trouvé près du pont',
  'le maire rappelle que l’impôt n’est pas une option',
  'la boulangerie ouvre dès l’aube, venez tôt',
  'les enfants ne doivent pas jouer près de la rivière',
  'le prochain conseil se tiendra bientôt, préparez vos bulletins',
  'quiconque verra le voleur est prié de prévenir le garde',
  'la forge répare les outils à prix d’ami cette semaine',
];

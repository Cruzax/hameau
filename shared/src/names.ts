import type { Sex } from './traits';

/** Prénoms selon le sexe ; les prénoms mixtes vont à tout le monde. */
export const NAMES_BY_SEX: Record<'M' | 'F' | 'X', string[]> = {
  F: [
    'Léa', 'Jade', 'Chloé', 'Emma', 'Zoé', 'Lina', 'Rose', 'Nina', 'Alba', 'Inès', 'Manon', 'Margaux', 'Alice', 'Elsa', 'Iris', 'Louise', 'Anna',
    'Clara', 'Juliette', 'Maëlle', 'Agathe', 'Romane', 'Mila', 'Capucine', 'Suzanne', 'Héloïse', 'Apolline', 'Éloïse', 'Margot', 'Bérénice', 'Colette',
    'Odile', 'Mathilde', 'Blanche', 'Jeanne', 'Lucie', 'Adèle', 'Constance', 'Albane', 'Philippine', 'Sixtine', 'Garance', 'Ysée', 'Aurore', 'Fleur',
    'Hortense', 'Joséphine', 'Livia', 'Noémie', 'Salomé', 'Lou-Ann', 'Céleste', 'Melissa',
  ],
  M: [
    'Hugo', 'Nathan', 'Lucas', 'Tom', 'Noah', 'Gabin', 'Malo', 'Théo', 'Louis', 'Jules', 'Arthur', 'Paul', 'Victor', 'Raphaël', 'Adam', 'Martin',
    'Simon', 'Basile', 'Émile', 'Léon', 'Oscar', 'Marius', 'Félix', 'Gaspard', 'Augustin', 'Barnabé', 'Lazare', 'Célestin', 'Achille', 'Aimé',
    'Ernest', 'Firmin', 'Gaston', 'Hector', 'Ambroise', 'Clovis', 'Anatole', 'Eugène', 'Fernand', 'Octave', 'Valentin', 'Edgar', 'Honoré', 'Joseph',
    'Bastien', 'Dorian', 'Gauthier', 'Ilan', 'Kylian', 'Mathis', 'Pierre', 'Tristan', 'Élie', 'Maxime',
    'Adrien', 'Cyril', 'Maxence', 'Gaudard', 'Greg', 'Remi', 'Tony',
  ],
  X: ['Sacha', 'Camille', 'Lou', 'Ange', 'Charlie', 'Morgan', 'Alix', 'Eden', 'Andréa', 'Dominique', 'Claude', 'Noa', 'Yaël', 'Swann'],
};

/** Le sexe que suggère un prénom connu ; rien pour un prénom mixte ou inconnu. */
export function sexOfName(name: string): Sex | undefined {
  const n = name.trim().toLowerCase();
  if (NAMES_BY_SEX.M.some((x) => x.toLowerCase() === n)) return 'M';
  if (NAMES_BY_SEX.F.some((x) => x.toLowerCase() === n)) return 'F';
  return undefined;
}

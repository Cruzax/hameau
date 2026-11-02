/** Une estime (de -1 à +1) dite avec des mots : ce qu'on affiche à la place des chiffres. */
export function feeling(x: number): { word: string; face: string; tone: 'tres-bon' | 'bon' | 'neutre' | 'mauvais' | 'tres-mauvais' } {
  if (x >= 0.5) return { word: 'adore', face: '😍', tone: 'tres-bon' };
  if (x >= 0.15) return { word: 'apprécie', face: '🙂', tone: 'bon' };
  if (x > -0.15) return { word: 'neutre', face: '😐', tone: 'neutre' };
  if (x > -0.5) return { word: 'se méfie', face: '😒', tone: 'mauvais' };
  return { word: 'déteste', face: '😠', tone: 'tres-mauvais' };
}

// Élision : « de Ambroise » → « d’Ambroise », « que Odette » → « qu’Odette ».
const VOWEL = /^[aeiouyéèêàâîïôûh]/i;

export const de = (word: string) => (VOWEL.test(word) ? `d’${word}` : `de ${word}`);
export const que = (text: string) => (VOWEL.test(text) ? `qu’${text}` : `que ${text}`);

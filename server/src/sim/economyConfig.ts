import type { WorkplaceKind } from '@hameau/shared';

// Réglages de l'économie (à ajuster sur un long run : voir test/longrun.test.ts).

/** Salaire par jour travaillé, en pièces. Les écarts font les riches et les pauvres. */
export const WAGES: Record<WorkplaceKind, number> = { ferme: 3, moulin: 4, scierie: 4, boulangerie: 5, auberge: 4, herboristerie: 5, forge: 6 };
/** Postes par lieu de travail. */
export const SLOTS: Record<WorkplaceKind, number> = { ferme: 4, moulin: 2, scierie: 3, boulangerie: 2, auberge: 2, herboristerie: 1, forge: 2 };
/** Heures de travail (arrivée, départ). */
export const WORK_HOURS = [8, 17] as const;
/** On quitte son emploi pour un autre qui paie au moins autant de plus. */
export const SWITCH_IF_BETTER_BY = 2;
/** Jours de salaires impayés avant de renvoyer le dernier embauché. */
export const FIRE_AFTER_UNPAID_DAYS = 3;
/** Absences sur les 7 derniers jours avant un renvoi. */
export const FIRE_AFTER_ABSENCES = 3;
/** Le patron empoche ce qui dépasse ce fonds de caisse. */
export const TILL_FLOAT = 10;

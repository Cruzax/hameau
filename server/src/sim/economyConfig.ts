import type { Good, WorkplaceKind } from '@hameau/shared';

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
export const TILL_FLOAT = 40;

/** Production par employé présent et par jour. Le moulin transforme le blé, la boulangerie la farine et le bois. */
export const OUTPUT_PER_WORKER = { ble: 6, bois: 4, farine: 8, pain: 16, outils: 1 } as const;
/** Une farine fait 3 pains, une bûche en cuit 6. */
export const BREAD_PER_FLOUR = 3;
export const BREAD_PER_WOOD = 6;
/** Prix de vente, en pièces. */
export const PRICES = { ble: 1, farine: 2, bois: 2, outils: 6, pain: 1 } as const;
/** Pain du potager, chaque matin, pour un adulte sans emploi. */
export const SUBSISTENCE_BREAD = 1;
/** Pain du potager familial pour un enfant. */
export const CHILD_BREAD = 2;
/** Pains qu'un habitant achète d'un coup. */
export const BREAD_PER_PURCHASE = 4;
/** La boulangerie garde quelques pains en réserve et n'en offre que quelques-uns par jour. */
export const BAKERY_RESERVE = 2;
export const GIFTS_PER_DAY = 4;

/** Ce qu'il faut au village pour avoir du pain : ouvert en priorité s'il en manque un. */
export const ESSENTIAL: WorkplaceKind[] = ['boulangerie', 'ferme', 'moulin', 'scierie'];
/** Poids des métiers quand on ouvre un lieu de plus pour les sans-emploi (plus de fermes que de forges). */
export const GROWTH_WEIGHT: Partial<Record<WorkplaceKind, number>> = { ferme: 2, boulangerie: 1.5, moulin: 1, scierie: 1, forge: 0.5 };
/** Pains par habitant et par jour à pouvoir produire (un pain rend 0,6 de satiété ; on en perd 0,9 par jour). */
export const BREAD_NEED_PER_PERSON = 2;
/** Pains par jour que permet un poste occupé, maillon par maillon (16 cuits, 8 farines × 3, 6 blés × 3, 4 bûches × 6). */
export const BREAD_PER_SLOT: Partial<Record<WorkplaceKind, number>> = { boulangerie: 16, moulin: 24, ferme: 18, scierie: 24 };
/** Mise de départ d'un fondateur, qui devient patron. */
export const FOUNDING_COST = 20;
/** Soirs d'affilée sans de quoi payer un salaire avant la faillite. */
export const BANKRUPT_AFTER_DAYS = 7;

/** Le village remet ses propres caisses à ce niveau chaque soir. */
export const VILLAGE_TILL_FLOOR = 30;
/** Un patron renfloue sa caisse jusqu'à ce niveau… */
export const OWNER_REFILL = 20;
/** …en gardant au moins ceci en poche. */
export const OWNER_KEEPS = 10;
/** Au-delà de ce stock (blé, farine, bois, outils), on ne produit plus. */
export const STOCK_CAP = 60;
/** Ce que chaque lieu produit. */
export const OUTPUT_GOOD: Partial<Record<WorkplaceKind, Good>> = { ferme: 'ble', scierie: 'bois', moulin: 'farine', boulangerie: 'pain', forge: 'outils' };

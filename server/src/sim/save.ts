// Sauvegarde d'une partie : l'état des rouages de la simulation (couples en cours, absences, procès…),
// sans les fonctions. Map, Set et tableaux passent tels quels : le navigateur sait les copier (IndexedDB).

const isPlain = (v: object) => Object.getPrototypeOf(v) === Object.prototype;
const isContainer = (v: object) => Array.isArray(v) || v instanceof Map || v instanceof Set || isPlain(v);

/** Les champs d'un objet de la simulation, en descendant dans les sous-objets (ex. la justice du quotidien). */
export function stateOf(obj: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'function') continue;
    out[k] = v && typeof v === 'object' && !isContainer(v) ? stateOf(v) : v;
  }
  return out;
}

/** Remet un état sauvegardé dans un objet neuf du même genre. */
export function restoreState(obj: object, state: Record<string, unknown>) {
  const target = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(state)) {
    const cur = target[k];
    if (cur && typeof cur === 'object' && !isContainer(cur) && v && typeof v === 'object') restoreState(cur, v as Record<string, unknown>);
    else target[k] = v;
  }
}

import { useState } from 'react';
import {
  MAX_TRAITS, PROFILES, ROLE_LABEL, TRAITS, validateFounders,
  type FounderSpec, type Orientation, type Role, type Sex, type TraitId,
} from '@hameau/shared';
import { useHameau } from '../net/store';
import { useUI } from './uiStore';

// Écran « Nouvelle histoire » : on compose les 4 fondateurs du village.

const ROLES: (Role | 'auto')[] = ['auto', 'MAIRE', 'ECLAIREUR', 'ECRIVAIN', 'EDITEUR', 'LECTEUR', 'CITOYEN', 'MENTEUR'];
const NAMES = ['Maxence', 'Lina', 'Félix', 'Rose', 'Gabin', 'Jade', 'Hugo', 'Emma', 'Sacha', 'Alba', 'Malo', 'Nina', 'Théo', 'Zoé', 'Lucas', 'Chloé'];
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

const blank = (i: number): FounderSpec => ({ name: NAMES[i], traits: [], role: 'auto', sex: 'auto', orientation: 'auto' });

function randomFounder(taken: string[]): FounderSpec {
  const profile = pick(PROFILES);
  return { name: pick(NAMES.filter((n) => !taken.includes(n))), traits: [...profile.traits], role: 'auto', sex: 'auto', orientation: 'auto' };
}

export function StartScreen() {
  const open = useUI((s) => s.starting);
  const setUI = useUI((s) => s.set);
  const send = useHameau((s) => s.send);
  const [founders, setFounders] = useState<FounderSpec[]>(() => [0, 1, 2, 3].map(blank));
  if (!open) return null;

  const update = (i: number, patch: Partial<FounderSpec>) => setFounders(founders.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const toggleTrait = (i: number, t: TraitId) => {
    const f = founders[i];
    const traits = f.traits.includes(t) ? f.traits.filter((x) => x !== t) : [...f.traits, t].slice(-MAX_TRAITS);
    update(i, { traits });
  };
  const error = validateFounders(founders);
  const launch = () => {
    if (error) return;
    send({ type: 'god.reset', founders });
    setUI({ starting: false });
  };

  return (
    <div className="start" role="dialog" aria-label="Nouvelle histoire">
      <div className="start__card">
        <div className="start__head">
          <div>
            <div className="start__kicker">Nouvelle histoire</div>
            <h2 className="start__title">Qui fonde le village ?</h2>
          </div>
          <button className="start__close" onClick={() => setUI({ starting: false })} title="Fermer">✕</button>
        </div>
        <div className="start__grid">
          {founders.map((f, i) => (
            <section key={i} className="start__founder">
              <input className="start__name" value={f.name} maxLength={24} onChange={(e) => update(i, { name: e.target.value })} aria-label={`Nom du villageois ${i + 1}`} />
              <div className="start__label">Profil</div>
              <div className="start__chips">
                {PROFILES.map((p) => (
                  <button key={p.id} className={`start__chip ${p.traits.join() === f.traits.join() ? 'is-on' : ''}`} onClick={() => update(i, { traits: [...p.traits] })} title={p.traits.map((t) => TRAITS[t].label).join(', ')}>
                    {p.emoji} {p.label}
                  </button>
                ))}
              </div>
              <div className="start__label">Traits ({f.traits.length}/{MAX_TRAITS})</div>
              <div className="start__chips">
                {(Object.keys(TRAITS) as TraitId[]).map((t) => (
                  <button key={t} className={`start__chip start__chip--trait ${f.traits.includes(t) ? 'is-on' : ''}`} onClick={() => toggleTrait(i, t)}>
                    {TRAITS[t].label}
                  </button>
                ))}
              </div>
              <div className="start__row">
                <label>Rôle
                  <select value={f.role} onChange={(e) => update(i, { role: e.target.value as Role | 'auto' })}>
                    {ROLES.map((r) => <option key={r} value={r}>{r === 'auto' ? 'Automatique' : ROLE_LABEL[r]}</option>)}
                  </select>
                </label>
                <label>Sexe
                  <select value={f.sex ?? 'auto'} onChange={(e) => update(i, { sex: e.target.value as Sex | 'auto' })}>
                    <option value="auto">Au hasard</option><option value="M">Masculin</option><option value="F">Féminin</option>
                  </select>
                </label>
                <label>Orientation
                  <select value={f.orientation ?? 'auto'} onChange={(e) => update(i, { orientation: e.target.value as Orientation | 'auto' })}>
                    <option value="auto">Au hasard</option><option value="hetero">Hétéro</option><option value="bi">Bi</option><option value="gay">Gay</option>
                  </select>
                </label>
              </div>
            </section>
          ))}
        </div>
        <div className="start__foot">
          <span className="start__error">{error ?? ''}</span>
          <button className="start__btn" onClick={() => setFounders(founders.reduce<FounderSpec[]>((acc) => [...acc, randomFounder(acc.map((x) => x.name))], []))}>🎲 Au hasard</button>
          <button className="start__btn start__btn--go" disabled={!!error} onClick={launch}>Lancer l’histoire</button>
        </div>
      </div>
    </div>
  );
}

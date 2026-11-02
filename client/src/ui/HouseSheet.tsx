import { useState } from 'react';
import { attracted, ROLE_COLOR, ROLE_LABEL, satisfaction, type Agent, type WorldState, type Workplace } from '@hameau/shared';
import { useHameau } from '../net/store';
import { WORKPLACE_LABEL } from '../scene/House';
import { Panel } from './Panel';
import { useUI } from './uiStore';

// Fiche d'une maison (ses habitants : couple, emploi, besoins, satisfaction) ou d'un lieu de travail.

const ORIENTATION = { hetero: 'hétéro', bi: 'bi', gay: 'gay' } as const;
const GOODS: Record<string, string> = { ble: 'blé', farine: 'farine', pain: 'pain', bois: 'bois', outils: 'outils' };

/** Jauge de 0 à 1, rouge quand elle est basse. */
function Gauge({ label, value, color = '#6a9a5b' }: { label: string; value: number; color?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="sheet__gauge" title={`${label} : ${pct} %`}>
      <span className="sheet__gauge-label">{label}</span>
      <span className="sheet__gauge-bar">
        <span style={{ width: `${pct}%`, background: value < 0.25 ? '#c8553d' : value < 0.5 ? '#d89a3a' : color }} />
      </span>
      <span className="sheet__gauge-pct">{pct} %</span>
    </div>
  );
}

const mood = (s: number) => (s >= 0.75 ? '😄' : s >= 0.5 ? '🙂' : s >= 0.3 ? '😐' : '😞');

function Resident({ a, w }: { a: Agent; w: WorldState }) {
  const job = a.job ? w.workplaces[a.job.workplaceId] : undefined;
  const partner = a.family?.partnerId ? w.agents[a.family.partnerId] : undefined;
  const kids = (a.family?.childIds ?? []).map((id) => w.agents[id]).filter(Boolean);
  const parents = (a.family?.parentIds ?? []).map((id) => w.agents[id]).filter(Boolean);
  const n = a.needs ?? { satiete: 0.8, energie: 0.9, humeur: 0.7, sante: 1 };
  const s = satisfaction(a, w);
  return (
    <section className="sheet__person">
      <div className="sheet__head">
        <span className="sheet__name">{a.name}</span>
        {a.sex && <span title={a.sex === 'M' ? 'Masculin' : 'Féminin'}>{a.sex === 'M' ? '♂' : '♀'}</span>}
        <span className="sheet__role" style={{ background: ROLE_COLOR[a.role] }}>{w.mayorId === a.id ? '👑 ' : ''}{ROLE_LABEL[a.role]}</span>
        <span className="sheet__mood" title="Satisfaction">{mood(s)}</span>
      </div>
      <dl className="sheet__facts">
        <dt>Travail</dt>
        <dd>{job ? `${WORKPLACE_LABEL[job.kind] ?? job.kind} · ${a.job!.wage} pièces/jour` : parents.length && w.houses[a.houseId]?.ownerId !== a.id ? 'enfant' : 'sans emploi'}</dd>
        <dt>Bourse</dt>
        <dd>{a.inventory?.pieces ?? 0} pièces · {a.inventory?.pain ?? 0} pain{(a.inventory?.pain ?? 0) > 1 ? 's' : ''}</dd>
        <dt>Cœur</dt>
        <dd>{partner ? `en couple avec ${partner.name}` : 'célibataire'}{a.orientation ? ` · ${ORIENTATION[a.orientation]}` : ''}</dd>
        {kids.length > 0 && (<><dt>Enfants</dt><dd>{kids.map((k) => k.name).join(', ')}</dd></>)}
        {parents.length > 0 && (<><dt>Parents</dt><dd>{parents.map((p) => p.name).join(' et ')}</dd></>)}
        <dt>Caractère</dt>
        <dd>{a.personality.traits.join(', ') || '—'}</dd>
      </dl>
      <Gauge label="Satisfaction" value={s} color="#3f7a6b" />
      <Gauge label="Satiété" value={n.satiete} />
      <Gauge label="Énergie" value={n.energie} />
      <Gauge label="Humeur" value={n.humeur} />
      <Gauge label="Santé" value={n.sante} />
      {a.lodging && <p className="sheet__ruin">🏚 Hébergement chez {w.houses[a.lodging]?.ownerId ? w.agents[w.houses[a.lodging].ownerId!]?.name : 'un voisin'} en attendant la reconstruction.</p>}
      <GodActions a={a} w={w} />
    </section>
  );
}

/** Pouvoirs du mode Dieu sur cette personne. */
function GodActions({ a, w }: { a: Agent; w: WorldState }) {
  const send = useHameau((s) => s.send);
  const [lover, setLover] = useState('');
  const matches = a.family?.partnerId ? [] : Object.values(w.agents).filter((b) => b.id !== a.id && !b.family?.partnerId && attracted(a, b) && attracted(b, a));
  return (
    <div className="sheet__god" aria-label="Pouvoirs">
      <button title="Mode Dieu" onClick={() => send({ type: 'god.money', agentId: a.id, delta: 20 })}>🎁 +20 pièces</button>
      <button title="Mode Dieu" disabled={!(a.inventory?.pieces ?? 0)} onClick={() => send({ type: 'god.money', agentId: a.id, delta: -20 })}>💸 −20</button>
      <button title="Mode Dieu" onClick={() => send({ type: 'god.accuse', agentId: a.id })}>⚖️ Accuser</button>
      {matches.length > 0 && (
        <select value={lover} onChange={(e) => { if (e.target.value) send({ type: 'god.love', a: a.id, b: e.target.value }); setLover(''); }}>
          <option value="">💘 Coup de foudre…</option>
          {matches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
      <button title="Mode Dieu" disabled={Object.keys(w.agents).length <= 2} onClick={() => send({ type: 'god.agent.exile', agentId: a.id })}>🧳 Exiler</button>
    </div>
  );
}

function WorkplaceSheet({ wp, w }: { wp: Workplace; w: WorldState }) {
  const boss = wp.ownerId ? w.agents[wp.ownerId] : undefined;
  const stock = Object.entries(wp.stock).filter(([, q]) => (q ?? 0) > 0);
  return (
    <section className="sheet__person">
      <dl className="sheet__facts">
        <dt>Aux commandes</dt>
        <dd>{boss ? boss.name : 'le village'}</dd>
        <dt>Employés</dt>
        <dd>{wp.workers.map((id) => w.agents[id]?.name).filter(Boolean).join(', ') || 'personne'} ({wp.workers.length}/{wp.slots})</dd>
        <dt>Caisse</dt>
        <dd>{Math.round(wp.till)} pièces</dd>
        <dt>Réserves</dt>
        <dd>{stock.length ? stock.map(([g, q]) => `${Math.round(q!)} ${GOODS[g] ?? g}`).join(' · ') : 'vides'}</dd>
        <dt>Ouvert</dt>
        <dd>depuis le jour {wp.openedDay}</dd>
      </dl>
    </section>
  );
}

export function HouseSheet() {
  const id = useUI((s) => s.selectedHouse);
  const w = useHameau((s) => s.world);
  const house = id ? w.houses[id] : undefined;
  const wp = house?.kind === 'travail' ? Object.values(w.workplaces).find((x) => x.houseId === house.id) : undefined;
  const residents = house ? Object.values(w.agents).filter((a) => a.houseId === house.id) : [];
  const owner = house?.ownerId ? w.agents[house.ownerId] : undefined;
  const title = !house ? 'Maison'
    : house.kind === 'travail' ? (wp ? WORKPLACE_LABEL[wp.kind] ?? wp.kind : 'Bâtiment vide')
    : owner ? `Chez ${owner.name}` : 'Maison vide';
  return (
    <Panel id="maison" icon={house?.kind === 'travail' ? '🏭' : '🏠'} title={title} minW={260}>
      {!house && <p className="sheet__empty">Clique sur une maison ou un lieu de travail pour voir qui y vit et comment ça va.</p>}
      {house && wp && <WorkplaceSheet wp={wp} w={w} />}
      {house && house.kind === 'travail' && !wp && <p className="sheet__empty">Ce bâtiment est vide depuis une faillite.</p>}
      {house?.ruined && <p className="sheet__ruin">🌪 Emportée par la tornade le jour {house.ruined.sinceDay}. Reconstruction prévue le jour {house.ruined.rebuildDay}.</p>}
      {house && house.kind !== 'travail' && residents.length === 0 && <p className="sheet__empty">Personne n’habite ici pour l’instant.</p>}
      {residents.map((a) => <Resident key={a.id} a={a} w={w} />)}
    </Panel>
  );
}

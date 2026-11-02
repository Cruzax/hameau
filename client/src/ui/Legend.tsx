import { useState } from 'react';
import { feeling, ROLE_COLOR, ROLE_LABEL, type Agent, type WorldState } from '@hameau/shared';
import { useHameau } from '../net/store';
import { Panel } from './Panel';
import { useUI } from './uiStore';
import { openHouseSheet } from '../scene/House';

/** Ce que fait l'habitant en ce moment, en quelques mots. */
function doing(w: WorldState, a: Agent): string {
  if (a.asleep) return '💤 dort';
  const l = a.location;
  const where = (place: string) => {
    if (place === 'place') return 'la place';
    const owner = w.agents[w.houses[place]?.ownerId ?? ''];
    return owner ? `chez ${owner.name}` : 'une maison vide';
  };
  if (l?.kind === 'walking') return l.to === a.houseId ? '🚶 rentre' : `🚶 vers ${where(l.to)}`;
  if (l?.kind === 'at') return `📍 ${where(l.place)}`;
  return a.activity === 'thinking' ? '💭 réfléchit' : '🏠 chez soi';
}

function Bar({ value, color, title }: { value: number; color: string; title: string }) {
  return (
    <span className="bar" title={`${title} : ${Math.round(value * 100)} %`}>
      <span style={{ width: `${Math.round(value * 100)}%`, background: value < 0.25 ? '#c8553d' : color }} />
    </span>
  );
}

/** Qui vit au village : rôle, maire, couple, enfant. Un clic cadre la caméra sur sa maison. */
export function Habitants() {
  const world = useHameau((s) => s.world);
  const { agents, mayorId, roads } = world;
  const setUI = useUI((s) => s.set);
  const openRoads = Object.values(roads).filter((r) => r.status === 'open').length;

  return (
    <Panel id="habitants" icon="👥" title={`Habitants · ${Object.keys(agents).length}`} minW={200}>
      <ul className="people">
        {Object.values(agents).map((a) => (
          <li key={a.id}>
            <button
              className="person"
              title="Centrer la caméra sur sa maison"
              onClick={() => {
                setUI({ shot: 'maison', focusHouse: a.houseId });
                openHouseSheet(a.houseId);
              }}
            >
              <span className="person__dot" style={{ background: ROLE_COLOR[a.role] }} />
              <span className="person__name">{a.name}</span>
              <span className="person__role">{ROLE_LABEL[a.role]}</span>
              <span className="person__tags">
                {a.sex && <span title={`${a.sex === 'M' ? 'Masculin' : 'Féminin'} · ${{ hetero: 'hétéro', bi: 'bi', gay: 'gay' }[a.orientation ?? 'hetero']}`}>{a.sex === 'M' ? '♂' : '♀'}</span>}
                {mayorId === a.id && <span title="Maire">👑</span>}
                {a.family?.partnerId && agents[a.family.partnerId] && <span title={`En couple avec ${agents[a.family.partnerId].name}`}>💞</span>}
                {a.family?.parentIds.length ? <span title="Enfant du village">👶</span> : null}
                {a.needs && a.needs.sante < 0.5 && <span title="Malade">🤒</span>}
              </span>
              {a.needs && (
                <span className="person__details">
                  <span className="person__bars">
                    <Bar value={a.needs.satiete} color="#d99a4a" title="Satiété" />
                    <Bar value={a.needs.energie} color="#5a9ad0" title="Énergie" />
                    <Bar value={a.needs.humeur} color="#5a9a4a" title="Humeur" />
                    <Bar value={a.needs.sante} color="#c66a8a" title="Santé" />
                  </span>
                  <span className="person__inv">
                    {a.inventory && `🥖${a.inventory.pain} 🪵${a.inventory.bois} 🔨${a.inventory.outils} 🪙${a.inventory.pieces}`}
                  </span>
                  <span className="person__doing">{doing(world, a)}</span>
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <p className="panel__foot">
        {openRoads} routes ouvertes · clic sur un habitant pour le suivre (touche 1 pour revenir en caméra libre)
      </p>
    </Panel>
  );
}

/** Une ligne : un visage, un mot, et une barre qui part vers la droite (estime) ou la gauche (rancœur). */
function FeelingRow({ name, color, x }: { name: string; color: string; x: number }) {
  const f = feeling(x);
  const width = Math.round(Math.min(1, Math.abs(x)) * 50);
  return (
    <li className={`feel feel--${f.tone}`} title={`${f.word} (${x > 0 ? '+' : ''}${x.toFixed(2)})`}>
      <span className="feel__name" style={{ color }}>{name}</span>
      <span className="feel__word">{f.face} {f.word}</span>
      <span className="feel__bar">
        <span style={x >= 0 ? { left: '50%', width: `${width}%` } : { right: '50%', width: `${width}%` }} />
      </span>
    </li>
  );
}

/** Ce qu'un habitant pense des autres, et ce que les autres pensent de lui, en mots plutôt qu'en chiffres. */
export function Relations() {
  const agents = useHameau((s) => s.world.agents);
  const list = Object.values(agents);
  const [picked, setPicked] = useState<string | null>(null);
  const me = (picked && agents[picked]) || list[0];
  const others = me ? list.filter((b) => b.id !== me.id) : [];
  const sortBy = (score: (b: Agent) => number) => [...others].sort((x, y) => score(y) - score(x));

  return (
    <Panel id="relations" icon="💞" title="Relations" minW={240}>
      <div className="feel__people">
        {list.map((a) => (
          <button key={a.id} className={`feel__pick ${me?.id === a.id ? 'is-on' : ''}`} onClick={() => setPicked(a.id)}>
            <span className="person__dot" style={{ background: ROLE_COLOR[a.role] }} />
            {a.name}
          </button>
        ))}
      </div>
      {me && (
        <>
          <h4 className="feel__title">Ce que {me.name} pense des autres</h4>
          <ul className="feel__list">
            {sortBy((b) => me.opinions[b.id] ?? 0).map((b) => <FeelingRow key={b.id} name={b.name} color={ROLE_COLOR[b.role]} x={me.opinions[b.id] ?? 0} />)}
          </ul>
          <h4 className="feel__title">Ce que les autres pensent de {me.name}</h4>
          <ul className="feel__list">
            {sortBy((b) => b.opinions[me.id] ?? 0).map((b) => <FeelingRow key={b.id} name={b.name} color={ROLE_COLOR[b.role]} x={b.opinions[me.id] ?? 0} />)}
          </ul>
        </>
      )}
    </Panel>
  );
}

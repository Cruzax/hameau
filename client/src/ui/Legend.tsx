import { ROLE_COLOR, ROLE_LABEL, type Agent, type WorldState } from '@hameau/shared';
import { useHameau } from '../net/store';
import { Panel } from './Panel';
import { useUI } from './uiStore';

/** -1 (rouge) → 0 (crème) → +1 (vert). */
function opinionColor(x: number) {
  const t = Math.max(-1, Math.min(1, x));
  const [r, g, b] = t < 0 ? [200 + 30 * (1 + t), 85 + 150 * (1 + t), 61 + 160 * (1 + t)] : [230 - 140 * t, 235 - 81 * t, 221 - 147 * t];
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}

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
              onClick={() => setUI({ shot: 'maison', focusHouse: a.houseId })}
            >
              <span className="person__dot" style={{ background: ROLE_COLOR[a.role] }} />
              <span className="person__name">{a.name}</span>
              <span className="person__role">{ROLE_LABEL[a.role]}</span>
              <span className="person__tags">
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

/** Ce que chacun pense des autres, de -1 à +1. */
export function Relations() {
  const agents = useHameau((s) => s.world.agents);
  const list = Object.values(agents);

  return (
    <Panel id="relations" icon="💞" title="Ce qu’ils pensent les uns des autres" minW={220}>
      <div className="opinions__wrap">
        <table className="opinions">
          <thead>
            <tr>
              <th />
              {list.map((b) => (
                <th key={b.id} title={b.name} style={{ color: ROLE_COLOR[b.role] }}>
                  {b.name.slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id}>
                <th style={{ color: ROLE_COLOR[a.role] }}>{a.name}</th>
                {list.map((b) => {
                  const x = a.opinions[b.id];
                  return a.id === b.id || x === undefined ? (
                    <td key={b.id} className="opinions__self" />
                  ) : (
                    <td key={b.id} style={{ background: opinionColor(x) }} title={`${a.name} → ${b.name} : ${x.toFixed(2)}`}>
                      {x > 0 ? '+' : ''}
                      {x.toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="panel__foot">Ligne = ce que cette personne pense de chaque colonne.</p>
    </Panel>
  );
}

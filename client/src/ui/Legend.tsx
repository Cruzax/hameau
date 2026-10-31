import { useState } from 'react';
import { ROLE_COLOR, ROLE_LABEL } from '@hameau/shared';
import { useHameau } from '../net/store';

/** -1 (rouge) → 0 (crème) → +1 (vert). */
function opinionColor(x: number) {
  const t = Math.max(-1, Math.min(1, x));
  const [r, g, b] = t < 0 ? [200 + 30 * (1 + t), 85 + 150 * (1 + t), 61 + 160 * (1 + t)] : [230 - 140 * t, 235 - 81 * t, 221 - 147 * t];
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}

export function Legend() {
  const agents = useHameau((s) => s.world.agents);
  const roads = useHameau((s) => s.world.roads);
  const mayorId = useHameau((s) => s.world.mayorId);
  const [showOpinions, setShowOpinions] = useState(true);
  const list = Object.values(agents);
  const openRoads = Object.values(roads).filter((r) => r.status === 'open').length;

  return (
    <div className="legend">
      {list.map((a) => (
        <div key={a.id} className="legend__row">
          <span className="legend__dot" style={{ background: ROLE_COLOR[a.role] }} />
          <span>
            <strong>{a.name}</strong> — {ROLE_LABEL[a.role]}
            {mayorId === a.id ? ' 👑' : ''}
            {a.family?.partnerId && agents[a.family.partnerId] ? ` 💞 ${agents[a.family.partnerId].name}` : ''}
            {a.family?.parentIds.length ? ' 👶' : ''}
          </span>
        </div>
      ))}

      <button className="legend__toggle" onClick={() => setShowOpinions(!showOpinions)}>
        {showOpinions ? '▾' : '▸'} Ce qu’ils pensent les uns des autres
      </button>
      {showOpinions && (
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
      )}
      <div className="legend__hint">{openRoads} routes ouvertes · glisser pour tourner, molette pour zoomer</div>
    </div>
  );
}

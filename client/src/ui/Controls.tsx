import { formatHour, isNight, SEASON_ICON, SEASON_LABEL, seasonOf, villageHour } from '@hameau/shared';
import { useHameau } from '../net/store';
import { Estimate } from './Estimate';

const SPEEDS = [1, 2, 4, 8];


export function Controls() {
  const clock = useHameau((s) => s.world.clock);
  const connected = useHameau((s) => s.connected);
  const send = useHameau((s) => s.send);

  return (
    <div className="controls">
      <span className={`controls__dot ${connected ? 'is-on' : ''}`} title={connected ? 'Simulation connectée' : 'Serveur hors ligne'} />
      <span className="controls__time">
        <span title={SEASON_LABEL[seasonOf(clock.day)]}>{SEASON_ICON[seasonOf(clock.day)]}</span> Jour {clock.day} · {isNight(clock) ? '🌙' : '☀️'} {formatHour(villageHour(clock.tick, clock.ticksPerDay))}
      </span>
      <button disabled={!connected} onClick={() => send({ type: clock.paused ? 'god.resume' : 'god.pause' })}>
        {clock.paused ? '▶' : '⏸'}
      </button>
      {SPEEDS.map((s) => (
        <button key={s} disabled={!connected} className={clock.speed === s ? 'is-active' : ''} onClick={() => send({ type: 'god.speed', speed: s })}>
          ×{s}
        </button>
      ))}
      <Estimate />
    </div>
  );
}

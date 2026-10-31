import { useHameau } from '../net/store';
import { BrainMenu } from './BrainMenu';

const SPEEDS = [1, 2, 4, 8];

/** Heure du village : la journée simulée court de 6 h à 22 h. */
function villageTime(tick: number, ticksPerDay: number) {
  const minutes = 6 * 60 + Math.floor(((tick % ticksPerDay) / ticksPerDay) * 16 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function Controls() {
  const clock = useHameau((s) => s.world.clock);
  const connected = useHameau((s) => s.connected);
  const send = useHameau((s) => s.send);

  return (
    <div className="controls">
      <span className={`controls__dot ${connected ? 'is-on' : ''}`} title={connected ? 'Simulation connectée' : 'Serveur hors ligne'} />
      <span className="controls__time">
        Jour {clock.day} · {villageTime(clock.tick, clock.ticksPerDay)}
      </span>
      <button disabled={!connected} onClick={() => send({ type: clock.paused ? 'god.resume' : 'god.pause' })}>
        {clock.paused ? '▶' : '⏸'}
      </button>
      {SPEEDS.map((s) => (
        <button key={s} disabled={!connected} className={clock.speed === s ? 'is-active' : ''} onClick={() => send({ type: 'god.speed', speed: s })}>
          ×{s}
        </button>
      ))}
      <BrainMenu />
    </div>
  );
}

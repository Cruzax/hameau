import { useHameau } from '../net/store';
import { useUI } from './uiStore';

const SPEEDS = [1, 2, 4, 8];

/** Heure du village : la journée simulée court de 6 h à 22 h. */
function villageTime(tick: number, ticksPerDay: number) {
  const minutes = 6 * 60 + Math.floor(((tick % ticksPerDay) / ticksPerDay) * 16 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

const kTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export function Controls() {
  const clock = useHameau((s) => s.world.clock);
  const llm = useHameau((s) => s.world.llm);
  const connected = useHameau((s) => s.connected);
  const send = useHameau((s) => s.send);
  const ui = useUI();

  return (
    <div className="controls">
      <span className={`controls__dot ${connected ? 'is-on' : ''}`} title={connected ? 'Simulation connectée' : 'Serveur hors ligne'} />
      <span className="controls__time">{villageTime(clock.tick, clock.ticksPerDay)}</span>
      <button disabled={!connected} onClick={() => send({ type: clock.paused ? 'god.resume' : 'god.pause' })}>
        {clock.paused ? '▶' : '⏸'}
      </button>
      {SPEEDS.map((s) => (
        <button key={s} disabled={!connected} className={clock.speed === s ? 'is-active' : ''} onClick={() => send({ type: 'god.speed', speed: s })}>
          ×{s}
        </button>
      ))}
      <span
        className={`controls__llm ${llm.budget.callsToday >= llm.budget.maxCallsPerDay ? 'is-exhausted' : ''}`}
        title={`Fournisseur : ${llm.provider}${llm.provider === 'mock' ? ' (tokens estimés, 0 €)' : ''} · max_tokens ${llm.budget.maxTokens}`}
      >
        🧠 {llm.provider} · {llm.budget.callsToday}/{llm.budget.maxCallsPerDay} · {kTokens(llm.budget.tokensIn)}↓ {kTokens(llm.budget.tokensOut)}↑
      </span>
      <button className={ui.godOpen ? 'is-active' : ''} onClick={() => ui.set({ godOpen: !ui.godOpen })} title="Touche G">
        ⚡ Dieu
      </button>
      <button onClick={() => ui.set({ capture: true, shot: 'survol' })} title="Touche C">
        🎬 Capture
      </button>
    </div>
  );
}

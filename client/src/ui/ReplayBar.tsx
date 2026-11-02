import { useHameau } from '../net/store';
import { setReplaySpeed, stopReplay, toggleReplayPause } from '../net/replay';

/** Barre de lecture du replay. */
export function ReplayBar() {
  const replay = useHameau((s) => s.replay);
  const mode = useHameau((s) => s.mode);
  if (mode !== 'replay' || !replay) return null;
  const pct = Math.min(100, Math.max(0, (replay.tick / Math.max(1, replay.endTick)) * 100));

  return (
    <div className="replaybar">
      <strong>⏪ Replay</strong>
      <button onClick={toggleReplayPause}>{replay.paused ? '▶' : '⏸'}</button>
      {[1, 2, 4].map((s) => (
        <button key={s} className={replay.speed === s ? 'is-active' : ''} onClick={() => setReplaySpeed(s)}>
          ×{s}
        </button>
      ))}
      <span className="replaybar__track">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="replaybar__tick">tick {Math.floor(replay.tick)} / {replay.endTick}</span>
      <button onClick={() => stopReplay()}>■ Retour au direct</button>
    </div>
  );
}

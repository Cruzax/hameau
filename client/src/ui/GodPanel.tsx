import { useState } from 'react';
import { ROLE_LABEL, type Role } from '@hameau/shared';
import { useHameau } from '../net/store';
import { useUI } from './uiStore';

const PRESETS = [
  'Un orage violent s’abat sur le village',
  'Scandale : des fonds de la mairie ont disparu',
  'Un trésor a été trouvé au fond du puits',
  'Un étranger mystérieux rôde près du pont',
  'La rivière a débordé pendant la nuit',
];
const NEW_ROLES: Role[] = ['CITOYEN', 'MENTEUR', 'ECLAIREUR', 'ECRIVAIN', 'EDITEUR', 'LECTEUR'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="god__section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** Panneau « Dieu » : agir sur le monde. Chaque action est envoyée au serveur et journalisée. */
export function GodPanel() {
  const open = useUI((s) => s.godOpen);
  const setUI = useUI((s) => s.set);
  const world = useHameau((s) => s.world);
  const send = useHameau((s) => s.send);
  const connected = useHameau((s) => s.connected);

  const [eventText, setEventText] = useState('');
  const [roadA, setRoadA] = useState('');
  const [roadB, setRoadB] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<Role>('MENTEUR');
  const [newTraits, setNewTraits] = useState('');
  const [near, setNear] = useState('');
  const [who, setWho] = useState('');
  const [about, setAbout] = useState('');

  if (!open) return null;

  const agents = Object.values(world.agents);
  const houses = Object.values(world.houses);
  const houseLabel = (id: string) => {
    const owner = world.houses[id]?.ownerId;
    return owner && world.agents[owner] ? world.agents[owner].name : 'maison vide';
  };
  const voteOpen = world.votes.some((v) => v.status === 'open');

  return (
    <aside className="god">
      <header className="god__head">
        <strong>⚡ Mode Dieu</strong>
        <button onClick={() => setUI({ godOpen: false })}>✕</button>
      </header>
      {!connected && <p className="god__warn">Serveur hors ligne : lance « npm run dev ».</p>}

      <Section title="Éléments">
        <div className="god__row">
          {(
            [
              ['storm', '⛈ Orage'],
              ['flood', '🌊 Crue'],
              ['well', '✨ Puits'],
            ] as const
          ).map(([kind, label]) => (
            <button key={kind} disabled={world.effects?.some((e) => e.kind === kind)} onClick={() => send({ type: 'god.effect', kind })}>
              {label}
            </button>
          ))}
        </div>
        <p className="god__hint">La crue submerge les ponts, l’orage ralentit les messagers. Les agents réagissent.</p>
      </Section>

      <Section title="Routes">
        <p className="god__hint">Astuce : clique directement sur une route dans le village pour la couper.</p>
        <ul className="god__list">
          {Object.values(world.roads).map((r) => (
            <li key={r.id}>
              <span className={r.status === 'cut' ? 'is-cut' : ''}>
                {houseLabel(r.a)} ↔ {houseLabel(r.b)}
              </span>
              <button onClick={() => send({ type: 'god.road.cut', roadId: r.id })}>{r.status === 'open' ? '✂️ Couper' : '🛠 Rouvrir'}</button>
            </li>
          ))}
        </ul>
        <div className="god__row">
          <select value={roadA} onChange={(e) => setRoadA(e.target.value)}>
            <option value="">De…</option>
            {houses.map((h) => <option key={h.id} value={h.id}>{houseLabel(h.id)}</option>)}
          </select>
          <select value={roadB} onChange={(e) => setRoadB(e.target.value)}>
            <option value="">À…</option>
            {houses.map((h) => <option key={h.id} value={h.id}>{houseLabel(h.id)}</option>)}
          </select>
          <button disabled={!roadA || !roadB || roadA === roadB} onClick={() => send({ type: 'god.road.add', a: roadA, b: roadB })}>
            🛤 Tracer
          </button>
        </div>
      </Section>

      <Section title="Événement">
        <div className="god__presets">
          {PRESETS.map((p) => (
            <button key={p} onClick={() => setEventText(p)}>{p}</button>
          ))}
        </div>
        <textarea rows={2} value={eventText} placeholder="Ce qui arrive au village…" onChange={(e) => setEventText(e.target.value)} />
        <button
          className="god__primary"
          disabled={!eventText.trim()}
          onClick={() => {
            send({ type: 'god.inject', text: eventText.trim() });
            setEventText('');
          }}
        >
          ⚡ Déclencher
        </button>
      </Section>

      <Section title="Habitants">
        <ul className="god__list">
          {agents.map((a) => (
            <li key={a.id}>
              <span>
                {a.name} — {ROLE_LABEL[a.role]}
                {a.id === world.mayorId ? ' 👑' : ''}
              </span>
              <button disabled={agents.length <= 2} onClick={() => send({ type: 'god.agent.exile', agentId: a.id })}>🧳 Exiler</button>
            </li>
          ))}
        </ul>
        <div className="god__form">
          <input value={newName} placeholder="Prénom" onChange={(e) => setNewName(e.target.value)} />
          <select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
            {NEW_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <input value={newTraits} placeholder="Traits (séparés par des virgules)" onChange={(e) => setNewTraits(e.target.value)} />
          <select value={near} onChange={(e) => setNear(e.target.value)}>
            <option value="">S’installe près de…</option>
            {houses.map((h) => <option key={h.id} value={h.id}>{houseLabel(h.id)}</option>)}
          </select>
          <button
            className="god__primary"
            disabled={!newName.trim() || !near}
            onClick={() => {
              const traits = newTraits.split(',').map((t) => t.trim()).filter(Boolean);
              send({
                type: 'god.agent.add',
                near,
                agent: { name: newName.trim(), role: newRole, ...(traits.length ? { personality: { traits, tone: '', honesty: newRole === 'MENTEUR' ? 0.1 : 0.7, ambition: 0.5 } } : {}) },
              });
              setNewName('');
              setNewTraits('');
            }}
          >
            🏡 Faire venir
          </button>
        </div>
      </Section>

      <Section title="Politique">
        <button className="god__primary" disabled={voteOpen} onClick={() => send({ type: 'god.vote.force' })}>
          🗳️ Convoquer un conseil maintenant
        </button>
        <p className="god__hint">Souffler une idée à l’oreille de quelqu’un :</p>
        <div className="god__row">
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Qui…</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={about} onChange={(e) => setAbout(e.target.value)}>
            <option value="">…pense de</option>
            {agents.filter((a) => a.id !== who).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="god__row">
          <button disabled={!who || !about} onClick={() => send({ type: 'god.opinion', who, about, delta: -0.3 })}>💔 Méfiance</button>
          <button disabled={!who || !about} onClick={() => send({ type: 'god.opinion', who, about, delta: 0.3 })}>💚 Confiance</button>
        </div>
      </Section>
    </aside>
  );
}

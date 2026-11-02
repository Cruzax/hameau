import { useState } from 'react';
import { WORKPLACE_LABEL } from '../scene/House';
import { attracted, ROLE_LABEL, type Agent, type EffectKind, type Role, type WorkplaceKind } from '@hameau/shared';
import { useHameau } from '../net/store';
import { Panel } from './Panel';
import { useUI } from './uiStore';

// Mode Dieu, en quatre onglets. Les actions sur une personne précise sont aussi dans sa fiche (clic sur sa maison).

type Tab = 'ciel' | 'fortune' | 'habitants' | 'pouvoir';
const TABS: [Tab, string, string][] = [
  ['ciel', '☁️', 'Ciel'],
  ['fortune', '💰', 'Fortune'],
  ['habitants', '👥', 'Habitants'],
  ['pouvoir', '🏛', 'Pouvoir'],
];

const SKY: [EffectKind, string, string][] = [
  ['storm', '⛈ Orage', 'Ralentit les messagers, rend malade.'],
  ['flood', '🌊 Crue', 'Submerge les ponts pour un moment.'],
  ['tornado', '🌪 Tornade', 'Emporte une maison au hasard.'],
  ['well', '✨ Puits magique', 'Le puits de la place s’illumine.'],
];

const NEW_ROLES: Role[] = ['CITOYEN', 'MENTEUR', 'VOLEUR', 'ECLAIREUR', 'ECRIVAIN', 'EDITEUR', 'LECTEUR'];
const SHOPS: WorkplaceKind[] = ['ferme', 'moulin', 'scierie', 'boulangerie', 'forge'];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="god__section">
      <h3>{title}</h3>
      {hint && <p className="god__hint">{hint}</p>}
      {children}
    </section>
  );
}

/** Liste déroulante d'habitants. */
function PersonSelect({ value, onChange, people, placeholder }: { value: string; onChange: (id: string) => void; people: Agent[]; placeholder: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {people.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
}

export function GodPanel() {
  const world = useHameau((s) => s.world);
  const send = useHameau((s) => s.send);
  const connected = useHameau((s) => s.connected);
  const godTool = useUI((s) => s.godTool);
  const setUI = useUI((s) => s.set);
  const [tab, setTab] = useState<Tab>('ciel');

  const [shop, setShop] = useState<WorkplaceKind>('ferme');
  const [loverA, setLoverA] = useState('');
  const [loverB, setLoverB] = useState('');
  const [accused, setAccused] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<Role>('CITOYEN');
  const [who, setWho] = useState('');
  const [about, setAbout] = useState('');

  const agents = Object.values(world.agents).sort((a, b) => a.name.localeCompare(b.name));
  const singles = agents.filter((a) => !a.family?.partnerId);
  const a = world.agents[loverA];
  const matches = a ? singles.filter((b) => b.id !== a.id && attracted(a, b) && attracted(b, a)) : [];
  const voteOpen = world.votes.some((v) => v.status === 'open');
  const plaza = Object.values(world.houses).find((h) => h.id.startsWith('place-'));

  return (
    <Panel id="dieu" icon="⚡" title="Mode Dieu" minW={280}>
      <div className="god">
        {!connected && <p className="god__warn">Simulation hors ligne.</p>}
        <nav className="god__tabs" role="tablist">
          {TABS.map(([id, icon, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>
              <span aria-hidden>{icon}</span> {label}
            </button>
          ))}
        </nav>

        {tab === 'ciel' && (
          <Section title="Déchaîner les éléments" hint="Orages, crues et tornades arrivent aussi tout seuls, de temps en temps.">
            <div className="god__cards">
              {SKY.map(([kind, label, hint]) => (
                <button key={kind} className="god__card" disabled={world.effects?.some((e) => e.kind === kind)} onClick={() => send({ type: 'god.effect', kind })}>
                  <strong>{label}</strong>
                  <span>{hint}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {tab === 'fortune' && (
          <>
            <Section title="Coffre au trésor" hint="Pose-le où tu veux sur la carte : le premier qui passe à côté touche le jackpot (80 pièces).">
              <button className={`god__primary ${godTool === 'treasure' ? 'is-armed' : ''}`} onClick={() => setUI({ godTool: godTool === 'treasure' ? null : 'treasure' })}>
                {godTool === 'treasure' ? '✋ Clique sur la carte… (annuler)' : '💰 Poser un trésor'}
              </button>
              {(world.treasures?.length ?? 0) > 0 && <p className="god__hint">{world.treasures!.length} coffre{world.treasures!.length > 1 ? 's' : ''} attend{world.treasures!.length > 1 ? 'ent' : ''} d’être trouvé{world.treasures!.length > 1 ? 's' : ''}.</p>}
            </Section>
            <Section title="Coups du sort">
              <div className="god__cards">
                <button className="god__card" onClick={() => send({ type: 'god.harvest' })}>
                  <strong>🌾 Récolte miracle</strong>
                  <span>Trois pains pour chaque habitant.</span>
                </button>
                <button className="god__card" onClick={() => send({ type: 'god.crash' })}>
                  <strong>📉 Krach</strong>
                  <span>Caisses vides, économies fondues.</span>
                </button>
              </div>
            </Section>
            <Section title="Ouvrir un commerce" hint="Tenu par le village : il embauche tout de suite.">
              <div className="god__row">
                <select value={shop} onChange={(e) => setShop(e.target.value as WorkplaceKind)}>
                  {SHOPS.map((k) => <option key={k} value={k}>{WORKPLACE_LABEL[k] ?? k}</option>)}
                </select>
                <button onClick={() => send({ type: 'god.workplace.open', kind: shop })}>🏗 Ouvrir</button>
              </div>
            </Section>
            <p className="god__hint god__note">Pour donner ou reprendre de l’argent à quelqu’un : clique sur sa maison.</p>
          </>
        )}

        {tab === 'habitants' && (
          <>
            <Section title="Coup de foudre" hint="Seulement entre célibataires qui peuvent s’attirer.">
              <div className="god__row">
                <PersonSelect value={loverA} onChange={(id) => { setLoverA(id); setLoverB(''); }} people={singles} placeholder="Qui…" />
                <PersonSelect value={loverB} onChange={setLoverB} people={matches} placeholder={a ? (matches.length ? '…tombe pour' : 'personne de libre') : '…tombe pour'} />
              </div>
              <button className="god__primary" disabled={!loverA || !loverB} onClick={() => { send({ type: 'god.love', a: loverA, b: loverB }); setLoverA(''); setLoverB(''); }}>💘 Décocher la flèche</button>
            </Section>
            <Section title="Coup monté" hint="Une bourse disparaît et tous les soupçons tombent sur… Procès le lendemain soir.">
              <div className="god__row">
                <PersonSelect value={accused} onChange={setAccused} people={agents} placeholder="Qui accuser…" />
                <button disabled={!accused} onClick={() => { send({ type: 'god.accuse', agentId: accused }); setAccused(''); }}>⚖️ Accuser</button>
              </div>
            </Section>
            <Section title="Faire venir quelqu’un" hint="Une nouvelle tête s’installe près de la place.">
              <div className="god__row">
                <input value={newName} placeholder="Prénom" onChange={(e) => setNewName(e.target.value)} />
                <select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
                  {NEW_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </div>
              <button
                className="god__primary"
                disabled={!newName.trim() || !plaza}
                onClick={() => {
                  send({ type: 'god.agent.add', near: plaza!.id, agent: { name: newName.trim(), role: newRole } });
                  setNewName('');
                }}
              >
                🏡 Faire venir
              </button>
            </Section>
            <p className="god__hint god__note">Exiler, enrichir ou ruiner quelqu’un : clique sur sa maison.</p>
          </>
        )}

        {tab === 'pouvoir' && (
          <>
            <Section title="Conseil du village">
              <button className="god__primary" disabled={voteOpen} onClick={() => send({ type: 'god.vote.force' })}>
                🗳️ {voteOpen ? 'Un conseil est déjà réuni' : 'Convoquer un conseil maintenant'}
              </button>
            </Section>
            <Section title="Souffler à l’oreille" hint="Change ce qu’une personne pense d’une autre.">
              <div className="god__row">
                <PersonSelect value={who} onChange={setWho} people={agents} placeholder="Qui…" />
                <PersonSelect value={about} onChange={setAbout} people={agents.filter((x) => x.id !== who)} placeholder="…pense de" />
              </div>
              <div className="god__row">
                <button disabled={!who || !about} onClick={() => send({ type: 'god.opinion', who, about, delta: -0.3 })}>💔 Méfiance</button>
                <button disabled={!who || !about} onClick={() => send({ type: 'god.opinion', who, about, delta: 0.3 })}>💚 Confiance</button>
              </div>
            </Section>
            <Section title="Routes" hint="Clique sur une route dans le village pour la couper ou la rouvrir.">{null}</Section>
          </>
        )}
      </div>
    </Panel>
  );
}

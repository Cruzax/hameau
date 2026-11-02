import { de, dist, isDwelling, pointAlong, type Agent, type EffectKind, type HouseId, type Treasure, type Vec2 } from '@hameau/shared';
import type { Sim } from './Sim';

// Ce qui tombe du ciel : la météo qui arrive toute seule, la tornade qui emporte une maison, les coffres au trésor.

/** Jours de chantier avant qu'une maison détruite soit rebâtie. */
export const REBUILD_DAYS = 3;
/** Ce que coûte la reconstruction au propriétaire, s'il en a les moyens (le reste, les voisins s'en chargent). */
const REBUILD_COST = 10;
/** Distance à laquelle un passant remarque un coffre. */
const TREASURE_RADIUS = 5;
/** Un coffre que personne ne croise finit trouvé par le voisin le plus proche, au bout d'un jour. */
const TREASURE_FALLBACK_DAYS = 1;
export const TREASURE_AMOUNT = 80;

/** Chances par jour, quand rien d'autre n'est prévu. */
const STORM_CHANCE = 0.12;
const FLOOD_AFTER_STORM = 0.25;
const FLOOD_CHANCE = 0.01;
const TORNADO_CHANCE = 0.015;
/** Pas de tornade dans un hameau tout neuf. */
const TORNADO_MIN_DAY = 5;
const TORNADO_MIN_HOUSES = 4;

const inv = (a: Agent) => (a.inventory ??= { pain: 1, bois: 1, outils: 0, pieces: 5 });

/** Où rentre un habitant le soir : chez lui, ou chez qui l'héberge. */
export const homeOf = (a: Agent): HouseId => a.lodging ?? a.houseId;

/** Les maisons qu'une tornade peut viser : habitées et debout. */
function targets(sim: Sim) {
  return Object.values(sim.world.houses).filter((h) => isDwelling(h) && h.ownerId && !h.ruined && h.style !== 'mairie');
}

/** Le matin : quel temps fera-t-il aujourd'hui ? Au plus un phénomène par jour, à une heure tirée au sort. */
export function planWeather(sim: Sim): { kind: EffectKind; hour: number } | null {
  const day = sim.clock.day;
  const r = Math.random();
  const stormYesterday = sim.journal.events.some((e) => e.type === 'world.effect' && e.day >= day - 1 && (e.payload as { effect?: { kind?: string } }).effect?.kind === 'storm');
  let kind: EffectKind | null = null;
  if (day >= TORNADO_MIN_DAY && targets(sim).length >= TORNADO_MIN_HOUSES && r < TORNADO_CHANCE) kind = 'tornado';
  else if (Math.random() < (stormYesterday ? FLOOD_AFTER_STORM : FLOOD_CHANCE)) kind = 'flood';
  else if (Math.random() < STORM_CHANCE) kind = 'storm';
  return kind ? { kind, hour: 9 + Math.floor(Math.random() * 10) } : null;
}

/** Trajet de la tornade : elle traverse le village en ligne droite et passe sur la maison visée à mi-chemin. */
export function tornadoTrack(sim: Sim): { path: Vec2[]; houseId: HouseId } | null {
  const list = targets(sim);
  if (!list.length) return null;
  const h = list[Math.floor(Math.random() * list.length)];
  const angle = Math.random() * Math.PI * 2;
  const reach = 45;
  const d = { x: Math.cos(angle) * reach, z: Math.sin(angle) * reach };
  return { path: [{ x: h.position.x - d.x, z: h.position.z - d.z }, h.position, { x: h.position.x + d.x, z: h.position.z + d.z }], houseId: h.id };
}

/** La tornade frappe : la maison tombe, ses habitants sont hébergés chez un proche. */
export function wreckHouse(sim: Sim, houseId: HouseId) {
  const w = sim.world;
  const h = w.houses[houseId];
  if (!h || h.ruined) return;
  h.ruined = { sinceDay: sim.clock.day, rebuildDay: sim.clock.day + REBUILD_DAYS };
  const occupants = Object.values(w.agents).filter((a) => a.houseId === houseId);
  const hosted: string[] = [];
  for (const a of occupants) {
    const ip = inv(a);
    ip.pain = Math.floor(ip.pain / 2);
    ip.bois = Math.floor(ip.bois / 2);
    if (a.needs) a.needs.humeur = Math.max(0, a.needs.humeur - 0.3);
    const host = hostFor(sim, a, houseId);
    if (!host) continue;
    a.lodging = host.houseId;
    sim.adjustOpinion(a.id, host.id, 0.15);
    sim.adjustOpinion(host.id, a.id, 0.05);
    if (!hosted.includes(host.name)) hosted.push(host.name);
  }
  const names = occupants.map((a) => a.name);
  const who = names.length ? names.join(' et ') : 'personne';
  const where = hosted.length ? ` Hébergement chez ${hosted.join(' et ')} le temps de rebâtir.` : '';
  sim.emit('house.destroyed', occupants.map((a) => a.id), `🌪 La tornade emporte la maison ${de(who)} !${where}`, { houseId, hosts: hosted });
  sim.broadcastPatch({ houses: w.houses });
  sim.touchAgents();
}

/** Qui héberge : la famille d'abord, puis la personne qu'on apprécie le plus, dans une maison encore debout. */
function hostFor(sim: Sim, a: Agent, ruined: HouseId) {
  const w = sim.world;
  const standing = Object.values(w.agents).filter((x) => x.houseId !== ruined && !w.houses[x.houseId]?.ruined && !x.lodging);
  const kin = new Set([...(a.family?.parentIds ?? []), ...(a.family?.childIds ?? [])]);
  return standing.sort((x, y) => (kin.has(y.id) ? 2 : 0) + (a.opinions[y.id] ?? 0) - ((kin.has(x.id) ? 2 : 0) + (a.opinions[x.id] ?? 0)))[0];
}

/** Le soir : les chantiers terminés rendent leur maison à leurs habitants. */
export function rebuildRuins(sim: Sim) {
  const w = sim.world;
  for (const h of Object.values(w.houses)) {
    if (!h.ruined || h.ruined.rebuildDay > sim.clock.day) continue;
    delete h.ruined;
    const occupants = Object.values(w.agents).filter((a) => a.houseId === h.id);
    const owner = h.ownerId ? w.agents[h.ownerId] : undefined;
    if (owner) inv(owner).pieces -= Math.min(REBUILD_COST, inv(owner).pieces);
    for (const a of occupants) delete a.lodging;
    // Les voisins qui ont prêté main-forte gagnent un peu d'estime.
    const helpers = Object.values(w.agents).filter((x) => !occupants.includes(x)).sort(() => Math.random() - 0.5).slice(0, 3);
    for (const x of helpers) for (const a of occupants) sim.adjustOpinion(a.id, x.id, 0.1);
    const who = occupants.map((a) => a.name).join(' et ') || 'personne';
    const crew = helpers.map((x) => x.name);
    sim.emit('house.rebuilt', occupants.map((a) => a.id),
      `🔨 La maison ${de(who)} est rebâtie${crew.length ? `, avec l’aide de ${crew.join(', ')}` : ''}. Retour à la maison !`, { houseId: h.id });
  }
  // Un hébergeur parti ou dont la maison est tombée : on rentre chez soi.
  for (const a of Object.values(w.agents)) if (a.lodging && (!w.houses[a.lodging] || w.houses[a.lodging].ruined)) delete a.lodging;
  sim.broadcastPatch({ houses: w.houses });
  sim.touchAgents();
}

// ─── Trésor ──────────────────────────────────────────────────────────────────

export function placeTreasure(sim: Sim, position: Vec2) {
  const w = sim.world;
  const t: Treasure = { id: `tresor-${sim.clock.tick}-${(w.treasures ?? []).length}`, position, amount: TREASURE_AMOUNT, placedTick: sim.clock.tick };
  (w.treasures ??= []).push(t);
  sim.emit('treasure.placed', [], '✨ Quelque chose brille dans l’herbe, quelque part au village…', { treasureId: t.id, position });
  sim.broadcastPatch({ treasures: w.treasures });
}

/** Où marche un habitant en ce moment (null s'il ne marche pas : on ne trouve un coffre qu'en passant à côté). */
function walkingAt(sim: Sim, a: Agent): Vec2 | null {
  const l = a.location;
  if (l?.kind !== 'walking') return null;
  return pointAlong(l.path, Math.min(1, ((sim.clock.tick - l.startTick) * l.speed) / Math.max(l.length, 0.001))).p;
}

/** À chaque tick : un passant tombe-t-il sur un coffre ? */
export function checkTreasures(sim: Sim) {
  const w = sim.world;
  if (!w.treasures?.length) return;
  for (const t of [...w.treasures]) {
    let finder: Agent | undefined;
    // Le coffre brille au moins une heure avant que quelqu'un tombe dessus.
    if (sim.clock.tick - t.placedTick < sim.clock.ticksPerDay / 24) continue;
    for (const a of Object.values(w.agents)) {
      const p = walkingAt(sim, a);
      if (p && dist(p, t.position) <= TREASURE_RADIUS) {
        finder = a;
        break;
      }
    }
    // Personne n'est passé par là : le voisin le plus proche finit par le remarquer.
    if (!finder && sim.clock.tick - t.placedTick >= TREASURE_FALLBACK_DAYS * sim.clock.ticksPerDay) {
      finder = Object.values(w.agents).sort((x, y) => dist(w.houses[homeOf(x)]?.position ?? t.position, t.position) - dist(w.houses[homeOf(y)]?.position ?? t.position, t.position))[0];
    }
    if (finder) foundTreasure(sim, finder, t);
  }
}

function foundTreasure(sim: Sim, a: Agent, t: Treasure) {
  const w = sim.world;
  w.treasures = (w.treasures ?? []).filter((x) => x.id !== t.id);
  inv(a).pieces += t.amount;
  if (a.needs) a.needs.humeur = 1;
  sim.remember(a.id, a.id, 'in', `J’ai trouvé un coffre plein de pièces : ${t.amount} pièces !`);
  // La chance des uns fait des envieux.
  for (const o of Object.values(w.agents)) if (o.id !== a.id && (o.personality.honesty < 0.4 || o.personality.traits.includes('jaloux'))) sim.adjustOpinion(o.id, a.id, -0.08);
  sim.emit('treasure.found', [a.id], `💰 ${a.name} trouve un coffre au trésor : ${t.amount} pièces ! Le jackpot.`, { treasureId: t.id, amount: t.amount });
  sim.broadcastPatch({ treasures: w.treasures });
  sim.touchAgents();
}

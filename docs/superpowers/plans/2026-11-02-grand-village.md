# Grand village (époque ancienne) — plan d'implémentation

> **Pour les agents qui exécutent ce plan :** SOUS-SKILL OBLIGATOIRE : utiliser superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans pour réaliser ce plan tâche par tâche. Les étapes se cochent avec la syntaxe `- [ ]`.

**Objectif :** un village qui part de 4 villageois composés par l'utilisateur, remplit la vallée jusqu'à environ 50 habitants, vit d'un salaire gagné dans des lieux de travail d'époque, se divise entre riches et pauvres (d'où le crime et les changements de maire), publie une gazette seulement quand il se passe quelque chose, et garde des routes propres avec quelques ponts partagés.

**Architecture :**
- Les lieux de travail et les carrefours deviennent des nœuds du réseau, au même titre que les maisons : des entrées de `w.houses` avec un champ `kind`. `Road`, `roadPath`, les trajets à pied et le rendu des routes restent ainsi valables.
- Les messagers suivent un itinéraire de plusieurs routes jusqu'au destinataire ; le relais de maison en maison disparaît.
- L'économie (emplois, production, salaires, faillites, créations de lieux de travail) vit dans un nouveau module serveur, et remplace la logique boulanger/forgeron/bûcheron fondée sur les rôles, dans `daily.ts`.
- La gazette se déclenche à partir d'un score d'importance des événements du jour.

**Pile technique :** TypeScript ; Node + tsx (serveur, ticks, WebSocket) ; Vite + React + React Three Fiber (client) ; zod ; tests avec `node:test` lancés par `tsx --test` (aucune nouvelle dépendance).

**Spécification :** `docs/superpowers/specs/2026-11-02-grand-village-design.md`. La lire avant toute tâche.

## Contraintes globales

- Une journée du village dure **5 minutes réelles en ×1** (12 jours par heure). Les vitesses ×2, ×4 et ×8 restent.
- **Tout fonctionne en mode gratuit**, sans IA. Au plus **un seul villageois** piloté par l'IA, choisi à la création.
- **Pas de sauvegarde** : tout repart de zéro au lancement. Les nouvelles données restent sérialisables en JSON dans `WorldState`.
- **Plafond d'environ 50 habitants** (`MAX_POPULATION` = 50 par défaut). Le terrain reste à `size: 96`.
- Chaque métier et lieu de travail porte `era: 'ancienne'`.
- **Au moins 6 profils** tout prêts (8 visés), et 4 villageois au démarrage.
- **Textes en français, sans « ·e »**, avec des tournures neutres. L'élision passe par `de()` / `que()` de `shared/src/french.ts`.
- **Style visuel** low-poly chaleureux, identique à `client/src/scene/House.tsx`. Pas de maquette grise.
- **Les messages ne voyagent que le long des routes.** Un lieu de travail ne reçoit pas de messages.
- Après chaque tâche, `npm run typecheck` passe à la racine.

## Points de vigilance pour la relecture

1. **Un habitant sans emploi ni argent** doit pouvoir survivre un moment, grâce au potager (1 pain par jour) et aux dons. Il finit par voler ou par trouver du travail, mais il ne meurt pas de faim en silence pendant 50 jours. → test de la tâche 7.
2. **Une faillite qui touche le seul employeur d'un métier vital** (la dernière boulangerie) ne doit pas affamer le village : une nouvelle boulangerie est créée quand plus personne ne cuit de pain. → test de la tâche 8.
3. **Un pont coupé par la crue** (`road.status = 'cut'`) : un message en route vers l'autre rive rebrousse chemin au lieu de rester bloqué, comme aujourd'hui. Un nouveau message cherche un autre pont s'il en existe un. → test de la tâche 4.
4. **Un destinataire qui quitte le village** (banni ou parti) pendant que le messager marche : le message se perd sans planter. Ce cas est déjà géré dans `advanceMessages` et doit le rester avec les itinéraires. → test de la tâche 4.
5. **La vallée pleine** : quand il n'y a plus de place, ni naissance ni nouvel arrivant ne crée de maison flottante ou superposée. Le village cesse de grandir proprement. → test de la tâche 3.

---

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `server/src/test/runVillage.ts` (créé) | Simulation sans écran : lance N jours en mode gratuit et rend le monde et les événements. |
| `server/src/tools/metrics.ts` (créé) | Indicateurs d'un long run (maires, vols, faim, emploi, gazettes, ponts). |
| `shared/src/seed.ts` | Horloge, nouveau monde de départ à partir de 4 fondateurs, ponts de départ. |
| `shared/src/types.ts` | `House.kind`, `Workplace`, `Agent.job`, itinéraire des `Message`, `FounderSpec`. |
| `shared/src/terrain.ts` (créé) | `terrainHeight`, `VALLEY_RADIUS`, `isBuildable` : partagés entre client et serveur. |
| `shared/src/traits.ts` (créé) | Catalogue des traits et des profils, `personalityFromTraits`, `autoRoles`. |
| `server/src/sim/network.ts` (créé) | Raccorder un nœud au réseau, plus court itinéraire entre nœuds, voisinage. |
| `server/src/sim/economy.ts` (créé) | Emplois, production, commerce entre lieux, salaires, embauches, faillites, créations. |
| `server/src/sim/newsworthy.ts` (créé) | Score d'importance des événements, choix de la une. |
| `server/src/sim/god.ts` | `findSpot` étendu à la vallée, création des lieux de travail. |
| `server/src/sim/Sim.ts` | Messages sur itinéraire (sans relais), départ à partir des fondateurs. |
| `server/src/sim/daily.ts` | Retire la logique boulanger/forgeron/bûcheron fondée sur les rôles et appelle `economy`. |
| `server/src/sim/life.ts` | Plafond à 50, maisons raccordées au réseau, suppression de `roadRequests`. |
| `server/src/sim/politics.ts` | Supprime la pénalité « pas de gazette » ; la faim et le chômage pèsent sur le maire. |
| `server/src/agents/scripted.ts`, `server/src/agents/llmBrain.ts` | Gazette déclenchée par un événement, cumul des étapes, un seul agent IA. |
| `client/src/scene/terrainMath.ts`, `Terrain.tsx` | Utilisent `shared/src/terrain.ts` (vallée plus large). |
| `client/src/scene/House.tsx`, `Village.tsx` | Rendu des lieux de travail ; les carrefours ne sont pas dessinés. |
| `client/src/scene/Messengers.tsx` | Messager sur l'étape courante de l'itinéraire. |
| `client/src/ui/StartScreen.tsx` (créé), `Sidebar.tsx`, `BrainMenu.tsx` | Écran de création ; menu 🧠 réduit à un seul agent. |

---

### Tâche 1 : banc d'essai sans écran et horloge à 5 minutes

**Fichiers :**
- Créer : `server/src/test/runVillage.ts`, `server/src/tools/metrics.ts`, `server/src/tools/longrun.ts`, `server/src/test/clock.test.ts`
- Modifier : `server/package.json` (scripts), `shared/src/seed.ts:203` (horloge)

**Interfaces :**
- Produit :
  - `runVillage(opts: { days: number; preset?: VillagePreset }): Promise<{ sim: Sim; events: SimEvent[] }>`. La tâche 9 y ajoute `founders?: FounderSpec[]`.
  - `metrics(events: SimEvent[], w: WorldState): RunMetrics`, avec `RunMetrics = { days; population; mayorChanges; thefts: Record<number, number>; starving: Record<number, number>; gazetteDays: number; jobChanges: number; bridges: number; crossings: number }`. Les compteurs sont regroupés par tranche de 10 jours.
  - Script `npm run longrun -w server -- 120`, qui affiche `metrics` en JSON.

- [ ] **Étape 1 : écrire le test qui échoue** (`server/src/test/clock.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeedWorld } from '@hameau/shared';
test('une journée dure 5 minutes en x1', () => {
  const c = createSeedWorld().clock;
  assert.equal(c.ticksPerDay * c.tickMs, 5 * 60 * 1000);
  assert.equal(c.ticksPerDay, 480); // les durées en ticks gardent leur sens en heures de village
});
test('runVillage fait tourner 3 jours sans planter', async () => {
  const { sim } = await (await import('./runVillage')).runVillage({ days: 3 });
  assert.equal(sim.clock.day, 4);
});
```

- [ ] **Étape 2 : vérifier qu'il échoue**
  - Ajouter `"test": "tsx --test src/**/*.test.ts"` et `"longrun": "tsx src/tools/longrun.ts"` aux scripts de `server/package.json`.
  - Lancer `npm test -w server`. Attendu : ÉCHEC, car 480 × 250 ≠ 300000 et `runVillage` n'existe pas.

- [ ] **Étape 3 : implémenter**
  - Passer `tickMs` à **625** dans `shared/src/seed.ts`.
  - Écrire `runVillage` à partir de ce que faisait le script de test supprimé :
    - construire `new Sim(createLLMBrain(createProvider('mock')), new Journal(<fichier temporaire dans os.tmpdir()>), () => {})` ;
    - appeler `startDay` (le rendre public sous le nom `begin()`, sans timer) ;
    - boucler `sim.tick()` sur `days × ticksPerDay`, avec un `await setImmediate` tous les 4 ticks pour laisser les promesses du cerveau se résoudre.
  - `metrics` compte :
    - les maires : `mayor.elected` sans `kept` ;
    - les vols : `crime.theft` ;
    - la faim : les textes « meurt de faim » ;
    - les gazettes : jours distincts avec `gazette.published` ;
    - les changements d'emploi : `job.changed` (tâche 6) ;
    - les ponts : routes dont le tracé coupe la rivière ;
    - les croisements : paires de routes qui se coupent hors extrémités communes, via `segmentIntersection`.

- [ ] **Étape 4 : lancer les tests.** `npm test -w server` passe ; `npm run typecheck` passe.
- [ ] **Étape 5 : commit** — « Banc d'essai sans écran ; une journée dure 5 minutes ».

---

### Tâche 2 : types des nœuds, des lieux de travail et des emplois

**Fichiers :**
- Modifier : `shared/src/types.ts`, `shared/src/seed.ts`
- Créer : `server/src/test/nodes.test.ts`

**Interfaces :**
- Produit (`shared/src/types.ts`) :
  - `House.kind?: 'maison' | 'travail' | 'carrefour'`. Absent veut dire `'maison'`.
  - `HouseStyle` gagne `'ferme' | 'moulin' | 'scierie'` (`forge`, `boulangerie`, `auberge` et `echoppe` existent déjà) ainsi que `'carrefour'`.
  - `type Era = 'ancienne'`.
  - `type WorkplaceKind = 'ferme' | 'moulin' | 'scierie' | 'forge' | 'boulangerie' | 'auberge' | 'herboristerie'`.
  - `type Good = 'ble' | 'farine' | 'pain' | 'bois' | 'outils'`.
  - `interface Workplace { id: string; kind: WorkplaceKind; era: Era; houseId: HouseId; ownerId: AgentId | null; slots: number; workers: AgentId[]; till: number; stock: Partial<Record<Good, number>>; unpaidDays: number; openedDay: number }`
  - `WorldState.workplaces: Record<string, Workplace>`
  - `Agent.job?: { workplaceId: string; since: number; wage: number }`
  - `Personality` gagne `generosity?`, `diligence?` et `curiosity?` (0..1, optionnels). Absents, ils valent 0,5. La tâche 9 les remplit à partir des traits.
  - `SimEventType` gagne `'job.changed' | 'workplace.opened' | 'workplace.closed'`.
- Produit (`shared/src/seed.ts`) :
  - `isDwelling(h: House): boolean`, vrai si `(h.kind ?? 'maison') === 'maison'`.
  - Tous les endroits qui cherchent une « maison vide » (`!h.ownerId`) passent par `isDwelling` : `life.ts` (arrivées), `god.ts` et `daily.ts` (`richestHouse`, `ownerAt`).

- [ ] **Étape 1 : test** (`server/src/test/nodes.test.ts`). On place un nœud `kind: 'carrefour'` sans propriétaire dans `w.houses`, on force une arrivée (`life['newcomers']` avec la probabilité à 1), et on vérifie que l'arrivant ne s'installe pas dans le carrefour : `assert.notEqual(newAgent.houseId, 'j-test')`.
- [ ] **Étape 2 : vérifier qu'il échoue** (le type `kind` n'existe pas, ou l'arrivant prend le carrefour).
- [ ] **Étape 3 : implémenter** les types, `workplaces: {}` dans `createSeedWorld`, `isDwelling`, et faire passer les recherches de maison vide par `isDwelling`.
- [ ] **Étape 4 : `npm test -w server` et `npm run typecheck` passent.**
- [ ] **Étape 5 : commit** — « Nœuds du réseau : maisons, lieux de travail, carrefours ».

---

### Tâche 3 : une vallée plus large et des emplacements de construction

**Fichiers :**
- Créer : `shared/src/terrain.ts`, `server/src/test/spots.test.ts`
- Modifier : `client/src/scene/terrainMath.ts` (réexporte depuis shared), `server/src/sim/god.ts:63-78` (`findSpot`), `server/src/sim/life.ts:9`

**Interfaces :**
- Produit :
  - `VALLEY_RADIUS = 36` : rayon jusqu'où le sol reste plat. Aujourd'hui les collines montent dès 22 : `smoothstep(22, 40, d)` devient `smoothstep(VALLEY_RADIUS, 46, d)`.
  - `terrainHeight(x, z, terrain)`, déplacée telle quelle dans shared.
  - `isBuildable(p: Vec2, w: WorldState, margin = 0): boolean` : vrai si le point est hors de la place (rayon + 4), hors de la rivière (demi-largeur + 3,5) et à moins de `VALLEY_RADIUS - 3` du centre.
  - `findSpot(sim, near: Vec2, prefer?: (p: Vec2) => number): Vec2 | null` :
    - cherche sur des anneaux de rayon 6 à 14 autour de `near` ;
    - écarte tout point à moins de **5,5** d'un autre nœud ;
    - quand `prefer` est donné, garde le meilleur score parmi les candidats valides (pour les quartiers, en tâche 8).
- `MAX_POPULATION` passe à 50 par défaut.

- [ ] **Étape 1 : tests** (`spots.test.ts`)
  - `isBuildable({x:30,z:0})` est vrai ; `isBuildable({x:44,z:0})` est faux ; un point dans la rivière est faux.
  - Point de vigilance 5 : on remplit avec `findSpot` en boucle jusqu'au premier `null`. Le nombre de nœuds placés est **≥ 55**, et aucune paire de nœuds n'est à moins de 5,5.
- [ ] **Étape 2 : vérifier qu'ils échouent.**
- [ ] **Étape 3 : implémenter.** Le client importe `terrainHeight` depuis `@hameau/shared` ; `Terrain.tsx` reste inchangé.
- [ ] **Étape 4 : tests et typecheck passent.** Ouvrir le site : les collines ont reculé et le centre n'a pas bougé.
- [ ] **Étape 5 : commit** — « Une vallée plus large pour un village de 50 habitants ».

---

### Tâche 4 : un réseau de routes propre et des messagers sur itinéraire

**Fichiers :**
- Créer : `server/src/sim/network.ts`, `server/src/test/network.test.ts`
- Modifier :
  - `shared/src/types.ts` (`Message`) ;
  - `shared/src/seed.ts` (ponts de départ) ;
  - `server/src/sim/Sim.ts` (`send`, `advanceMessages`, `deliver`, suppression de `relay`) ;
  - `server/src/sim/graph.ts` (`neighbors`, `roadBetween`) ;
  - `server/src/sim/life.ts` (supprimer `roadRequests`, `noteRelay` et la route directe des couples) ;
  - `server/src/sim/god.ts` (`buildRoad` reste ; ajouter `connectNode`) ;
  - `client/src/scene/Messengers.tsx`.

**Interfaces :**
- Produit (`network.ts`) :
  - `connectNode(sim: Sim, nodeId: HouseId): RoadId | null` relie le nœud au nœud existant **le plus proche sur la même rive** dont le segment ne coupe ni la rivière ni une route existante (sauf aux extrémités communes). Si aucun ne convient, essaie le suivant ; si rien ne convient, rend `null`.
  - `route(w: WorldState, fromNode: HouseId, toNode: HouseId): { roads: RoadId[]; nodes: HouseId[] } | null` : plus court chemin en longueur (Dijkstra sur `roadLength`), sur les routes `open`.
  - `neighbors(w, agentId): AgentId[]` : habitants dont la maison est à **3 routes au plus**. Ça remplace la version « route directe ».
- Produit (`Message`) :
  - `route: RoadId[]` et `leg: number` remplacent `roadId` et `finalTo`. On garde `progress` (0..1 sur l'étape courante).
  - `legFrom: HouseId` : nœud de départ de l'étape courante, qui donne le sens.
- Produit (seed) : deux ponts de départ. Chaque pont est une route entre deux nœuds `carrefour`, un sur chaque rive. Ils sont placés aux tiers de la rivière, à l'intérieur de la vallée. Les routes écrites en dur dans `createSeedWorld` (presets `origine` et `complet`) sont supprimées : toutes les maisons du monde de départ se raccordent par `connectNode`, dans l'ordre de leur distance à la place.
- Comportement de `send(from, to, …)` :
  - calcule `route` de la maison de `from` à celle de `to` ;
  - sans itinéraire, garde l'événement actuel « injoignable » (repris de l'ancien `nextHop` null) ;
  - ne crée plus jamais d'événement `message.relayed`.
- Comportement de `advanceMessages` :
  - quand l'étape est finie, on passe à la suivante ; après la dernière, `deliver` ;
  - si la route de l'étape courante est `cut`, le message prend `status: 'returned'` et l'expéditeur est prévenu, comme aujourd'hui (point de vigilance 3).
- `Messengers.tsx` dessine le messager sur `orientedRoadPath(road, houses, msg.legFrom)` à `progress`.

- [ ] **Étape 1 : tests** (`network.test.ts`)
  - Monde de départ avec 4 fondateurs (preset `origine` tant que la tâche 9 n'est pas faite), plus 40 nœuds ajoutés par `findSpot` et `connectNode`. Assertions : `metrics(...).crossings === 0` et `bridges === 2`.
  - Message de A à B sur deux rives différentes :
    - `route` contient une route-pont ;
    - après assez de ticks, il y a un `message.delivered` et aucun `message.relayed`.
  - Point de vigilance 3 : on coupe le pont emprunté en plein trajet, et le message finit `returned`.
  - Point de vigilance 4 : on bannit le destinataire en plein trajet ; le message disparaît et aucune exception n'est levée.
- [ ] **Étape 2 : vérifier qu'ils échouent.**
- [ ] **Étape 3 : implémenter.** Toutes les créations de route passent par `connectNode` : nouvelle maison, nouvel arrivant, enfant devenu adulte, ajout d'habitant en mode dieu. Les trajets à pied (`paths.ts`) fonctionnent sans changement, puisque les nœuds restent des `House`.
- [ ] **Étape 4 : tests et typecheck passent.** Sur le site, les messagers suivent plusieurs routes et passent les ponts ; aucun pont ne s'empile.
- [ ] **Étape 5 : commit** — « Réseau de routes avec ponts partagés ; les messagers vont jusqu'au destinataire ».

---

### Tâche 5 : rendu des lieux de travail et des carrefours

**Fichiers :**
- Modifier : `client/src/scene/House.tsx`, `client/src/scene/Village.tsx`, `server/src/sim/god.ts` (`STYLE_BY_ROLE`)

**Interfaces :**
- Consomme : `House.kind` et les nouveaux `HouseStyle` (tâche 2).
- Produit :
  - styles visuels `ferme` (grange basse et champ de blé en carreaux jaunes), `moulin` (tour et ailes qui tournent lentement), `scierie` (hangar ouvert et tas de rondins), dans l'esthétique des maisons actuelles ;
  - les nœuds `carrefour` ne sont pas dessinés (la route suffit) ;
  - les lieux de travail affichent une étiquette avec le nom du lieu, pas un rôle.

- [ ] **Étape 1 : placer à la main un nœud de chaque style dans un monde de test** via `god.ts`, puis ouvrir le site (`npm run dev`).
- [ ] **Étape 2 : vérifier visuellement.** Chaque bâtiment est reconnaissable ; les carrefours sont invisibles ; le moulin tourne ; rien ne flotte (hauteur prise avec `terrainHeight`).
- [ ] **Étape 3 : retirer le placement de test ; `npm run typecheck` passe.**
- [ ] **Étape 4 : commit** — « Ferme, moulin et scierie ; carrefours invisibles ».

---

### Tâche 6 : les emplois et les salaires

**Fichiers :**
- Créer : `server/src/sim/economy.ts`, `server/src/sim/economyConfig.ts`, `server/src/test/jobs.test.ts`
- Modifier : `server/src/sim/daily.ts` (le trajet `travail` va au lieu de travail ; retirer `SALARIED` et les bûcherons par rôle), `shared/src/types.ts` (type d'événement `job.changed`)

**Interfaces :**
- Produit (`economyConfig.ts`), valeurs de départ à régler en tâche 11 :
  - `WAGES: Record<WorkplaceKind, number>` = `{ ferme: 3, moulin: 4, scierie: 4, boulangerie: 5, auberge: 4, herboristerie: 5, forge: 6 }` (pièces par jour travaillé) ;
  - `SLOTS: Record<WorkplaceKind, number>` = `{ ferme: 4, moulin: 2, scierie: 3, boulangerie: 2, auberge: 2, herboristerie: 1, forge: 2 }` ;
  - `WORK_HOURS = [8, 17]`, `SWITCH_IF_BETTER_BY = 2`, `FIRE_AFTER_UNPAID_DAYS = 3`, `FIRE_AFTER_ABSENCES = 3` (sur les 7 derniers jours).
  - Chaque matin, un salarié va au travail avec une probabilité `0.6 + 0.4 × diligence`. Une absence n'est pas payée et compte pour le renvoi (« Lucas est renvoyé de la ferme pour ses absences. »).
- Produit (`economy.ts`) :
  - `class Economy`, avec :
    - `morning(sim)` : embauches ;
    - `evening(sim)` : paie et départs ;
    - `hire(sim, agentId, workplaceId): boolean` ;
    - `quit(sim, agentId, reason: string)` ;
    - `jobOf(w, agentId): Workplace | undefined`.
  - Embauches (matin) :
    - les sans-emploi adultes postulent au lieu qui a une place libre et le meilleur salaire ;
    - un salarié change de lieu si un autre paie au moins `SWITCH_IF_BETTER_BY` de plus ;
    - le maire et les rôles de la gazette peuvent aussi avoir un emploi.
  - Paie (soir) :
    - chaque employé présent dans la journée reçoit `wage`, payé depuis `till` ;
    - si `till` ne suffit pas, le salaire reste impayé (`unpaidDays++` côté lieu de travail) ;
    - après `FIRE_AFTER_UNPAID_DAYS`, le dernier embauché est renvoyé ;
    - le patron (`ownerId`) touche ce qui dépasse 10 pièces dans `till`. C'est la source des riches.
  - Chaque changement émet un `job.changed`, avec un texte neutre : « Gabin est embauché à la scierie (4 pièces par jour). », « Rose perd son emploi au moulin. ».
- `Sim` instancie `economy = new Economy()` et l'appelle depuis `startDay` et `endDay`.

- [ ] **Étape 1 : tests** (`jobs.test.ts`)
  - Un lieu `scierie` avec `till: 100` et un sans-emploi : après `morning`, `agent.job.workplaceId` est la scierie ; après `evening`, l'agent a gagné 4 pièces.
  - `till: 0` pendant 3 soirs : renvoi, `job` est `undefined` et un `job.changed` a été émis.
  - Deux lieux avec des salaires à 3 et à 6 : un salarié du premier part pour le second quand une place s'y libère.
- [ ] **Étape 2 : vérifier qu'ils échouent.**
- [ ] **Étape 3 : implémenter.**
- [ ] **Étape 4 : tests et typecheck passent.**
- [ ] **Étape 5 : commit** — « Emplois et salaires : on gagne sa vie dans un lieu de travail ».

---

### Tâche 7 : production, commerce et pain

**Fichiers :**
- Modifier : `server/src/sim/economy.ts`, `server/src/sim/economyConfig.ts`, `server/src/sim/daily.ts` (l'achat de pain se fait à la boulangerie ; retirer `bake`, `batchSize`, `bestBaker` et la vente de bois entre habitants)
- Créer : `server/src/test/bread.test.ts`

**Interfaces :**
- Produit (`economyConfig.ts`) :
  - `OUTPUT_PER_WORKER = { ferme: { ble: 6 }, scierie: { bois: 4 }, moulin: { farine: 6 /* consomme autant de blé */ }, boulangerie: { pain: 12 /* consomme 4 farine et 2 bois */ }, forge: { outils: 1 /* consomme 1 bois */ } }` ;
  - `PRICES: Record<Good, number> = { ble: 1, farine: 2, bois: 2, outils: 6, pain: 2 }` ;
  - `SUBSISTENCE_BREAD = 1` (potager, par foyer et par jour) ;
  - l'auberge et l'herboristerie vendent des services, payés comme aujourd'hui (`TAVERN_PRICE`, `CARE_PRICE`), et ce revenu va dans leur `till`.
- Produit (`economy.ts`) :
  - `produce(sim)`, en fin de journée de travail : chaque lieu produit selon ses employés présents et les intrants de son `stock` ;
  - `trade(sim)` : chaque lieu achète ses intrants au lieu fournisseur qui a du stock (moulin ← ferme, boulangerie ← moulin et scierie, forge ← scierie), au prix de `PRICES`, de `till` à `till` ;
  - `buyBread(sim, agent): number` : rend le nombre de pains achetés à la boulangerie la mieux fournie, en payant `PRICES.pain` pièce par pièce.
- Garde le don de pain aux affamés sans le sou (le boulanger, puis tout habitant avec `generosity ?? 0.5` d'au moins 0,6 qui a du pain), avec une limite par jour.

- [ ] **Étape 1 : tests** (`bread.test.ts`)
  - Chaîne complète (ferme, moulin, scierie, boulangerie, chacun avec 1 employé et 50 pièces) : après 2 journées simulées, la boulangerie a produit au moins 12 pains, et un habitant avec 4 pièces repart avec 2 pains.
  - Point de vigilance 1 : un habitant sans emploi ni argent reçoit `SUBSISTENCE_BREAD` chaque matin ; sur 10 jours, il émet moins de 6 « meurt de faim ».
- [ ] **Étape 2 : vérifier qu'ils échouent.**
- [ ] **Étape 3 : implémenter.**
- [ ] **Étape 4 : tests et typecheck passent.**
- [ ] **Étape 5 : commit** — « Production et commerce : le blé devient farine, puis pain ».

---

### Tâche 8 : de nouveaux lieux de travail, des faillites et des quartiers

**Fichiers :**
- Modifier : `server/src/sim/economy.ts`, `server/src/sim/god.ts` (`newWorkplace`), `server/src/sim/life.ts` (maisons près du travail)
- Créer : `server/src/test/growth.test.ts`

**Interfaces :**
- Produit :
  - `newWorkplace(sim, kind: WorkplaceKind, founderId: AgentId | null): Workplace | null` : émet `workplace.opened` (« Ouverture d'un moulin au bord de la rivière, tenu par Rose. ») et crée le nœud `kind: 'travail'` avec `findSpot` et une préférence de lieu, le raccorde par `connectNode` et crée la `Workplace`. Préférences :
    - `ferme` : bord de vallée ;
    - `scierie` : près de la forêt (`NATURE_SPOTS`) ;
    - `moulin` : à moins de 6 de la rivière ;
    - les autres : près de la place.
  - Règles de création, chaque soir, une seule création par jour au plus :
    - aucun lieu ne produit de pain alors qu'il y a des habitants → `boulangerie` (point de vigilance 2) ;
    - plus de 2 sans-emploi et aucune place libre → le métier le plus manquant de la chaîne ;
    - le fondateur est le plus riche des habitants qui ont au moins 20 pièces et il les investit ; sinon c'est la caisse du village, et le maire nomme le gérant (`ownerId: null`, le surplus de `till` va au maire).
  - Faillite : `till` à 0 et des salaires impayés pendant 7 jours → le lieu ferme. Tous ses employés perdent leur emploi, un événement `workplace.closed` est émis, et le bâtiment reste vide.
  - Une nouvelle maison (arrivant ou enfant devenu adulte) se place avec `prefer` = proximité du lieu de travail de l'habitant, ou de la place s'il n'a pas d'emploi.

- [ ] **Étape 1 : tests** (`growth.test.ts`)
  - Point de vigilance 2 : on fait faire faillite à la seule boulangerie (`till` 0 et 7 jours impayés). Le soir même, elle ferme ; au plus 2 soirs après, une nouvelle `boulangerie` existe.
  - 6 sans-emploi et aucune place : une création a lieu le soir, son `ownerId` est le plus riche si celui-ci a au moins 20 pièces, et ses pièces ont diminué.
- [ ] **Étape 2 : vérifier qu'ils échouent.**
- [ ] **Étape 3 : implémenter.**
- [ ] **Étape 4 : tests et typecheck passent.**
- [ ] **Étape 5 : commit** — « Le village crée des lieux de travail, certains font faillite ; les maisons se rapprochent du travail ».

---

### Tâche 9 : traits, profils et départ à 4 fondateurs

**Fichiers :**
- Créer : `shared/src/traits.ts`, `server/src/test/founders.test.ts`, `client/src/ui/StartScreen.tsx`
- Modifier :
  - `shared/src/protocol.ts` : `god.reset` reçoit `{ founders: FounderSpec[] }` ;
  - `shared/src/seed.ts` : `createFounderWorld(founders)` ;
  - `server/src/sim/Sim.ts` (`reset`) ;
  - `client/src/ui/Sidebar.tsx` : « Nouvelle histoire » ouvre `StartScreen` et remplace les deux anciens boutons.

**Interfaces :**
- Produit (`traits.ts`) :
  - `type TraitId = 'honnete' | 'menteur' | 'malin' | 'genereux' | 'avare' | 'fouineur' | 'ambitieux' | 'travailleur' | 'paresseux' | 'bavard' | 'grincheux' | 'reveur' | 'tendre'` ;
  - `TRAITS: Record<TraitId, { label: string; incompatible?: TraitId[]; effect: Partial<{ honesty: number; ambition: number; generosity: number; diligence: number; curiosity: number }> }>` ;
  - `PROFILES: { id: string; label: string; emoji: string; traits: TraitId[] }[]`, avec au moins 8 profils : l'honnête travailleur, l'ambitieux, le filou, le cœur tendre, le fouineur, le bavard, le grincheux, le rêveur ;
  - `personalityFromTraits(traits: TraitId[]): Personality`, qui ajoute à `Personality` les champs `generosity`, `diligence` et `curiosity` (0..1) ;
  - `interface FounderSpec { name: string; traits: TraitId[]; role: Role | 'auto'; ai?: boolean }`. Au plus 3 traits, aucun couple incompatible, au plus un `ai: true`.
  - `autoRoles(specs: FounderSpec[]): Role[]` :
    - les rôles fixés sont respectés ;
    - le plus ambitieux restant devient `MAIRE` ;
    - le plus curieux devient `ECLAIREUR`, le suivant `ECRIVAIN` ;
    - le reste devient `CITOYEN`.
  - Les métiers ne sont pas des rôles : ils passent par `job` (tâche 6).
- Produit (seed) : `createFounderWorld(founders)` renvoie 4 maisons autour de la place, raccordées au réseau, les deux ponts, une `ferme` et une `boulangerie` de départ (`ownerId: null`, `till: 40`), et `workplaces` rempli.
- Usage des traits dans la simulation :
  - `generosity` règle le don de pain (tâche 7) ;
  - `diligence` donne la chance d'aller travailler chaque jour (en dessous de 1, des absences, donc moins de paie et un risque de renvoi) ;
  - `curiosity` augmente la chance de trouver un sujet de gazette ;
  - `honesty` intervient déjà dans le vol.
- `StartScreen` :
  - 4 emplacements ; dans chacun, un nom, une rangée de profils à cliquer et une rangée de traits ;
  - un menu rôle « auto » ou rôle choisi, une case « piloté par l'IA » désactivée dès qu'une autre est cochée, et un bouton « au hasard » ;
  - le bouton « Lancer » envoie `god.reset` ;
  - même style que `Panel` et `BrainMenu` (couleurs crème et bordures arrondies déjà définies dans les CSS du client).

- [ ] **Étape 1 : tests** (`founders.test.ts`)
  - `personalityFromTraits(['menteur','malin']).honesty < 0.3`.
  - `autoRoles` sur 4 fondateurs en « auto » donne exactement un `MAIRE`, et c'est celui qui a le trait `ambitieux`.
  - Un `FounderSpec` avec `['honnete','menteur']` est refusé par `validateFounders` (exporté), avec un message en français.
  - `createFounderWorld` donne 4 agents, une boulangerie et une ferme, et `metrics.crossings === 0`.
  - `runVillage({ days: 5, founders })` tourne sans planter.
- [ ] **Étape 2 : vérifier qu'ils échouent.**
- [ ] **Étape 3 : implémenter, serveur puis client.**
- [ ] **Étape 4 : tests et typecheck passent.** Sur le site : composer 4 villageois, lancer, et voir les 4 maisons, la ferme et la boulangerie.
- [ ] **Étape 5 : commit** — « Une histoire commence avec 4 villageois composés par l'utilisateur ».

---

### Tâche 10 : la gazette quand il se passe quelque chose, et la politique qui en découle

**Fichiers :**
- Créer : `server/src/sim/newsworthy.ts`, `server/src/test/gazette.test.ts`
- Modifier :
  - `server/src/sim/Sim.ts` : supprimer `DEADLINE_HOURS` et l'appel à `onDeadline` ;
  - `server/src/agents/llmBrain.ts` et `server/src/agents/scripted.ts` : la tâche du maire part sur événement ; un même agent peut cumuler les étapes ;
  - `server/src/sim/politics.ts` : `onDayEnd` ;
  - `server/src/content/gazette.ts`.

**Interfaces :**
- Produit (`newsworthy.ts`) :
  - `score(e: SimEvent): number`, avec les poids :
    - `mayor.elected` (changement) : 10 ;
    - `trial.verdict` : 8 ;
    - `crime.theft` : 6 ;
    - `workplace.closed` : 6 ;
    - `agent.born` : 5 ;
    - `couple.formed` : 4 ;
    - `agent.left` : 4 ;
    - `job.changed` (renvoi) : 3 ;
    - `workplace.opened` : 4 ;
    - `party` : 3 ;
    - `agent.added` : 3 ;
    - famine (au moins 5 « meurt de faim » dans la journée) : 7 ;
    - le reste : 0.
  - `pickHeadline(events: SimEvent[], alreadyCovered: Set<number>): SimEvent | null` : l'événement non couvert au meilleur score, ou null si ce score est inférieur à **4**.
  - Édition spéciale : un événement de score 10 ou plus déclenche un second numéro le même jour.
- Produit (gazette) :
  - à chaque heure entre 9 h et 18 h, si `pickHeadline` rend un événement et qu'aucun numéro n'est en cours, le maire lance la chaîne (sujet = texte de l'événement) ;
  - `gazetteStaff(w): Record<'ECLAIREUR' | 'ECRIVAIN' | 'EDITEUR' | 'LECTEUR', AgentId>` : chaque étape va à son rôle s'il existe, sinon à l'étape précédente, en dernier recours au maire ;
  - la règle « l'avis ne compte que s'il vient du lecteur » devient « s'il vient de `gazetteStaff().LECTEUR` ».
- Produit (politique) :
  - plus de pénalité « pas de gazette » ;
  - chaque soir, l'opinion de chaque habitant envers le maire baisse de `0.04` s'il a eu faim dans la journée, de `0.03` s'il est sans emploi, et monte de `0.02` s'il a été payé ;
  - un numéro publié vaut `+0.02` ;
  - un événement de score au moins 6 resté sans numéro le jour même vaut `-0.05` (« le maire étouffe l'affaire ») ;
  - l'usure du pouvoir reste.

- [ ] **Étape 1 : tests** (`gazette.test.ts`)
  - Un jour sans événement de score au moins 4 : aucun `gazette.published`.
  - Un jour avec un `crime.theft` : un numéro dont le titre reprend le vol.
  - Avec 4 fondateurs (un maire, un éclaireur, deux citoyens), un numéro paraît quand même : les étapes sont cumulées par `gazetteStaff`.
  - Un `mayor.elected` (changement) et un vol le même jour donnent 2 numéros.
- [ ] **Étape 2 : vérifier qu'ils échouent.**
- [ ] **Étape 3 : implémenter.** Retirer de `prompts.ts` les rappels d'heure limite (« la gazette n'est toujours pas parue ») et y dire que la gazette ne paraît que sur événement.
- [ ] **Étape 4 : tests et typecheck passent.**
- [ ] **Étape 5 : commit** — « La gazette paraît quand il se passe quelque chose ; le maire est jugé sur la faim et l'emploi ».

---

### Tâche 11 : un seul villageois piloté par l'IA

**Fichiers :**
- Modifier :
  - `shared/src/types.ts` : `WorldState.aiAgentId?: AgentId` ;
  - `server/src/agents/llmBrain.ts` : seuls les déclencheurs de `aiAgentId` passent par le fournisseur IA, les autres appellent directement le script ;
  - `client/src/ui/BrainMenu.tsx` : le menu choisit le fournisseur de cet agent ; il est grisé sans agent IA ;
  - `server/src/test/runVillage.ts`.
- Créer : `server/src/test/ai.test.ts`

**Interfaces :**
- Consomme : `FounderSpec.ai` (tâche 9), qui fixe `aiAgentId` dans `createFounderWorld`.
- Produit : `createLLMBrain(provider)` garde sa signature. Le budget d'appels du jour ne compte que les appels de cet agent.

- [ ] **Étape 1 : test** (`ai.test.ts`). Un faux fournisseur qui compte ses appels, avec `aiAgentId = 'a1'`. Sur 2 jours, tous les `llm.call` concernent `a1`, et les autres agents agissent quand même (au moins un message envoyé par un autre agent).
- [ ] **Étape 2 : vérifier qu'il échoue.**
- [ ] **Étape 3 : implémenter.**
- [ ] **Étape 4 : tests et typecheck passent.**
- [ ] **Étape 5 : commit** — « Un seul villageois peut être piloté par l'IA ».

---

### Tâche 12 : réglage sur un long run

**Fichiers :**
- Modifier : `server/src/sim/economyConfig.ts`, au besoin les constantes de `life.ts`, `politics.ts` et `daily.ts`
- Créer : `server/src/test/longrun.test.ts` (marqué `{ skip: !process.env.LONGRUN }`, car il est lent)

**Interfaces :**
- Consomme : `runVillage`, `metrics` (tâche 1).

- [ ] **Étape 1 : test** (`longrun.test.ts`, 110 jours, 4 fondateurs fixes : ambitieux, honnête travailleur, filou, fouineur). Il exige :
  - `population >= 30` et `population <= 50` ;
  - `mayorChanges >= 3` ;
  - au moins un vol dans au moins 6 des 11 tranches de 10 jours ;
  - aucune tranche avec plus de 60 « meurt de faim » ;
  - `jobChanges >= 15` ;
  - `gazetteDays` entre 25 et 90 (ni tous les jours, ni presque jamais) ;
  - `crossings === 0` ;
  - `bridges <= 3`.
- [ ] **Étape 2 : lancer** `LONGRUN=1 npm test -w server -- --test-name-pattern=longrun` et noter les indicateurs qui échouent.
- [ ] **Étape 3 : régler les constantes**, dans `economyConfig.ts` d'abord, une hypothèse à la fois. Relancer jusqu'à ce que le test passe **3 fois de suite** : la simulation utilise `Math.random`.
- [ ] **Étape 4 : `npm test -w server` (rapide) et typecheck passent.** Ouvrir le site, lancer une histoire en ×8 pendant quelques minutes, et vérifier visuellement les routes et les quartiers.
- [ ] **Étape 5 : commit** — « Économie réglée sur un run de 110 jours ».

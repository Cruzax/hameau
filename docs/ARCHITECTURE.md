# Hameau — architecture

## Arborescence

```
Hameau/
├─ package.json            # workspaces npm (shared, client, puis server)
├─ .env                    # ANTHROPIC_API_KEY, LLM_PROVIDER=mock|anthropic|ollama (phase 3)
├─ docs/ARCHITECTURE.md
├─ shared/                 # types + données initiales, importés tels quels (TS source)
│  └─ src/
│     ├─ types.ts          # Agent, House, Road, Message, SimEvent, VoteSession, WorldState
│     ├─ protocol.ts       # messages WebSocket serveur ⇄ client, commandes « Dieu »
│     ├─ seed.ts           # village initial : 5 maisons, 6 routes, 5 agents, rivière
│     └─ geometry.ts       # tracé des routes, point le long d'une polyligne, PRNG
├─ client/                 # Vite + React + TS + React Three Fiber + drei
│  ├─ public/models/       # futurs .glb CC0 (Kenney, Quaternius)
│  └─ src/
│     ├─ main.tsx, App.tsx, styles.css
│     ├─ scene/            # Village, Terrain, River, Plaza, House, Roads, Trees, Villager, Lights
│     ├─ ui/               # TitleBanner, Legend  → puis Journal, GodPanel, TokenCounter (phases 2-5)
│     ├─ net/              # (phase 2) client WebSocket + store zustand
│     └─ capture/          # (phase 5) mode 9:16, rails de caméra, replay
└─ server/                 # (phase 2) Node + TS, lancé avec tsx
   └─ src/
      ├─ index.ts          # HTTP + WebSocket (ws)
      ├─ sim/
      │  ├─ loop.ts        # boucle de ticks
      │  ├─ world.ts       # mutations de WorldState (seul point d'écriture)
      │  ├─ messengers.ts  # déplacement des messages sur les routes
      │  ├─ scheduler.ts   # qui « réfléchit » à ce tick (budget LLM)
      │  ├─ gazette.ts     # pipeline éclaireur → écrivain → éditeur → lecteur → maire
      │  └─ vote.ts        # motions de destitution, dépouillement
      ├─ agents/
      │  ├─ prompts.ts     # prompts système par rôle
      │  ├─ memory.ts      # mémoire courte (fenêtre) + longue (résumé quotidien)
      │  └─ decide.ts      # transforme une réponse LLM en actions (JSON validé)
      ├─ llm/
      │  ├─ LLMProvider.ts # interface commune
      │  ├─ mock.ts        # réponses scriptées (défaut, 0 €)
      │  ├─ anthropic.ts
      │  └─ ollama.ts
      └─ store/
         ├─ journal.ts     # append-only, export JSON
         └─ persist.ts     # JSON au début → SQLite (better-sqlite3)
```

## Schéma de données

Défini dans [`shared/src/types.ts`](../shared/src/types.ts). Résumé :

| Entité | Champs clés | Remarques |
|---|---|---|
| **Agent** | `id, name, role, houseId, personality{traits,tone,honesty,ambition}, goals[], memory{short[],long}, opinions{agentId→-1..1}, inbox[], activity` | Être maire est une **fonction** (`WorldState.mayorId`), pas un métier. |
| **House** | `id, ownerId, position{x,z}, rotation, style, wallColor, roofColor, model?` | `model` = futur `.glb` ; primitives sinon. |
| **Road** | `id, a, b, waypoints[], status: open\|cut` | Arête non orientée. Tracé = porte(a) → waypoints → porte(b). |
| **Message** | `id, from, to, roadId, kind, body, progress 0..1, speed, status` | Ne voyage que sur **une** route → seulement entre voisins directs. Pour joindre plus loin, il faut demander à un voisin de relayer (et il peut déformer). |
| **SimEvent** | `seq, tick, day, at, type, actors[], text, payload` | Journal append-only ; `text` est prêt à servir de sous-titre. Rejouable. |
| **VoteSession** | `id, day, proposerId, targetMayorId, candidates[], ballots[], openedTick, closesTick, status, result` | **Ballot** = `voterId, destitute, candidateId?, reason`. |
| **Gazette** | `day, headline, articles[], review?, approvedBy?` | Produit du jour. |
| **WorldState** | `clock, terrain, mayorId, agents, houses, roads, messages, gazettes, votes, voteEveryDays, llm.budget` | Source de vérité côté serveur. |

## Boucle de tick (serveur, phase 2+)

Un tick = 250 ms réels à vitesse ×1 ; 240 ticks = 1 jour simulé (≈ 1 min).

```
every tickMs / speed, unless paused:
  tick++
  1. MESSAGERS      pour chaque message 'walking' :
                      si route coupée → demi-tour ('returned') ou 'lost' si au milieu du pont
                      progress += speed / longueur(route)
                      si progress ≥ 1 → 'delivered', push dans inbox du destinataire, event
  2. PLANIFICATION  scheduler choisit ≤ K agents « réveillés » ce tick :
                      inbox non vide, ou tâche de rôle due (ex. éclaireur en début de jour),
                      et budget LLM du jour non épuisé (sinon repli mock + event llm.budget_exhausted)
  3. DÉCISION       pour chacun (async, sans bloquer le tick) :
                      contexte = prompt système(rôle, personnalité, objectifs, opinions)
                               + mémoire longue + mémoire courte + inbox + voisins atteignables
                      LLM → JSON { thought, actions: [send{to,kind,body} | update_opinion | propose_vote | vote] }
                      validation : `to` doit être un voisin par route ouverte, sinon action rejetée
  4. ACTIONS        les actions validées sont appliquées au tick suivant (déterminisme du journal)
  5. PHASES DU JOUR tick 0 du jour → day.start ; éclaireur cherche des sujets
                    fin de jour → gazette.published (ou « pas de gazette »), résumé mémoire longue
                    tous les voteEveryDays jours → vote.opened, fenêtre de N ticks, vote.closed
  6. DIFFUSION      WebSocket : tick (positions), events (nouvelles lignes), patch si structure changée
```

Le client ne fait que **rendre** : il interpole les messagers entre deux ticks et rejoue les événements (bulles, sons, caméra).

## Phases

1. ✅ Scène 3D statique — terrain, rivière, place, 5 maisons, routes, caméra.
2. ✅ Simulation mock — serveur, ticks, messagers, relais quand une route est coupée, bulles, journal + export.
3. ✅ LLM — `LLMProvider` (mock / Anthropic / Ollama), prompts par rôle, mémoire courte + résumé quotidien, décisions JSON validées, budget d'appels et compteur de tokens.
4. ✅ Votes et destitution — opinions qui évoluent (décisions des agents + humeur du soir), conseil tous les N jours, bulletins portés par messagers jusqu’à la maison du maire, majorité absolue, passation (l’ancien maire devient citoyen).
5. ✅ Panneau Dieu (routes, événements, habitants, conseil, opinions), capture 9:16 avec plans de caméra et sous-titres, replay depuis le journal.
6. ✅ Vie du village : couples, naissances, maisons, routes demandées au maire, arrivées et départs (voir ci-dessous).

## Vie du village (phase 6)

Le monde est déjà dynamique par construction : maisons, routes et agents sont des `Record` que le
serveur peut modifier à tout moment, et le client re-rend ce qu'il reçoit dans un `patch`. Il reste à
écrire les **règles d'évolution**, toutes pilotées par les opinions (phase 4) et journalisées :

| Mécanique | Déclencheur | Effet visible |
|---|---|---|
| **Couple** | opinion mutuelle > 0,8 pendant N jours + échanges fréquents | `couple.formed`, cœur au-dessus des maisons ; les deux partagent leur mémoire longue |
| **Rupture** | opinion qui chute (dispute, trahison, vote contre l'autre) | `couple.split`, l'un des deux peut déménager |
| **Enfant** | couple stable depuis N jours, budget de population | `agent.born` : nouvel agent (personnalité = mélange des parents + mutation), d'abord sans métier |
| **Nouvelle maison** | un enfant devient adulte, ou un nouvel arrivant | `house.built` : emplacement libre choisi (loin de la rivière, près d'une route), construction animée sur quelques jours |
| **Nouvelle route** | deux agents qui veulent se parler mais doivent passer par des relais | `road.built` : ils la proposent au maire, qui accepte ou refuse (enjeu politique !) |
| **Départ** | agent isolé (aucune route) ou très malheureux | `agent.left` : la maison reste vide, puis peut être reprise |
| **Métiers** | un enfant adulte choisit un métier selon ses parents et les besoins de la gazette | nouveaux rôles possibles (illustrateur, crieur public…) |

Garde-fous : population max, une seule construction à la fois, et toutes ces décisions passent par le
même budget LLM (ou par des règles déterministes en mock).

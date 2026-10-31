# Hameau

Un village 3D low-poly où des agents IA vivent, collaborent et peuvent destituer leur maire.
Les agents ne parlent que le long des routes.

## Lancer

```bash
npm install
npm run dev        # simulation (port 8787) + site (http://localhost:5173)
```

Architecture, schéma de données et boucle de tick : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Choisir le cerveau des agents

Copie `.env.example` en `.env`, puis :

| `LLM_PROVIDER` | Coût | Remarque |
|---|---|---|
| `mock` (défaut) | 0 € | Réponses scriptées. Les tokens affichés sont une estimation. |
| `anthropic` | quelques centimes par jour simulé | Renseigne `ANTHROPIC_API_KEY`. Modèle : `ANTHROPIC_MODEL` (défaut `claude-opus-5-5`). |
| `ollama` | 0 € | Modèle local (`OLLAMA_MODEL`), plus lent et moins fiable sur le JSON. |

Garde-fous : `LLM_MAX_CALLS_PER_DAY` (au-delà, le village se tait jusqu'au lendemain) et
`LLM_MAX_TOKENS` (plafond par réponse). Le compteur 🧠 en haut à gauche affiche les appels du jour
et les tokens consommés ; le détail de chaque appel est dans le journal (case « tout »).

## Raccourcis

| Touche | Effet |
|---|---|
| `G` | Mode Dieu : couper/tracer des routes, déclencher un événement, faire venir ou exiler un habitant, convoquer un conseil, souffler une opinion |
| `C` | Mode capture 9:16 (rendu 1080×1920, interface masquée, sous-titres) |
| `1` à `4` | Caméra : libre, survol, maison, suivre le messager |
| `Échap` | Quitter la capture ou le replay |

Clic sur une route du village : la couper ou la rouvrir. Dans le journal, survole un événement puis ▶ pour
le rejouer ; 📂 rejoue un journal exporté.

## Le village vit tout seul

Chaque soir : les voisins se rapprochent, des couples se forment (ou rompent), des enfants naissent puis
construisent leur maison, deux habitants qui passent sans cesse par des relais demandent une route au maire,
des inconnus arrivent, les isolés partent. Réglages : `LIFE_ENABLED=false` pour couper, `MAX_POPULATION`
(10 par défaut).

## Où modifier le village

Tout le village initial (positions des maisons, routes, rivière, agents, personnalités) est dans
[`shared/src/seed.ts`](shared/src/seed.ts). Les rôles et consignes des agents sont dans
[`server/src/agents/prompts.ts`](server/src/agents/prompts.ts).

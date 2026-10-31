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

Clique sur le badge 🧠 en haut à gauche :

- **Gratuit** : réponses scriptées, 0 €.
- **🔑 Ajouter une clé API** : colle n'importe quelle clé (Claude, DeepSeek, OpenAI, OpenRouter, Groq, Grok,
  Gemini, Mistral). Le fournisseur est reconnu d'après la forme de la clé, confirmé par un appel gratuit
  (liste des modèles) uniquement auprès des fournisseurs plausibles, puis la clé est écrite dans `.env`.
- **Ollama** : modèle local gratuit (`ollama pull deepseek-r1:8b`, `llama3.1`…), modèle au choix.

Le changement se fait en direct. Pour Claude, le menu affiche une estimation du coût par jour simulé
(≈ 0,15 € avec Opus 5.5, ≈ 0,07 € avec Sonnet 5.5, moins d'un centime avec Haiku 5.5 ; un jour simulé dure
90 s à ×1) et le badge affiche la dépense de la session.

Garde-fous : `LLM_MAX_CALLS_PER_DAY` (au-delà, le village se tait jusqu'au lendemain) et
`LLM_MAX_TOKENS` (plafond par réponse).

## Raccourcis

| Touche | Effet |
|---|---|
| `G` | Mode Dieu : couper/tracer des routes, déclencher un événement, faire venir ou exiler un habitant, convoquer un conseil, souffler une opinion |
| `C` | Mode capture 9:16 (rendu 1080×1920, interface masquée, sous-titres) |
| `1` à `4` | Caméra : libre, survol, maison, suivre le messager |
| `Échap` | Quitter la capture ou le replay |

Clic sur une route du village : la couper ou la rouvrir. Dans le journal, survole un événement puis ▶ pour
le rejouer ; 📂 rejoue un journal exporté.

## Éléments

Dans le mode Dieu : ⛈ **orage** (pluie, ciel sombre, éclairs, messagers ralentis), 🌊 **crue** (la rivière
déborde et submerge les ponts, coupés jusqu’à la décrue), ✨ **puits** (colonne de lumière dorée). Un événement
tapé à la main qui parle d’orage, de crue ou de trésor déclenche aussi l’animation.

## Le village vit tout seul

Chaque soir : les voisins se rapprochent, des couples se forment (ou rompent), des enfants naissent puis
construisent leur maison, deux habitants qui passent sans cesse par des relais demandent une route au maire,
des inconnus arrivent, les isolés partent. Réglages : `LIFE_ENABLED=false` pour couper, `MAX_POPULATION`
(10 par défaut).

## Où modifier le village

Tout le village initial (positions des maisons, routes, rivière, agents, personnalités) est dans
[`shared/src/seed.ts`](shared/src/seed.ts). Les rôles et consignes des agents sont dans
[`server/src/agents/prompts.ts`](server/src/agents/prompts.ts).

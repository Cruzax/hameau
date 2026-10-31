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

## Les habitants

| Habitant | Métier | Ce qu'il fait |
|---|---|---|
| Maxence | Maire | Coordonne la gazette, lève l'impôt, paie les salaires |
| Enzo, Marie, Evan, Cruz | Éclaireur, écrivain, éditeur, lecteur | Font la gazette ; coupent du bois le matin |
| Léonie | Boulangère | Cuit le pain (6 pains par bûche), le vend 1 pièce, en offre à qui n'a plus rien |
| Bastien | Forgeron | Fabrique des outils, répare les routes emportées par la crue |
| Céleste | Herboriste | Soigne les malades (2 pièces, ou à crédit) |
| Gaston | Crieur public | Annonce les nouvelles sur la place à 9 h : le seul qui parle à tout le village |
| Odette | Aubergiste | Sert à boire et à manger le soir ; on y bavarde |
| Victor | Garde | Enquête sur les vols, accuse, organise les procès |
| Ambroise | Barde | Chante chaque soir l'événement marquant de la journée |
| Félix | « Vagabond » | Voleur en secret : il se glisse chez les autres la nuit |

**Une journée** dure 24 h de jeu (2 min à ×1) : travail le matin, courses et visites l'après-midi,
auberge le soir, sommeil de 22 h à 6 h. Chacun a des **besoins** (faim, énergie, humeur, santé) et un
**inventaire** (pain, bois, outils, pièces), visibles dans la fenêtre Habitants. Les habitants **marchent**
de lieu en lieu par les routes ; au même endroit, ils se parlent, se transmettent des **rumeurs** (que les
menteurs déforment), se disputent. Les **vols** ont parfois des témoins ; le garde enquête puis accuse, et le
village vote au **procès** : le coupable désigné n'est pas toujours le bon. Couples et naissances donnent
lieu à une **fête** sur la place.

Toute cette vie quotidienne fonctionne par règles (gratuites) ; l'IA n'est appelée que pour les messages,
la gazette et les votes, et elle connaît l'état de chacun (faim, argent, rumeurs entendues).

## Contenu sans IA

Tout ce qui suit est écrit à la main dans [`server/src/content/`](server/src/content/) ; ajouter une ligne
suffit pour enrichir le village :

- `dialogue.ts` : répliques par métier, phrases selon la situation, échanges amicaux, amoureux, hostiles
- `events.ts` : événements du jour (renard, colporteur, loup, concours de tartes…) et calendrier
  (marché le mercredi, pique-nique le dimanche)
- `gazette.ts` : sujets, brouillons, critiques (la gazette raconte d’abord ce qui s’est vraiment passé)
- `verses.ts` : chansons du barde, annonces du crieur

## Le village vit tout seul

Chaque soir : les voisins se rapprochent, des couples se forment (ou rompent), des enfants naissent puis
construisent leur maison, deux habitants qui passent sans cesse par des relais demandent une route au maire,
des inconnus arrivent, les isolés partent. Réglages : `LIFE_ENABLED=false` pour couper, `MAX_POPULATION`
(10 par défaut).

## Où modifier le village

Tout le village initial (positions des maisons, routes, rivière, agents, personnalités) est dans
[`shared/src/seed.ts`](shared/src/seed.ts). Les rôles et consignes des agents sont dans
[`server/src/agents/prompts.ts`](server/src/agents/prompts.ts).

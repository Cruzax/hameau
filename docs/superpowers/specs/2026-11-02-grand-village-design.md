# Hameau : le grand village (époque ancienne)

*Document de conception, 2 novembre 2026. Rédigé à partir d'une conversation avec Cruz, l'auteur du projet. Les choix faits par Claude, et non par Cruz, sont marqués « (choix de Claude) ».*

## Intention

Hameau devient une **app web qui tourne en fond**. On ne la regarde pas en continu : on la laisse vivre pendant des jours ou des semaines, puis on revient voir où en est le village. L'ancien objectif de vidéos verticales (TikTok, format 9:16) est **abandonné**. Le code de capture peut rester, mais il ne guide plus aucune décision.

Un run de 102 jours en mode gratuit (journal du 1er novembre) montre que le village s'endort :
- **Politique figée** : seulement 3 maires en 102 jours (Marie, puis Evan, puis Noah du jour 66 au jour 102).
- **Faim croissante** : à partir du jour 30, et jusqu'à environ 240 alertes « meurt de faim » tous les 10 jours. Les boulangers manquent de bois, et les habitants sans métier n'ont pas un sou.
- **Population plafonnée** à 18 habitants (`MAX_POPULATION`, dans `server/src/sim/life.ts`).
- **Ponts empilés** : chaque route qui traverse la rivière construit son propre pont, presque au même endroit, ce qui donne un tas de planches illisible au centre de la carte.

Le but est qu'en revenant, Cruz trouve **un village différent** : qui a grandi, où des gens se sont enrichis ou ruinés, où il y a eu des vols, des procès, un nouveau maire, et des gazettes qui racontent tout ça.

## Objectifs

1. **Départ choisi par l'utilisateur.** Une nouvelle histoire part de 4 villageois que l'utilisateur compose. Les boutons « Recommencer » actuels (village complet, 5 habitants d'origine, dans `client/src/ui/Sidebar.tsx`) sont remplacés par cet écran de création, ou complétés par lui (au builder de choisir). Le parcours des 4 villageois devient le chemin principal.
2. **Des profils et des traits.**
   - Plus de 5 profils tout prêts, par exemple : l'honnête travailleur, l'ambitieux, le filou, le cœur tendre, le fouineur, le bavard, le grincheux, le rêveur.
   - On peut cliquer sur un profil pour l'ajouter, ou composer un villageois soi-même en cliquant sur des traits : menteur, malin, généreux, fouineur, ambitieux, travailleur, honnête, paresseux, etc.
   - Les traits règlent le comportement à travers les champs existants (`honesty`, `ambition`, `traits`, `tone` dans `Personality`) et de nouvelles tendances : générosité, ardeur au travail, curiosité.
3. **Rôles automatiques ou choisis.** Pour chaque villageois de départ, l'utilisateur fixe le rôle lui-même (maire, écrivain, boulanger…) ou laisse « auto ». En automatique, le village attribue le rôle selon les traits et les besoins : il faut un maire, une gazette qui tourne, de quoi manger.
4. **Le village remplit la carte actuelle.**
   - Le terrain fait déjà 96 × 96, mais les maisons ne peuvent se construire que dans environ ±22 × ±20 (`findSpot`, dans `server/src/sim/god.ts`).
   - On ouvre toute la vallée constructible, jusqu'au pied des collines, et on monte le plafond vers **environ 50 habitants**.
   - Le terrain n'est pas agrandi.
5. **Des lieux de travail d'époque.**
   - Exemples de lieux : ferme ou champs, moulin, scierie, forge, boulangerie. L'auberge et l'herboristerie existent déjà comme rôles.
   - Les habitants y vont pendant la journée, y travaillent et touchent un **salaire**.
   - Un lieu de travail a des postes. Il produit ce dont le village a besoin : de la farine et du pain pour manger, du bois pour construire et cuire, des outils.
   - *(choix de Claude)* Les nouvelles maisons poussent de préférence près des lieux de travail : les fermes près des champs, la scierie près de la forêt, le moulin au bord de la rivière. Le village se forme ainsi en quartiers lisibles.
6. **Riches et pauvres.**
   - Les salaires diffèrent selon le métier et le poste. Certains s'enrichissent, d'autres galèrent.
   - On peut **perdre son emploi** (lieu de travail en faillite, renvoi, vol découvert, paresse) ou **en trouver un meilleur**. Les situations doivent donc tourner au fil des semaines.
   - L'écart de richesse est le moteur des histoires :
     - un pauvre affamé et peu honnête finit par voler ;
     - les procès divisent le village ;
     - un maire qui laisse les gens galérer perd la confiance et se fait renverser.
   - Le crime et les changements de maire doivent **remonter naturellement** sur un long run, sans dés truqués.
7. **On peut manger.** Le pain s'achète avec un salaire. La faim chronique de masse, comme dans le run de 102 jours, est un échec. Une faim ponctuelle et localisée, chez quelqu'un qui a perdu son emploi, est normale et fait partie de l'histoire.
8. **Une gazette quand il se passe quelque chose.**
   - La gazette ne paraît plus chaque jour par obligation. Elle paraît quand un événement en vaut la peine : vol, procès, changement de maire, naissance, mariage, faillite, famine, fête, ouverture d'un lieu de travail, arrivée ou départ.
   - Un jour calme, il n'y a pas de numéro, et ce n'est pas une faute.
   - Le maire ne doit donc plus être puni chaque soir sans gazette. Aujourd'hui, la pénalité est dans `server/src/sim/politics.ts`, `onDayEnd`, et les heures limites de 16 h et 19 h sont dans `server/src/sim/Sim.ts`. On peut toujours lui reprocher d'avoir étouffé une vraie nouvelle.
   - *(choix de Claude)* Un très gros événement peut donner une édition spéciale.
9. **Des routes propres.**
   - Les routes passent par **quelques ponts partagés**, et non plus un pont par route. Le rendu actuel est dans `client/src/scene/Roads.tsx`, qui crée un `Bridge` à chaque croisement de rivière.
   - Elles ne se croisent pas dans tous les sens.
   - *(choix de Claude)* Les routes se raccrochent au réseau existant (un embranchement vers la route ou le pont le plus proche) au lieu de relier chaque paire de maisons en ligne droite.
10. **Une porte ouverte vers les époques.** Chaque métier ou lieu de travail porte une étiquette d'époque (`ancienne` pour tout ce projet). Ajouter plus tard une époque moderne, avec des bureaux vers le jour 300 ou plus, ne doit pas obliger à tout refaire.

## Décisions après relecture

- **Durée d'une journée (décidé par Cruz).** En vitesse ×1, une journée du village dure **5 minutes réelles**, au lieu d'environ 2 minutes aujourd'hui. Ça fait **12 jours par heure**, facile à compter. Les vitesses ×2, ×4 et ×8 restent disponibles. Le réglage se fait par l'horloge : `ticksPerDay` et `tickMs` dans `shared/src/seed.ts`. Les durées exprimées en ticks dans la simulation (trajets, séjours, délais) doivent garder le même sens en heures de village.
- **Une session de travail, sans sauvegarde (choix de Claude, à confirmer par Cruz).**
  - On lance Hameau, on le laisse tourner pendant qu'on travaille, puis on vient voir ce qu'est devenu le village. Tout repart de zéro quand on quitte.
  - Une journée de travail de 8 h fait environ **96 jours de village**, ce qui colle avec le test de réussite d'une centaine de jours.
  - La sauvegarde du village entre deux lancements pourrait valoir le coup, mais c'est un projet séparé, pour plus tard.
  - Les nouvelles entités (lieux de travail, emplois, salaires) doivent quand même rester de simples données sérialisables en JSON, comme le reste de `WorldState`, pour ne pas fermer cette porte.
- **Messages (choix de Claude).** Avec des routes en réseau (embranchements, ponts partagés), un messager marche le long du réseau **jusqu'à son destinataire**. Il n'y a plus de relais de maison en maison (`Sim.relay`, `graph.nextHop`). Les carrefours et les ponts sont de simples points de passage. Un lieu de travail est un point du réseau, mais ne reçoit pas de messages : on écrit à des personnes.
- **La gazette avec 4 fondateurs (choix de Claude).** Au début, une même personne peut tenir plusieurs étapes de la gazette : trouver le sujet, écrire, relire, juger. Le maire peut même publier seul. Les rôles de la rédaction se répartissent sur des personnes différentes à mesure que le village grandit.
- **Le mode IA (décidé par Cruz).**
  - Le grand village tourne **entièrement en mode gratuit** par défaut.
  - L'IA devient au mieux une option : à la création, on peut désigner **un seul villageois** piloté par l'IA (Claude ou une clé API). Il décide, parle et vote avec son cerveau IA ; tous les autres suivent les règles gratuites.
  - Le menu 🧠 actuel, qui fait basculer tout le village sur l'IA, est retiré ou ramené à ce choix d'un seul agent.
  - L'emploi, le vol et la vie quotidienne restent des règles de la simulation pour tout le monde, y compris pour l'agent IA.
  - Si cette option complique trop le projet, elle peut glisser plus tard : le mode gratuit est la priorité.

## Hors périmètre

- **Le passage d'une époque à l'autre et les bureaux** : c'est un projet séparé, prévu plus tard. Seule l'étiquette d'époque est posée ici.
- **Un système de ressources à gérer** (stocks de minerai, d'argile, etc.) : Cruz ne le veut pas forcément. L'économie tourne autour du **travail et de l'argent**. Les quelques biens qui existent déjà (pain, bois, outils) restent, simplement parce que les lieux de travail les produisent.
- **Agrandir le terrain** : on remplit celui qu'on a.
- **Les vidéos verticales et TikTok.**

## Ce qui ferait échouer le projet

- **Des routes qui se croisent de partout**, comme sur la capture du jour 102, ou des ponts empilés. C'est le premier point cité par Cruz.
- **Une ville** : le village doit rester un village, même bien rempli (environ 50 habitants).
- **Un village figé** : même maire pendant des dizaines de jours, plus aucun crime, les mêmes riches et les mêmes pauvres pour toujours.
- **Une famine générale chronique.**
- **Une gazette de remplissage** publiée chaque jour sans rien à dire.

## Contraintes

- **Tout doit marcher en mode gratuit**, sans IA : la vie quotidienne, l'économie, les métiers, le crime et la gazette scriptée. Les modes Claude ou API par clé gardent leur rôle : les agents IA décident et parlent, la simulation fait le reste.
- **Les messages ne voyagent que le long des routes**, portés par des messagers. C'est le principe de base de Hameau. Si les lieux de travail deviennent des nœuds du réseau de routes, il faut que ça reste cohérent avec les maisons comme nœuds. Aujourd'hui `Road` relie deux `House` ; voir `shared/src/types.ts`.
- **La pile existante ne change pas** : Vite, React, React Three Fiber côté client ; Node, TypeScript et les ticks côté serveur ; le WebSocket ; les espaces de travail `shared`, `server` et `client`.
- **Le style low-poly chaleureux reste le même.** Les nouveaux bâtiments (moulin, scierie, ferme…) suivent l'esthétique des maisons actuelles (`client/src/scene/House.tsx`).
- **Pas de « ·e » dans les textes**, et des tournures neutres pour les habitants, comme dans le reste du projet.
- **Le journal** (`/journal.json`) doit permettre de juger un long run : métiers, salaires, emplois perdus ou trouvés, gazettes par événement.

## Laissé au builder

- La liste exacte des métiers et lieux de travail, les postes par lieu, les salaires, les prix, et l'équilibre général. Il faut quand même des écarts nets entre les mieux et les moins bien payés.
- Le modèle de données des lieux de travail : un nouveau `HouseStyle` avec des postes, ou une nouvelle entité.
- La migration des rôles actuels (`BOULANGER`, `FORGERON`, `CITOYEN`…) vers des métiers.
- L'algorithme de tracé des routes et de choix des ponts.
- Le détail des traits et des profils (au moins 6 profils), et la façon dont l'attribution automatique des rôles lit les traits.
- Les règles exactes qui déclenchent une gazette et le choix de l'événement à la une quand il y en a plusieurs.
- La forme de l'écran de démarrage, dans le style de Hameau. Pas de maquette grise : Cruz les trouve laides.

## Comment juger que c'est réussi

Simuler hors ligne un long run en mode gratuit, plus de 100 jours, à partir de 4 villageois, et vérifier :
- **Population** : le village dépasse nettement 18 habitants, approche 50, et ne devient pas une ville.
- **Politique** : plusieurs changements de maire répartis sur le run.
- **Crime** : des vols et des procès tout au long du run, pas seulement au début.
- **Emploi** : des habitants qui changent de situation (emploi perdu, nouvel emploi, enrichissement).
- **Faim** : pas de famine générale chronique.
- **Gazette** : elle paraît les jours où il se passe quelque chose, pas tous les jours.
- **Routes** : sur la carte, des routes lisibles et quelques ponts seulement.

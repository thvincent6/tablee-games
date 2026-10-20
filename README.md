# tablee-games

Catalogue public des jeux de [Tablée](https://github.com/thvincent6/tablee), l'app qui remplace la
feuille de score papier, et moteur de formules partagé entre l'app et ce dépôt.

Un jeu, c'est un **fichier JSON déclaratif** : ses saisies, ses options, ses formules de score, sa
condition de fin et ses cas de test. Aucune ligne de code : l'app interprète les formules avec son
propre moteur, sans jamais exécuter de code venu d'un fichier.

## Contenu

```text
games/<id>/<version>.json   Définitions des jeux (un fichier par version, jamais modifié une fois publié)
schema/game.schema.json     Schéma JSON du format, pour l'autocomplétion dans l'éditeur
packages/engine/            Moteur @tablee/engine : formules, validation, rejeu des tests
```

## Proposer un jeu

Lis [CONTRIBUTING.md](CONTRIBUTING.md) : on y explique comment écrire un jeu, le tester en local
et ouvrir une pull request. Un jeu fusionné ici devient « certifié » dans l'app.

## Commandes

```bash
npm install
npm run games:check -- games   # valide chaque jeu et rejoue ses cas de test
npm test                       # tests du moteur
npm run test:engine            # idem, avec la couverture (90 % au moins)
npm run lint                   # ESLint + Prettier
npm run typecheck              # TypeScript
npm run schema:export          # régénère schema/game.schema.json après un changement du format
npm run games:review -- <games publiés> <games proposés> [--out rapport.md]   # revue d'une PR
```

## Intégration continue

| Workflow                           | Rôle                                                                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`                           | Lint, typecheck, tests du moteur (couverture ≥ 90 %), `games:check` sur tout `games/`.                                                                                        |
| `pr-games.yml` (« Jeux proposés ») | Sur chaque pull request : vérifie les fichiers ajoutés, refuse tout fichier publié modifié ou supprimé. Le script de revue vient de la branche cible, pas de la pull request. |
| `pr-games-comment.yml`             | Publie le rapport en commentaire (et le met à jour), y compris pour une pull request venue d'un fork.                                                                         |

Pour les mainteneurs : la vérification « Jeux proposés » doit être obligatoire avant la fusion
(règle de protection de `main`). Une pull request qui touche `.github/` ou `packages/` se relit à
la main : elle modifie la façon dont les jeux sont vérifiés.

## Catalogue signé

Le catalogue est publié sur GitHub Pages, à <https://thvincent6.github.io/tablee-games/>, et
recopié sur la branche `catalog`, servie par jsDelivr en secours
(<https://cdn.jsdelivr.net/gh/thvincent6/tablee-games@catalog/>) :

```text
index.json        liste des jeux : id, nom, version, moteur, chemin, SHA-256, joueurs, étiquettes
index.json.sig    signature Ed25519 de index.json (base64), octet pour octet
confidentialite/  politique de confidentialité de l'app (pages/confidentialite/)
games/…           copie exacte des fichiers de jeux
```

À chaque changement de `main`, le workflow `catalog.yml` reconstruit `index.json` avec une
`version` supérieure à celle publiée. Le job `sign` attend une **approbation manuelle** (environnement
`release`, seul à détenir le secret `CATALOG_SIGNING_KEY`), signe, vérifie la signature avec la
clé publique du dépôt, puis le site est déployé. L'app embarque les clés publiques de
[keys/catalog-keys.json](keys/catalog-keys.json) et refuse un catalogue mal signé ou plus ancien
que celui qu'elle a déjà.

```bash
npm run catalog:verify -- index.json index.json.sig   # vérifie un catalogue téléchargé
```

**Clés** : `npm run keys:generate` (une seule fois, en local) crée la paire principale et la paire
de secours. Les clés privées sont écrites dans `~/.tablee-keys/`, jamais affichées ni committées ;
la principale va dans le gestionnaire de mots de passe et dans le secret de l'environnement
`release`, la clé de secours reste hors ligne. Elle sert à changer de clé principale sans
mettre l'app à jour en urgence : l'app accepte une signature de l'une ou l'autre.

## Licences

Jeux et schéma en [CC0 1.0](LICENSE-CC0), moteur en [MIT](packages/engine/LICENSE) : voir
[LICENSE.md](LICENSE.md).

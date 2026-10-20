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
```

## Licences

Jeux et schéma en [CC0 1.0](LICENSE-CC0), moteur en [MIT](packages/engine/LICENSE) : voir
[LICENSE.md](LICENSE.md).

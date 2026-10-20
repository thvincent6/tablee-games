# @tablee/engine

Moteur de [Tablée](https://github.com/thvincent6/tablee), en TypeScript pur (aucune dépendance à
React Native ni à Expo) : c'est exactement le même code qui calcule les scores dans l'app et qui
vérifie les jeux dans la CI de ce dépôt.

| Module                      | Rôle                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `@tablee/engine/expression` | Langage de formules : analyseur, évaluateur (interprété, jamais d'`eval`), fonctions. |
| `@tablee/engine/definition` | Format v1 des définitions de jeu : schéma Zod, validation (`parseGameDefinition`).    |
| `@tablee/engine/game`       | Moteur de partie : manches, scores, totaux, classement, fin de partie.                |
| `@tablee/engine/testing`    | Rejeu des cas de test d'une définition (`runDefinitionTests`) et rapport en français. |
| `@tablee/engine/version`    | Version du langage de formules (`ENGINE_VERSION`).                                    |

Le paquet n'est pas publié sur npm : il est distribué en code source (`main` pointe vers
`src/index.ts`) et l'app le consomme par un sous-module Git. Licence MIT.

# Proposer un jeu

Merci ! Un jeu fusionné dans ce dépôt devient **certifié** dans Tablée : tout le monde le trouve
dans le catalogue, et ceux qui l'avaient déjà importé basculent automatiquement en « certifié ».

Pas besoin d'attendre la fusion pour jouer : dans l'app, Jeux › Importer un jeu accepte ton fichier
tout de suite (badge « Non certifié »), et tu peux le partager à tes amis par QR code.

## Les règles d'or

1. **Rédige les règles toi-même.** Les libellés, le résumé (`summary`) et les noms des cas de test
   sont écrits avec tes mots. Ne copie **jamais** de texte d'un livret de règles, d'une boîte de
   jeu ou d'un site : ce texte appartient à son éditeur. Une règle de score se décrit très bien en
   une phrase personnelle (« 10 points par pli, −10 par pli manqué »).
2. **Donne la source officielle.** Mets dans `source` le lien `https://` vers les règles de
   l'éditeur ou de la fédération. Elle sert à vérifier ton barème, pas à le recopier.
3. **Une variante maison n'est pas un jeu certifié.** Si tu joues avec tes propres règles, crée un
   jeu personnalisé dans l'app ou garde ton JSON en import : le catalogue suit les règles
   officielles.
4. **Un fichier publié ne change plus.** Les parties enregistrées pointent vers l'empreinte SHA-256
   exacte du fichier. Pour corriger un jeu, ajoute une nouvelle version (`1.0.1`, `1.1.0`…) dans un
   nouveau fichier.
5. **Tes contributions sont placées sous [CC0](LICENSE-CC0)** (domaine public).

## Où ranger le fichier

```text
games/<id>/<version>.json
```

`id` en minuscules, chiffres et tirets (`skull-king`), `version` au format semver (`1.0.0`). Le
nom du fichier doit correspondre aux champs `id` et `version` du JSON.

## Écrire un jeu

Commence par la clé `$schema` : ton éditeur (VS Code, par exemple) complète alors les champs et
signale les fautes de frappe.

Voici un jeu complet, à manches libres, avec son cas de test :

```json
{
  "$schema": "../../schema/game.schema.json",
  "id": "exemple-plis",
  "name": "Exemple de plis",
  "version": "1.0.0",
  "engine": 1,
  "summary": "Chacun annonce ses plis : 10 points par pli, plus 20 si l'annonce est exacte, sinon −10 par pli d'écart.",
  "author": "Ton pseudo",
  "tags": ["cartes", "plis"],
  "source": "https://exemple.fr/regles-officielles",
  "archetype": "rounds",
  "players": { "min": 3, "max": 6 },
  "winner": "highest",
  "options": [
    {
      "key": "target",
      "label": "Fin de partie",
      "type": "int",
      "default": 200,
      "min": 50,
      "step": 50
    }
  ],
  "inputs": {
    "player": [
      { "key": "bid", "label": "Annonce", "type": "int", "min": 0, "max": 10 },
      { "key": "tricks", "label": "Plis faits", "type": "int", "min": 0, "max": 10 }
    ]
  },
  "scoring": {
    "vars": { "gap": "abs(bid - tricks)" },
    "score": "gap == 0 ? 10 * tricks + 20 : -10 * gap"
  },
  "end": "max(totals) >= opt.target",
  "tests": [
    {
      "name": "Annonce exacte, puis deux plis d'écart",
      "inputs": [
        { "bid": 3, "tricks": 3 },
        { "bid": 1, "tricks": 3 },
        { "bid": 0, "tricks": 0 }
      ],
      "expect": [50, -20, 20]
    }
  ]
}
```

### Les champs

- **Identité** : `id`, `name`, `version`, `engine` (version du langage de formules : `1`), et en
  option `summary`, `author`, `tags`, `source`.
- **`archetype`** : `rounds` (manches), `contract` (jeux à contrat : un preneur contre la défense),
  `grid` (feuille à cases, comme le Yams) ou `counter` (compteur +/− sans manches).
- **`players`** : `{ "min", "max" }` ; **`teams`** : `{ "count", "size" }` pour un jeu en équipes.
- **`winner`** : `highest` (le plus haut gagne) ou `lowest`.
- **`options`** : réglages de la partie, de type `int`, `bool` ou `enum`, chacun avec un `default`.
- **`inputs`** : ce qu'on saisit à chaque manche, par joueur (`player`), par équipe (`team`) ou
  pour la manche (`round`) : types `int`, `bool`, `enum` et `pick`. L'app génère le formulaire à
  partir de cette liste.
- **`cells`** : les cases d'une grille (archétype `grid`).
- **`scoring`** : `vars` (formules intermédiaires, dans l'ordre) puis `score` (ou `taker` et
  `defense` pour un jeu à contrat). Options utiles : `zeroSum` (somme nulle, comme le Tarot),
  `subtotals` (sous-totaux d'une grille), `marks` (repères comme « ×2 »), `describe` (phrase qui
  résume une donne).
- **`end`** : formule de fin (`max(totals) >= opt.target`, `round >= 10`), `grid_complete` pour une
  grille, ou absente si la partie se termine à la main.
- **`validate`** : règles `{ rule, message }` qui refusent une manche incohérente (« la somme des
  plis doit faire 10 »).
- **`tests`** : au moins un cas, obligatoire pour la certification. Chaque cas donne les saisies
  d'une manche (`inputs`, une entrée par joueur) et les scores attendus (`expect`). Pour un jeu à
  contrat, `inputs` est un objet et `expect` vaut `{ "taker", "defense" }` ; pour une grille,
  `inputs` est la grille d'un joueur et `expect` son total. Reprends les exemples chiffrés des
  règles officielles : ce sont les meilleurs tests.

Le format complet est décrit par [schema/game.schema.json](schema/game.schema.json). Les jeux de
`games/` sont de bons modèles : Skyjo (manches), Coinche et Tarot (contrats), Yams (grille).

### Le langage de formules

| Élément    | Contenu                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| Valeurs    | nombres, booléens, valeurs d'énumération entre apostrophes (`'capot'`)                                             |
| Opérateurs | `+ - * / %`, `== != < <= > >=`, `and or not`, `condition ? a : b`                                                  |
| Fonctions  | `min`, `max`, `abs`, `sum`, `count`, `floor`, `ceil`, `round(x, pas)`                                              |
| Noms       | les saisies du joueur, `others.<saisie>` et `all.<saisie>` (listes), `opt.<option>`, `round`, `totals`, les `vars` |

Pas de boucle, pas de fonction maison, aucun accès au réseau ni aux fichiers : une formule ne peut
que calculer un score. Limites : 2 000 caractères et 32 niveaux d'imbrication par formule, 200 Ko
par fichier. Toute clé inconnue est refusée, pour repérer les fautes de frappe.

## Tester en local

Il faut [Node.js](https://nodejs.org) 22 ou plus récent.

```bash
npm install
npm run games:check -- games
```

La commande valide chaque fichier (emplacement, schéma, formules) puis rejoue ses cas de test. Un
cas faux affiche le score attendu et le score obtenu côte à côte :

```text
✗ Exemple de plis 1.0.0 — exemple-plis/1.0.0.json
  ✗ Annonce exacte, puis deux plis d'écart
      attendu : 50 · -20 · 20
      obtenu  : 50 · -10 · 20
```

## Ouvrir la pull request

1. Ajoute ton fichier dans `games/<id>/<version>.json`.
2. Vérifie que `npm run games:check -- games` affiche « Tout est bon ».
3. Ouvre la pull request : le modèle te demande le jeu, le lien vers les règles officielles et
   d'où viennent tes cas de test.

La CI vérifie alors chaque fichier ajouté (schéma, limites, cas de test) et refuse toute
modification ou suppression d'un fichier déjà publié. Son rapport arrive en commentaire de la pull
request, avec le score attendu et le score obtenu pour chaque cas faux ; il se met à jour à chaque
nouveau commit. Une pull request en échec ne peut pas être fusionnée.

Avant la fusion, le barème est comparé aux règles officielles ; chaque écart est signalé dans la
pull request.

# SIPROCOM SGS - Conventions de texte

> Règle dure n°14 du [CLAUDE.md](../CLAUDE.md). Ce document explique le pourquoi ;
> `npm run check:dashes` applique la règle.

---

## La règle

**Aucun tiret cadratin (`—`), aucun tiret demi-cadratin (`–`).**
On écrit un trait d'union ASCII `-`, partout :

| Contexte | Interdit | Correct |
|---|---|---|
| Prose, commentaires | `Facultatif — voir §7` | `Facultatif - voir §7` |
| Chaînes i18n françaises | `"Aucune alerte — tous..."` | `"Aucune alerte - tous..."` |
| Intervalles | `{{from}}–{{to}}` | `{{from}}-{{to}}` |
| Cellule vide d'un tableau | `'—'` | `'-'` |
| Titres, `description` npm | `SIPROCOM — SGS` | `SIPROCOM - SGS` |
| Messages de commit | `Corrige X — au passage Y` | `Corrige X - au passage Y` |

Une incise entourée d'espaces ` — ` devient ` - ` : l'espacement ne change pas,
seul le caractère change.

---

## Pourquoi

**1. C'est la signature d'un texte généré.** Le tiret cadratin est le marqueur le
plus net d'un texte produit par un assistant plutôt qu'écrit par l'équipe. 517
occurrences s'étaient accumulées dans 102 fichiers.

**2. Il casse aux frontières.** Un `-` traverse sans dommage :

- une console Windows en Windows-1252 ;
- un CSV ouvert dans Excel avec le mauvais encodage ;
- une police jsPDF sans glyphe pour U+2014, où le tiret devient un carré vide.

Le même problème est déjà documenté dans `client/src/lib/format.js` (`pdfText`)
pour les espaces insécables : ces caractères sont justes à l'écran et faux à
l'export.

**3. La règle est absolue exprès.** Une exception ("seulement dans la prose",
"seulement en français") demande un arbitrage à chaque commit. Un garde-fou qui
discute est un garde-fou qu'on contourne au `--no-verify`.

---

## Application

| Où | Commande | Portée |
|---|---|---|
| Pre-commit | automatique | fichiers indexés |
| Manuel | `npm run check:dashes` | tout l'arbre suivi par git |
| CI / avant livraison | `npm run check` | inclus en première étape |

Le hook est posé par `npm run hooks:install`, lui-même appelé par le
`postinstall` de la racine : un clone neuf est protégé dès `npm install`.

### Sortie en cas d'échec

```
  1 banned dash(es) found:

  client/src/features/x.jsx:42  (em dash)
    const label = "Stock >>—<< rupture";

  Replace every one with an ASCII hyphen "-".
```

Le caractère fautif est encadré de `>>` et `<<` parce qu'un tiret cadratin et un
trait d'union sont presque indiscernables dans un terminal.

---

## Exemptions

Deux seulement, dans `scripts/check-dashes.js` :

- **`server/prisma/migrations/**`** - Prisma enregistre une somme de contrôle de
  chaque migration appliquée. Réécrire une migration déjà passée fait échouer
  `migrate deploy` sur toute base qui l'a déjà appliquée. Les quatre migrations
  concernées gardent donc leurs tiret cadratins, en commentaire SQL uniquement.
- **`package-lock.json`, fichiers binaires** - contenu généré, personne ne
  l'écrit à la main.

Les fichiers non suivis par git (dont `server/.env`) ne sont pas inspectés.

---

## Ce qui n'est pas concerné

Les points de suspension `…` (47 occurrences) et les espaces insécables sont
**hors périmètre** : ce ne sont pas des tirets, ils ne trahissent pas une
génération automatique, et `…` est la ponctuation française correcte dans un
libellé comme `Chargement…`. Si un jour ils posent un problème d'export, c'est
`pdfText()` qu'il faut étendre, pas cette règle.

---

## Historique

| Date | Événement |
|---|---|
| 2026-08-28 | 517 tirets supprimés dans 102 fichiers ; garde-fou et hook posés. |

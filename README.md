# SIPROCOM SGS — Système de Gestion de Stock

Application web de gestion des entrées, sorties et niveaux de stock, avec suivi
des produits en tendance et alertes de seuil.

Répond au `Cahier_des_charges_SIPROCOM_SGS.pdf` v1.0.
**[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)** reste la référence pour le
modèle de données, les règles métier et la matrice des droits.

---

## Ce que fait le système

| Domaine | Couverture |
|---|---|
| **Produits** | Fiches, catégories à 2 niveaux, fournisseurs, seuils min/max, code-barres |
| **Entrées** | Bons de réception, association fournisseur et bon de commande, prix d'achat, lots |
| **Sorties** | Bons de sortie (vente, casse, échantillon, besoin interne), destinataire |
| **Transferts** | Sortie d'un entrepôt = entrée sur l'autre, dans une seule transaction |
| **Inventaire** | Ajustement manuel avec motif obligatoire, contrôle de cohérence |
| **Stock** | Niveaux temps réel par produit / entrepôt / global, journal complet |
| **Alertes** | Seuil minimum et surstock, automatiques, liste consolidée exportable |
| **Rapports** | Produits tendance, stock dormant, synthèses, valorisation — export Excel et PDF |
| **Sécurité** | 4 rôles, mots de passe hachés, journal d'audit des actions sensibles |
| **Bilingue** | Français (défaut) et anglais, y compris avant connexion |

---

## Stack

| Couche | Choix | Pourquoi |
|---|---|---|
| Client | React 19 + Vite + Tailwind 4 | Rapide à charger sur tablette, découpage par écran |
| Serveur | Express 5 + Prisma 6 | API REST simple, requêtes typées |
| Base | PostgreSQL 17 | Transactions ACID — indispensable pour l'intégrité du stock |
| Auth | JWT en cookie httpOnly | Illisible par JavaScript, contrairement au localStorage |

---

## Démarrage local

**Prérequis :** Node.js 20+, PostgreSQL 17 démarré.

```bash
# 1. Une seule fois — installe tout, applique les migrations, charge la démo
cp server/.env.example server/.env    # renseigner DATABASE_URL et JWT_SECRET
npm install
npm run setup

# 2. À chaque fois — lance l'API et le client ensemble
npm run dev
```

Ouvrez **http://localhost:5280** — l'API tourne sur `:4000`, le client la joint
via un proxy sur la même origine.

> **Un problème au démarrage ?** `npm run doctor` vérifie Node, les dépendances,
> le `.env`, les ports et la base, puis indique quoi corriger pour chaque point.
> `npm run stop` libère les ports si un serveur est resté ouvert.

### Commandes depuis la racine

| Commande | Effet |
|---|---|
| `npm run dev` | API + client, sorties préfixées `[API]` / `[WEB]` |
| `npm run doctor` | Diagnostic avant démarrage |
| `npm run stop` | Libère les ports 4000 / 5280 |
| `npm run db:seed` | Recharge le jeu de démonstration |
| `npm run db:reset` | Réinitialise la base entièrement |
| `npm run db:studio` | Explorateur de base Prisma |
| `npm test` | Vérification du moteur de stock (16 tests) |
| `npm run check` | Traductions + build + tests |

**Comptes de démonstration** — mot de passe `Siprocom2026!` :

| Rôle | Email |
|---|---|
| Administrateur | `admin@siprocom.com` |
| Magasinier | `magasinier@siprocom.com` |
| Responsable achats | `achats@siprocom.com` |
| Direction | `direction@siprocom.com` |

---

### Travailler dans un seul paquet

Les commandes ci-dessus couvrent l'usage courant. Pour n'agir que sur un côté :

```bash
# server/
npm run dev                 # nodemon seul
npx prisma migrate dev      # créer une migration en développement
npx prisma migrate deploy   # appliquer les migrations en production

# client/
npm run build
npm run i18n:check          # vérifie que FR et EN sont synchronisés
```

---

## Déploiement

### Option A — serveur interne (Docker)

```bash
cp .env.docker.example .env    # renseigner POSTGRES_PASSWORD et JWT_SECRET
docker compose up -d
docker compose exec api npx prisma migrate deploy
```

Client sur `:8080`, API sur `:4000`. Le port PostgreSQL n'est volontairement
pas publié sur l'hôte.

### Option B — hébergement cloud

Base managée (Neon, Supabase, RDS), API et client déployés séparément.
Mettre `ENABLE_SCHEDULER=false` et déclencher `POST /api/alerts/sweep`
(en-tête `x-cron-secret`) depuis le planificateur de la plateforme : sur
plusieurs instances, le planificateur intégré s'exécuterait en double.

### Reprise des données existantes

```bash
# Toujours commencer par --dry-run : rien n'est écrit, tout est signalé.
node scripts/import-data.js --products produits.csv --dry-run
node scripts/import-data.js --products produits.csv
node scripts/import-data.js --stock stock-initial.csv --user admin@siprocom.com
```

Les stocks initiaux entrent comme mouvements d'ajustement, jamais en écriture
directe : le grand livre est ainsi complet dès le premier jour et le contrôle de
cohérence passe immédiatement après la mise en production. Le script est
idempotent — le relancer ne double aucun stock.

---

## Les règles qui garantissent l'intégrité

Ces quatre points sont ce qui distingue un stock fiable d'un stock approximatif.

**1. Toute mutation passe par `server/src/services/stock.service.js`.**
Aucune route n'écrit dans `stock_levels` ni `stock_movements`. C'est cette règle
unique qui rend l'intégrité démontrable plutôt qu'espérée.

**2. Le contrôle « pas de stock négatif » est dans la clause `WHERE`.**

```sql
UPDATE stock_levels SET quantity = quantity - $n
WHERE "productId" = $p AND "warehouseId" = $w AND quantity >= $n
RETURNING quantity
```

PostgreSQL réévalue la condition **après** avoir pris le verrou de ligne. Deux
magasiniers qui vendent la dernière unité au même instant : un seul passe. Un
`SELECT` puis `UPDATE` les aurait laissés passer tous les deux.

**3. `stock_movements` est en ajout seul.** Aucune modification, aucune
suppression. Une annulation crée des mouvements compensatoires — l'historique
reste vrai.

**4. Le stock est prouvable.** `GET /api/stock/reconcile` recalcule chaque
niveau à partir du journal et signale toute divergence. Ce contrôle est
exécutable à tout moment depuis l'écran Ajustement.

---

## Tests

```bash
npm test
```

16 vérifications, dont celle qui compte le plus : **20 sorties simultanées pour
10 unités disponibles — exactement 10 réussissent, le stock finit à 0, jamais
négatif.**

Sont également couverts : le retour arrière d'une transaction dont une ligne
échoue, la numérotation sans trou sous concurrence, et la réconciliation du
grand livre sur toute la base.

---

## Sauvegarde

```bash
# Sauvegarde
docker compose exec db pg_dump -U siprocom siprocom_sgs > backups/sgs-$(date +%F).sql

# Restauration
docker compose exec -T db psql -U siprocom siprocom_sgs < backups/sgs-2026-08-09.sql
```

À automatiser quotidiennement et à tester périodiquement — une sauvegarde
jamais restaurée n'est pas une sauvegarde.

---

## Conventions

Voir [CLAUDE.md](CLAUDE.md) : aucune chaîne visible en dur, validation zod sur
chaque endpoint, erreurs API sous forme de codes, suppression logique uniquement.

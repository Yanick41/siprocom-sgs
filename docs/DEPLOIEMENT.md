# SIPROCOM SGS — Runbook de déploiement

> **Aucune étape de ce document n'a été exécutée.** Elles demandent tes
> identifiants (Neon, Vercel) et engagent des ressources facturables. Tout ce
> qui est marqué ⚠️ est irréversible ou destructif.

---

## 1. Variables d'environnement — qui fournit quoi

### Serveur (API)

| Variable | Qui la fournit | Valeur en production |
|---|---|---|
| `DATABASE_URL` | **Toi** — Neon | Chaîne **pooled** (`…-pooler.…`) |
| `DIRECT_URL` | **Toi** — Neon | Chaîne **directe** (sans `-pooler`) |
| `JWT_SECRET` | **Toi** — à générer | 96 caractères hex, **différent du dev** |
| `CLIENT_URL` | **Toi** | `https://sgs.siprocom.com` — **jamais localhost** |
| `CRON_SECRET` | **Toi** — à générer | 48 caractères hex |
| `RESEND_API_KEY` | **Toi** — resend.com | Facultatif ; vide = pas d'email |
| `MAIL_FROM` | **Toi** | Domaine vérifié chez Resend |
| `ENABLE_SCHEDULER` | **Toi** | `false` sur Vercel, `true` sur serveur unique |
| `NODE_ENV` | *Plateforme* | Injecté automatiquement |
| `PORT` | *Plateforme* | Injecté automatiquement |
| `TZ` | **Toi** | `Africa/Abidjan` |
| `JWT_EXPIRES_IN` · `JWT_COOKIE_NAME` · `BCRYPT_ROUNDS` · `LOG_LEVEL` · `DEFAULT_LOCALE` | — | Laisser les valeurs par défaut |

**Génère les secrets maintenant, ils ne doivent exister nulle part ailleurs :**

```bash
node -e "console.log('JWT_SECRET   =', require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('CRON_SECRET  =', require('crypto').randomBytes(24).toString('hex'))"
```

> ⚠️ **Ne réutilise jamais le `JWT_SECRET` de `server/.env`.** Il est en clair
> dans ton dossier de développement et a circulé dans cette conversation.
>
> Le serveur **refuse de démarrer** en production si `CLIENT_URL` contient
> `localhost` ou commence par `http://` — le cookie d'authentification est
> `Secure`, donc en http le navigateur ne l'enverrait jamais.

### Client

| Variable | Valeur |
|---|---|
| `VITE_API_URL` | `/api` — le client et l'API partagent l'origine |

---

## 2. Base de données (Neon)

**À faire dans le dashboard Neon :**

1. Créer un projet — région **Europe (Frankfurt)** ou la plus proche d'Abidjan
2. Créer la base `siprocom_sgs`
3. Copier les **deux** chaînes de connexion depuis *Connection Details* :
   - **Pooled** (contient `-pooler`) → `DATABASE_URL`
   - **Direct** → `DIRECT_URL`

Les deux sont nécessaires : les migrations exécutent du DDL, que PgBouncer en
mode transaction rejette. C'est pourquoi `schema.prisma` déclare `directUrl`.

**Appliquer les migrations :**

```bash
cd server
DATABASE_URL="<pooled>" DIRECT_URL="<direct>" npx prisma migrate deploy
```

Une seule migration existe (`20260808054208_init`), elle crée les 15 tables.

**Créer le premier administrateur :**

```bash
npm run create-admin -- --email admin@siprocom.com --name "Prénom Nom" --password "TON-MOT-DE-PASSE-ICI"
```

Le mot de passe est haché avec bcrypt avant d'atteindre la base ; il n'est ni
stocké ni journalisé en clair. Le script refuse les mots de passe de moins de
12 caractères et ceux qui figurent dans les listes courantes. Il crée ou met à
jour **une seule ligne** et ne supprime jamais rien.

> ⚠️ **N'exécute jamais `npm run db:seed` en production.** Il commence par
> `deleteMany()` sur toutes les tables et créerait les 4 comptes de démo avec
> le mot de passe public `Siprocom2026!`.
>
> ⚠️ **Ne passe jamais la base de production à `--shadow-database-url`.**
> Prisma réinitialise la shadow database. J'ai fait cette erreur en local
> pendant cette session : 2 043 mouvements effacés en une commande.

**Reprise des données existantes :** voir `scripts/import-data.js`, toujours
avec `--dry-run` d'abord.

---

## 3. Déploiement Vercel

`vercel.json` est prêt : build du client, API en fonction serverless, cron
quotidien à 06:00.

**Étapes manuelles :**

1. **Importer le dépôt** sur vercel.com → *Add New Project*
2. **Ne pas modifier** les commandes de build — `vercel.json` les définit
3. **Settings → Environment Variables**, portée *Production* :
   toutes les variables marquées **Toi** au §1
4. **Deploy**
5. Une fois l'URL connue, **remettre `CLIENT_URL` à cette URL exacte** et
   redéployer. Sans ça, le CORS rejette le navigateur.

> ⚠️ Vercel Hobby interdit l'usage commercial. Pour SIPROCOM il faut un plan
> **Pro (~20 $/mois)**, ou l'option Docker ci-dessous.

**Le cron** est déclaré dans `vercel.json`. Vercel envoie un `GET` avec
`Authorization: Bearer $CRON_SECRET` ; l'endpoint accepte cette forme et
`x-cron-secret`. Garde `ENABLE_SCHEDULER=false` : chaque instance serverless
lancerait sinon le même balayage.

### Alternative — serveur interne SIPROCOM

```bash
cp .env.docker.example .env     # renseigner POSTGRES_PASSWORD et JWT_SECRET
docker compose up -d
docker compose exec api npx prisma migrate deploy
```

Ici `ENABLE_SCHEDULER=true` : une seule instance, le cron intégré suffit.

> ⚠️ **Non vérifié.** Docker n'est pas installé sur ta machine, je n'ai jamais
> pu construire ces images. À valider avant toute mise en production.

---

### Contraintes de  — à ne pas modifier sans savoir

**Aucun commentaire.** JSON n'en a pas, et Vercel valide le fichier contre un
schéma strict : toute propriété inconnue — y compris une clé  utilisée
comme commentaire — fait **rejeter le déploiement avant sa création**. L'onglet
Deployments reste alors vide, sans même afficher un échec.

**Root Directory doit rester VIDE** dans le dashboard. Le régler sur
 masque  et  : aucune fonction serverless n'est
produite, le front se déploie parfaitement et chaque  renvoie 404.

** ne nomme que le moteur Prisma.** Vercel trace les statiques seul ;  pèse 476 Mo contre une limite de 250 Mo
par fonction. Mais le moteur est chargé *dynamiquement* par Prisma : sans cette
ligne, le build réussit et chaque requête meurt sur « Query engine library not
found ».

---

## 4. Checklist post-déploiement

Dans l'ordre — chaque test suppose le précédent réussi.

### Infrastructure

- [ ] `https://<domaine>/api/health` → `{"ok":true,"db":true}`
      *`db:false` = mauvaise `DATABASE_URL`*
- [ ] La page d'accueil s'affiche, le sélecteur **FR/EN** répond
- [ ] Les logs de démarrage ne montrent aucun `Production configuration warnings`
      inattendu

### Authentification et CORS

- [ ] Connexion avec le compte admin créé au §2
- [ ] Console du navigateur (F12) : **aucune erreur CORS**
- [ ] Onglet Application → Cookies : `sgs_token` avec **HttpOnly** ✅ et **Secure** ✅
- [ ] Mauvais mot de passe → message d'erreur, pas de page blanche
- [ ] 6 tentatives ratées → blocage temporaire (429)
- [ ] Recharger la page garde la session ouverte

### Parcours métier

- [ ] Créer un produit, une catégorie, un entrepôt
- [ ] Bon d'entrée → **le brouillon ne change pas le stock**
- [ ] Valider → le stock augmente immédiatement
- [ ] Bon de sortie d'une quantité **supérieure au stock** → la ligne passe en
      rouge pendant la saisie, la validation est refusée
- [ ] Transfert entre deux entrepôts → **la quantité totale est conservée**
- [ ] Ajustement sans motif → refusé
- [ ] Journal des mouvements : chaque ligne porte un utilisateur et un horodatage

### Droits (crée un compte par rôle)

- [ ] MAGASINIER : pas de menu Utilisateurs, pas de valorisation
- [ ] ACHATS : ne peut pas créer de produit
- [ ] DIRECTION : voit la valorisation, ne peut rien saisir
- [ ] ADMIN : accès complet

### Rapports et exports

- [ ] Produits tendance et stock dormant renvoient des données
- [ ] Export **Excel** : accents corrects, **les nombres restent des nombres**
- [ ] Export **PDF** : mise en page lisible
- [ ] Contrôle de cohérence (écran Ajustement) → **0 dérive**

### Alertes et cron

- [ ] Descendre un stock sous son seuil → alerte créée **automatiquement**
- [ ] La pastille rouge de la barre du haut reflète le nombre
- [ ] Remonter le stock → l'alerte se résout seule
- [ ] Balayage manuel :
      ```bash
      curl -X POST https://<domaine>/api/alerts/sweep -H "x-cron-secret: <CRON_SECRET>"
      ```
      → `{"ok":true,…}` ; sans le secret → **401**
- [ ] Le lendemain, vérifier dans les logs que le cron de 06:00 s'est exécuté

### Emails (si `RESEND_API_KEY` est renseigné)

- [ ] Domaine vérifié chez Resend, sinon la livraison échoue en silence
- [ ] Un email de test arrive et **ne tombe pas en spam** (SPF/DKIM)

### Sauvegarde — avant la mise en service réelle

- [ ] Une sauvegarde a été prise
- [ ] **Une restauration a été testée sur une base vierge.** Une sauvegarde
      jamais restaurée n'est pas une sauvegarde.

---

## 5. Ce que je n'ai pas pu vérifier

| Point | Pourquoi |
|---|---|
| Rendu visuel, ergonomie tactile | Pas de navigateur à ma disposition |
| Exports Excel/PDF sur clic réel | Idem — seul l'aller-retour des données est testé |
| Build des images Docker | Docker n'est pas installé |
| Déploiement Vercel | Demande tes identifiants |
| Envoi d'email | Aucune clé Resend |

Ces points doivent être validés par toi avant la recette SIPROCOM.

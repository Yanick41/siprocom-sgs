# SIPROCOM SGS - Installer l'application sur un poste Windows

Le SGS s'installe depuis le navigateur. Il n'y a pas de fichier `.exe` a
telecharger, pas de droits administrateur a demander, et la mise a jour est
automatique.

---

## Installer

1. Ouvrir **Microsoft Edge** (ou Google Chrome) sur l'adresse du SGS.
2. Se connecter une premiere fois.
3. Dans la barre d'adresse, cliquer sur l'icone **Installer** (un ecran avec une
   fleche), a droite. Sinon : menu **...** > **Applications** > **Installer ce
   site en tant qu'application**.
4. Confirmer.

Resultat : une entree dans le menu Demarrer, une icone sur le bureau si vous
l'avez demandee, et une fenetre sans barre d'adresse. Le poste se comporte comme
avec un logiciel installe.

### Epingler a la barre des taches

Clic droit sur l'entree du menu Demarrer > **Epingler a la barre des taches**.

### Desinstaller

Parametres Windows > **Applications** > **SIPROCOM SGS** > Desinstaller. Aucune
donnee metier n'est perdue : tout vit sur le serveur.

---

## Mode hors ligne

L'application continue de fonctionner quand le reseau tombe.

### Ce qui marche sans reseau

| | |
|---|---|
| Consulter le catalogue, les categories, les fournisseurs | oui, derniere version vue |
| Consulter les niveaux de stock | oui, derniere version vue |
| Saisir un bon d'entree, un bon de sortie, un inventaire | oui, mis en file d'attente |
| Valider un bon | **non** |
| Rapports, valorisation, journal d'audit | **non** |

Les rapports sont volontairement exclus : une valorisation d'hier affichee
comme si elle etait d'aujourd'hui est plus dangereuse qu'une erreur franche.

### Ce qui se passe exactement

Une saisie faite hors ligne est une **intention**, pas un fait. Le serveur reste
le seul a decider : il n'est pas possible de verifier sur un poste deconnecte
qu'il reste assez de stock (regle BR-2). L'application le dit clairement :

> Enregistre sur l'appareil. Sera envoye au retour du reseau.

Le badge orange **Hors ligne** apparait dans l'en-tete, avec le nombre de
saisies en attente.

### Au retour du reseau

Les saisies partent automatiquement, dans l'ordre ou elles ont ete faites. Cet
ordre compte : deux sorties du meme produit doivent arriver dans l'ordre de
saisie, sinon la seconde peut etre refusee faute d'un stock que la premiere
allait consommer.

Trois issues par saisie :

- **acceptee** : elle disparait de la file, le stock est a jour ;
- **refusee** : le serveur a repondu sur le fond (stock insuffisant, produit
  desactive, droit retire). Elle est mise de cote et **ne partira jamais
  d'elle-meme** ;
- **reportee** : le reseau est toujours coupe. Nouvel essai plus tard.

### Traiter les saisies refusees

Un badge rouge apparait dans l'en-tete. Il mene a **File d'attente**
(`/sync`), qui liste les saisies refusees avec la raison.

Une saisie refusee ne se corrige pas : elle se **supprime**, puis se ressaisit
en tenant compte du stock reel. Modifier puis renvoyer produirait un document
que la personne qui l'a ecrit n'a jamais vu.

---

## Points d'attention

**Le compteur ne bouge pas alors que le reseau est revenu.** Windows peut
signaler une connexion sans qu'il y ait de route vers le serveur (portail
captif, lien mort). Ouvrir **File d'attente** et cliquer **Envoyer
maintenant**.

**Ne pas vider les donnees du site** tant que des saisies sont en attente : la
file vit dans le stockage du navigateur, sur ce poste. La vider les detruit.

**Une saisie hors ligne appartient au poste**, pas au compte. Elle part quand ce
poste retrouve le reseau, pas quand la personne se reconnecte ailleurs.

**A la deconnexion**, les donnees mises en cache sont effacees. La personne
suivante sur ce poste ne peut pas lire les stocks et les prix d'achat de la
session precedente.

---

## Pour l'equipe technique

- Manifeste : `client/public/manifest.webmanifest`
- Service worker : `client/public/sw.js` (ecrit a la main, aucun plugin de
  build ; strategies detaillees en tete de fichier)
- File d'attente : `client/src/lib/offline/queue.js` (IndexedDB)
- Rejeu : `client/src/lib/offline/sync.js`
- Idempotence : `server/src/lib/idempotency.js`

L'idempotence n'utilise **pas** de table dediee. Le client genere l'`id` de la
ligne et le reutilise a chaque tentative ; la cle primaire fait le
dedoublonnage. Aucune migration n'a ete necessaire.

Le service worker n'est actif qu'en production. En developpement, il servirait
des modules Vite perimes. Pour tester le mode hors ligne en local :

```bash
npm run build
npm --prefix client run preview
```

puis, dans les DevTools : onglet **Network** > **Offline**.

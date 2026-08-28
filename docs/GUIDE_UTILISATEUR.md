# SIPROCOM SGS - Guide utilisateur

*Support de formation - version 1.0*

---

## 1. Se connecter

Ouvrez l'adresse fournie par votre administrateur, saisissez votre email et
votre mot de passe.

Le sélecteur **FR / EN** en haut à droite est disponible **avant** la connexion :
si vous ne lisez pas le français, changez la langue d'abord. Votre choix est
enregistré sur votre compte et vous suit sur tous les postes.

**Mot de passe oublié ?** Contactez un administrateur : il le réinitialise
depuis l'écran Utilisateurs.

---

## 2. Qui peut faire quoi

| | Administrateur | Magasinier | Achats | Direction |
|---|:---:|:---:|:---:|:---:|
| Consulter le stock | ✅ | ✅ | ✅ | ✅ |
| Saisir entrées / sorties | ✅ | ✅ | - | - |
| Valider un bon | ✅ | ✅ | - | - |
| Annuler un bon validé | ✅ | - | - | - |
| Ajuster l'inventaire | ✅ | ✅ | - | - |
| Créer / modifier un produit | ✅ | ✅ | - | - |
| Gérer les fournisseurs | ✅ | - | ✅ | - |
| Catégories | ✅ | - | - | - |
| Prendre en compte une alerte | ✅ | - | ✅ | - |
| Valorisation du stock | ✅ | - | - | ✅ |
| Utilisateurs et audit | ✅ | - | - | - |

Le menu de gauche n'affiche que ce à quoi vous avez droit. Si une rubrique
n'apparaît pas, c'est normal.

---

## 3. Enregistrer une entrée de stock

> **Réception de marchandise chez le fournisseur**

1. Menu **Bons d'entrée** → **Nouveau bon d'entrée**
2. Choisissez le **fournisseur**
3. Ajoutez une ligne par produit : produit, quantité, prix d'achat
4. **Enregistrer le brouillon**

⚠️ **Le stock n'a pas encore bougé.** Un brouillon ne modifie rien : c'est
volontaire, pour que vous puissiez vérifier la saisie contre le bon de livraison
papier avant de l'engager.

5. Rouvrez le bon, vérifiez, puis **Valider l'entrée**

Le stock est mis à jour immédiatement, et le mouvement est enregistré avec votre
nom et l'heure.

---

## 4. Enregistrer une sortie de stock

> **Vente, casse, échantillon ou besoin interne**

1. Menu **Bons de sortie** → **Nouveau bon de sortie**
2. Choisissez le **motif** et saisissez le **destinataire**
3. Ajoutez les produits et les quantités

Sous chaque ligne, le système affiche **la quantité réellement disponible** dans
en stock. Si vous demandez plus que le disponible, la ligne passe en rouge
immédiatement - inutile d'attendre la validation pour le découvrir.

4. **Enregistrer le brouillon**, vérifiez, puis **Valider la sortie**

**Si le stock est insuffisant, la validation est refusée.** Le système ne permet
pas de descendre sous zéro. Deux cas possibles :

- Vous vous êtes trompé de quantité → corrigez le bon
- Le stock théorique est faux → faites un **ajustement d'inventaire** (§6)

Seul un administrateur peut forcer une sortie en stock négatif, et cette action
est tracée nominativement dans le journal d'audit.

---

## 5. Livrer, puis facturer

> **Deux documents différents, et c'est voulu**

Le **bon de sortie** accompagne la marchandise : référence, désignation,
quantité. **Aucun prix n'y figure.** C'est la feuille que signe la personne qui
réceptionne, et ce n'est pas forcément quelqu'un à qui l'on montre les marges.

La **facture** est le document commercial : destinataire, prix unitaires,
totaux. Elle porte son propre numéro (`FA-2026-0001`) et rappelle le bon dont
elle vient.

### Marquer une livraison

1. Ouvrez le bon de sortie **validé**
2. Section **Bon de sortie** → **Marquer comme livré**

Valider et livrer ne sont pas le même geste : la validation sort la marchandise
du stock, la livraison dit qu'elle est arrivée chez le client. Il peut s'écouler
des jours entre les deux.

La colonne **Livraison** de la liste répond d'un coup d'œil à « qu'est-ce qui
reste à livrer ? ».

### Générer la facture

1. Ouvrez le bon de sortie **validé**
2. Section **Facture** → **Générer la facture**
3. **Imprimer** ou **PDF**

**Une seule facture par bon de sortie.** Cliquer deux fois ne crée pas un second
document : vous retombez sur le même numéro.

Un brouillon ne peut pas être facturé - rien n'a encore quitté le stock, et
facturer une marchandise encore en rayon est l'erreur que le système refuse.

---

## 6. Ajuster après un inventaire physique

> **Le stock compté ne correspond pas au stock affiché**

1. Menu **Ajustement**
2. Choisissez le produit
3. Le **stock théorique** s'affiche
4. Saisissez la **quantité comptée** → l'écart apparaît en direct
5. Saisissez le **motif** - obligatoire, minimum 3 caractères
6. **Enregistrer l'ajustement**

Le motif est obligatoire parce qu'un écart d'inventaire sans explication rend
l'audit impossible six mois plus tard. Soyez précis :
« inventaire physique du 15/03, 4 unités cassées en manutention ».

---

## 7. Suivre les alertes

Le menu **Alertes** liste les produits **sous le seuil minimum** ou **en
surstock**. La pastille rouge dans la barre du haut indique le nombre d'alertes
en cours, depuis n'importe quel écran.

Les alertes sont générées **automatiquement** après chaque mouvement - aucune
action manuelle. Une alerte se résout d'elle-même dès que le stock repasse dans
les seuils.

**Responsable achats :** cochez ✅ pour marquer une alerte comme prise en compte
(commande passée). Elle reste visible mais n'est plus signalée comme nouvelle.

Liste exportable en Excel et PDF.

---

## 8. Consulter les rapports

Menu **Rapports**, quatre onglets :

| Onglet | À quoi ça sert |
|---|---|
| **Produits tendance** | Les produits les plus sortis - pour anticiper les réapprovisionnements |
| **Stock dormant** | Les produits qui ne bougent pas et la valeur immobilisée dessus |
| **Synthèse par catégorie** | Entrées et sorties par famille de produits |
| **Valorisation** | Valeur du stock (réservé Administrateur et Direction) |

Choisissez la période avec les dates ou les boutons rapides **7 j / 30 j / 90 j**.

Chaque rapport s'exporte en **Excel** (chiffres exploitables, triables et
sommables) et en **PDF** (mise en page prête à imprimer).

---

## 9. Retrouver l'historique d'un mouvement

Menu **Mouvements** : le journal complet, filtrable par type et
période.

Chaque ligne indique **qui**, **quoi**, **quand**, **combien** et le **solde
après** l'opération.

Ce journal est en ajout seul : il ne peut être ni modifié ni supprimé, par
personne. Une annulation crée un mouvement inverse - l'historique reste fidèle
à ce qui s'est réellement passé.

---

## 10. Questions fréquentes

**Je ne trouve pas un produit dans la liste déroulante.**
Il est peut-être désactivé. Vérifiez dans **Produits** avec le filtre
« Tous les statuts ».

**J'ai validé un bon par erreur.**
Un administrateur peut l'annuler : le système enregistre automatiquement les
mouvements inverses. Le bon d'origine reste visible avec le statut « Annulé ».

**Puis-je supprimer un produit ?**
Non, seulement le désactiver. Ses mouvements passés y font référence
définitivement - le supprimer effacerait une partie de l'historique.

**Les chiffres affichés sont-ils fiables ?**
Un administrateur peut lancer le **contrôle de cohérence** depuis l'écran
Ajustement : il recalcule chaque niveau à partir du journal et signale toute
divergence.

**L'application fonctionne-t-elle sur tablette ?**
Oui. Les écrans magasinier sont conçus pour un usage tactile.

---

*Pour toute question : contactez votre administrateur système.*

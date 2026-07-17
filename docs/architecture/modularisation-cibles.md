# Plan de modularisation des fichiers volumineux

## Règle d'architecture

ProfilScan privilégie une architecture modulaire composée de modules courts, spécialisés et faiblement couplés.

Avant d'ajouter une fonctionnalité à un fichier existant :

1. vérifier si cette responsabilité appartient déjà à un module spécialisé ;
2. étendre ce module plutôt que dupliquer la logique ;
3. créer un module dédié lorsque la responsabilité est nouvelle ;
4. conserver les fichiers d'orchestration centrés sur la coordination ;
5. proposer une extraction lorsqu'un fichier dépasse environ 300 lignes, ou plus tôt lorsqu'il cumule plusieurs responsabilités.

Une évolution devrait idéalement nécessiter la modification d'un seul module spécialisé et, au maximum, de son registre ou de son orchestrateur.

## Fichiers prioritaires

### `app-main.js`

**Rôle cible :** bootstrap de l'application et assemblage des contrôleurs.

Extractions prévues :

- `app/navigation/screen-router.js` : affichage des écrans, `pushState`, `replaceState`, `popstate` et retour Android ;
- `app/progress/analysis-progress.js` : progression et affichage des erreurs ;
- `app/workers/worker-runner.js` : création et exécution des workers ;
- `app/signature/signature-controller.js` : recherche, export et copie des signatures ;
- `app/pipeline-settings/pipeline-settings-controller.js` : formulaire et aperçu du pipeline ;
- `app/crop/crop-controller.js` : sélection, dessin et application du recadrage ;
- `app/events/app-event-bindings.js` : branchement final des événements.

`app-main.js` ne doit conserver que l'état partagé indispensable, l'initialisation des contrôleurs et `boot()`.

### `src/shape-engine/signature-builder.js`

**Rôle cible :** orchestration de la construction d'une empreinte.

Extractions prévues :

- normalisation et rééchantillonnage des contours ;
- géométrie et remplissage raster ;
- descripteurs radial et angulaire ;
- moments de Hu et Fourier ;
- assemblage du fingerprint et de l'ADN.

Les algorithmes doivent être ajoutés par module et enregistrés dans un registre, sans multiplier les conditions dans le builder.

### `visual-compare.js`

**Rôle cible :** orchestration de la page de comparaison visuelle.

Le fichier utilise déjà `visual-compare/canvas-tools.js` et `visual-compare/diagnostics.js`. Les extractions suivantes doivent continuer dans le même dossier :

- contrôleur du worker d'analyse ;
- inspecteur des étapes du pipeline ;
- inspecteur des signatures ;
- génération et téléchargement du rapport visuel ;
- accès et mise à jour du DOM.

### `src/app/pipeline-compare.js`

**Rôle cible :** enchaînement des étapes de comparaison.

Extractions prévues :

- préparation des entrées ;
- calcul des métriques ;
- comparaison des descripteurs ;
- classement et agrégation des scores ;
- génération du rapport de diagnostic.

## Ordre d'exécution

1. `app-main.js` : extraire d'abord la navigation, la progression et les workers.
2. `signature-builder.js` : séparer les utilitaires de contours et les descripteurs.
3. `visual-compare.js` : poursuivre la modularisation déjà amorcée.
4. `pipeline-compare.js` : transformer le fichier en orchestrateur.
5. Ajouter ou renforcer les tests après chaque extraction.

## Contraintes de migration

- aucun changement fonctionnel pendant une extraction ;
- petits commits cohérents ;
- imports relatifs validés après chaque commit ;
- conservation de la gestion `history.pushState`, `history.replaceState` et `popstate` ;
- pas de duplication temporaire durable ;
- suppression de l'ancien code uniquement lorsque le nouveau module est branché et vérifié.

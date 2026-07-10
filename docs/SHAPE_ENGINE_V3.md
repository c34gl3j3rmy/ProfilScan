# ProfilScan — Shape Engine v3

## Objectif

Construire un moteur de reconnaissance robuste capable de distinguer des profils aluminium proches à partir :

1. d'un SVG direct ;
2. d'un SVG rasterisé propre ;
3. d'une photo réelle dégradée.

La topologie `contours[]` reste l'unique source de vérité. Les listes aplaties de points ne doivent jamais servir à reconstruire des contours.

## Critères de réussite

- SVG direct : 100 % Top 1 sur les références connues.
- SVG rasterisé propre : au moins 99 % Top 1, 100 % Top 3.
- Aucun segment artificiel entre contours.
- Aucun algorithme non discriminant compté comme un succès.
- Rapport benchmark exploitable par un LLM et inférieur à environ 1 Mo.
- Temps de calcul compatible avec une PWA sur ordinateur courant.

## Phase 0 — Tests de référence

- Ajouter un mode `svg-direct` qui compare l'empreinte issue du SVG à la base sans passer par la segmentation.
- Conserver le mode `svg-raster-filled-material`.
- Conserver le mode `photo-edge`.
- Ajouter des tests golden sur toute la base.
- Mesurer Top 1, Top 3, Top 10, marge entre les deux premiers et temps de calcul.

## Phase 1 — Rééchantillonnage adaptatif

### Algorithmes

- Rééchantillonnage uniforme par longueur d'arc.
- Allocation minimale de points par contour.
- Densité adaptative selon la courbure.
- Conservation obligatoire des coins et extrémums de courbure.
- Simplification Douglas-Peucker avec tolérance relative à la boîte normalisée.
- Variante Visvalingam-Whyatt pour préserver les petits détails significatifs.

### Règles

- Les longues lignes droites utilisent peu de points.
- Les crochets, lèvres, gorges et rayons utilisent davantage de points.
- Chaque contour reçoit un minimum de points indépendant de sa longueur.
- Les points caractéristiques sont toujours conservés.

## Phase 2 — Points caractéristiques et courbure

### Algorithmes

- Courbure discrète multi-échelle.
- Curvature Scale Space (CSS).
- Détection des maxima de courbure.
- Détection des coins par angle de rotation local.
- Détection de segments droits et d'arcs.
- Non-Maximum Suppression sur les points caractéristiques.

### Sorties

- Liste de coins et de points de forte courbure.
- Signature de courbure le long de la longueur d'arc.
- Échelle caractéristique de chaque détail.

## Phase 3 — Descripteurs de contour

### À intégrer

- Turning Function.
- Curvature Fourier Descriptor.
- Elliptic Fourier Descriptors (EFD).
- Shape Context multi-contours.
- Chamfer Distance sur carte de distance.
- Hausdorff modifié et pondéré par courbure.
- ICP pondéré sur points caractéristiques.
- Fourier complexe invariant au point de départ, au sens, à la rotation, à la translation et à l'échelle.

### Fusion

- Ne jamais fusionner un score non discriminant.
- Pondérer davantage les détails locaux que les longues portions droites.
- Appliquer des gates de cohérence : ratio, topologie, nombre de contours, trous et remplissage.

## Phase 4 — Topologie et structure

### Algorithmes

- Hiérarchie de contours et arbre d'inclusion.
- Graphe topologique des contours.
- Squelette morphologique.
- Axe médian / Medial Axis Transform.
- Graphe du squelette : nœuds, branches, longueurs et angles.
- Comparaison de graphes par attributs avant toute approche GNN.

### But

Comparer l'organisation du profil, pas seulement sa silhouette : chambres, branches, retours, crochets et zones connectées.

## Phase 5 — Signature métier aluminium

Extraire automatiquement :

- nombre de contours et de chambres ;
- nombre de gorges, lèvres, crochets et retours ;
- nombre de segments horizontaux, verticaux et obliques ;
- angles dominants ;
- distribution des épaisseurs ;
- épaisseur minimale, médiane et maximale ;
- symétries ;
- compacité ;
- rapport plein/vide ;
- positions relatives des détails discriminants.

Ces informations servent de filtres, de gates et de sous-scores explicables.

## Phase 6 — Pipeline expérimental modulaire

Chaque descripteur devient un module indépendant enregistré dans un registre central.

### Contrat d'un module

Un module expose :

- un identifiant et une version ;
- ses paramètres ;
- son état : `experimental`, `validated`, `disabled` ou `non-evaluable` ;
- son temps d'exécution ;
- son coût mémoire ;
- la taille de sa signature ;
- son score par candidat ;
- son pouvoir discriminant ;
- ses warnings et valeurs manquantes.

### Mesures automatiques

- Top 1, Top 3 et Top 10 avec le module seul ;
- décisions corrigées et décisions dégradées ;
- marge moyenne entre le bon candidat et le premier mauvais candidat ;
- variance et taux de scores constants ;
- corrélation avec les autres modules pour repérer les redondances ;
- temps moyen, médian et P95 ;
- pouvoir discriminant global et par famille de profils.

### Règles

- Un module non discriminant ne peut pas influencer le classement.
- Un module expérimental n'est jamais activé par défaut.
- Un module peut être désactivé sans modifier le cœur du pipeline.
- L'ajout d'un module ne doit pas nécessiter de modifier le benchmark.
- Chaque changement doit pouvoir être comparé en A/B avec la version précédente.

## Phase 7 — Apprentissage optionnel

À envisager uniquement après stabilisation du moteur déterministe :

- réseau siamois sur masques normalisés ;
- embedding de contours ;
- Graph Neural Network sur le graphe topologique ;
- approche hiérarchique inspirée d'AdaContour ;
- apprentissage des poids à partir des benchmarks validés.

Le modèle appris ne doit pas remplacer les diagnostics géométriques explicables.

## Architecture cible

```text
Entrée
  ├─ SVG direct
  ├─ SVG rasterisé
  └─ Photo
       ↓
Segmentation / masque de matière
       ↓
Contours structurés + hiérarchie
       ↓
Rééchantillonnage adaptatif
       ↓
Points caractéristiques + courbure
       ↓
Modules de descripteurs indépendants
       ↓
Mesure du pouvoir discriminant
       ↓
Gates de cohérence
       ↓
Fusion des scores validés
       ↓
Classement + explication
```

## Ordre d'implémentation obligatoire

1. Golden tests et benchmark direct/raster/photo.
2. Rééchantillonnage adaptatif et points caractéristiques.
3. Turning Function, CSS, Chamfer et descripteurs pondérés.
4. Hiérarchie de contours, squelette et graphe topologique.
5. Signature métier.
6. Pipeline expérimental modulaire.
7. Optimisation des poids.
8. IA optionnelle.

## Principes de sécurité technique

- Une fonctionnalité est activée dans le score seulement après un benchmark démontrant un gain.
- Toute nouvelle signature doit exposer sa taille, sa variance et son pouvoir discriminant.
- Les algorithmes non discriminants sont marqués `non-evaluable`.
- Chaque phase doit conserver un mode de comparaison avec la version précédente.
- Aucun fallback ne doit reconstruire la topologie depuis une liste aplatie.

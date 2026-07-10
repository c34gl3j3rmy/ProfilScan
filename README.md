# ProfilScan

ProfilScan est une PWA mobile-first destinée à détecter, compter et identifier des profils aluminium à partir d'une photo, d'une image ou d'un fichier SVG.

L'application fonctionne principalement en local dans le navigateur : la base profils, les réglages et les analyses restent sur l'appareil.

---

## Sommaire

1. [Fonctions principales](#fonctions-principales)
2. [Première utilisation](#première-utilisation)
3. [Écran d'accueil](#écran-daccueil)
4. [Prendre ou importer une image](#prendre-ou-importer-une-image)
5. [Comprendre les résultats](#comprendre-les-résultats)
6. [Réglages de l'analyse](#réglages-de-lanalyse)
7. [Benchmark par lot](#benchmark-par-lot)
8. [Paramètres du pipeline](#paramètres-du-pipeline)
9. [Gestionnaire de configurations](#gestionnaire-de-configurations)
10. [Signatures des profils](#signatures-des-profils)
11. [Debug du pipeline](#debug-du-pipeline)
12. [Observabilité du moteur](#observabilité-du-moteur)
13. [Exports disponibles](#exports-disponibles)
14. [Stockage local et confidentialité](#stockage-local-et-confidentialité)
15. [Utilisation hors ligne](#utilisation-hors-ligne)
16. [Moteur de reconnaissance](#moteur-de-reconnaissance)
17. [Limites actuelles](#limites-actuelles)
18. [Structure du projet](#structure-du-projet)

---

## Fonctions principales

ProfilScan permet de :

- prendre une photo depuis un smartphone ;
- importer une image depuis l'appareil ;
- importer et analyser un fichier SVG ;
- détecter plusieurs profils visibles dans une même image ;
- comparer les formes avec une base locale ;
- afficher les références les plus probables avec leurs scores ;
- annoter les profils détectés sur l'image ;
- ajuster les paramètres de prétraitement et de détection ;
- modifier les poids des algorithmes de comparaison ;
- lancer un benchmark sur plusieurs fichiers ;
- comparer plusieurs configurations de poids ;
- visualiser les signatures géométriques des profils ;
- inspecter les différentes étapes du pipeline ;
- exporter les rapports d'analyse, de benchmark et d'observabilité ;
- fonctionner comme une application installable et partiellement hors ligne.

---

## Première utilisation

### 1. Importer la base profils

Au premier lancement, ProfilScan demande un fichier `dataprofils.json`.

Cette base contient les profils et leurs signatures de référence. Elle est enregistrée localement dans le navigateur avec IndexedDB.

### 2. Choisir une source

Une fois la base chargée, il est possible de :

- prendre une photo ;
- importer une image ;
- importer un SVG ;
- lancer un benchmark par lot.

### 3. Lancer l'analyse

L'analyse démarre automatiquement après la sélection ou la capture du fichier.

### 4. Consulter les résultats

Les profils détectés sont entourés sur l'image. Pour chaque zone détectée, ProfilScan affiche la référence la plus probable, le score et les meilleurs candidats.

---

## Écran d'accueil

L'écran d'accueil regroupe les actions principales.

### Prendre une photo

Ouvre l'appareil photo du smartphone.

Conseils :

- utiliser un fond contrasté ;
- limiter les reflets sur l'aluminium ;
- cadrer entièrement les profils ;
- éviter les ombres fortes ;
- photographier les profils aussi perpendiculairement que possible.

### Importer une image

Permet d'analyser une image déjà présente sur l'appareil.

Formats acceptés selon le navigateur :

- JPEG ;
- PNG ;
- WebP ;
- autres formats d'image supportés par le navigateur ;
- SVG.

### Benchmark lot

Permet de sélectionner plusieurs images ou SVG et de mesurer les performances de reconnaissance sur un jeu d'essai.

La référence attendue est déduite du nom du fichier sans son extension.

Exemple :

```text
127206.png -> référence attendue : 127206
```

### Remplacer la base

Supprime la base profils active et importe une nouvelle base locale.

### Paramètres du pipeline

Ouvre les réglages communs utilisés pour construire les signatures de la base et analyser les images.

### Gestionnaire de configurations

Permet de comparer la configuration officielle avec les réglages locaux, d'importer une configuration et d'exporter une configuration candidate.

### Réinitialiser ProfilScan

Supprime les données locales de l'application, le cache PWA et la base enregistrée, puis recharge l'application.

Cette action est irréversible pour les données qui n'ont pas été exportées.

### Voir les signatures profils de la base

Permet de rechercher une référence et d'afficher sa signature enregistrée.

### Observabilité du moteur

Affiche le registre des algorithmes, les statistiques de performance, les erreurs, les données de cohérence et l'état des algorithmes expérimentaux.

---

## Prendre ou importer une image

### Capture avec la caméra

1. Appuyer sur **Prendre une photo**.
2. Positionner les profils dans le cadre.
3. Appuyer sur **Capturer**.
4. Attendre la fin de l'analyse.

### Import d'une image

1. Appuyer sur **Importer une image**.
2. Sélectionner un fichier.
3. L'analyse démarre automatiquement.

### Import d'un SVG

Les SVG sont rasterisés avant l'analyse photographique afin de pouvoir utiliser le même pipeline que pour une image classique.

Le moteur possède également un pipeline vectoriel utilisé lors de l'import et de la construction de la base profils.

---

## Comprendre les résultats

L'écran de résultat contient plusieurs éléments.

### Image annotée

Les zones détectées sont dessinées sur l'image avec leur référence supposée.

### Nombre de profils détectés

Indique combien de sections candidates ont été retenues par le moteur.

### Liste des résultats

Pour chaque profil détecté, l'application peut afficher :

- la référence proposée ;
- la désignation ;
- le score global ;
- le score de détection de la section ;
- les meilleurs candidats ;
- des détails par algorithme selon le rapport généré.

### Image compacte

Réduit l'espace occupé par l'image afin de consulter plus facilement la liste des résultats.

### Recadrer

Permet de limiter l'analyse ou la visualisation à une zone plus précise de l'image, selon l'état courant de l'interface.

### Télécharger rapport

Télécharge un fichier JSON contenant le résultat détaillé de l'analyse.

### Debug pipeline

Affiche les différentes étapes internes de l'analyse afin de comprendre une erreur de détection ou de reconnaissance.

### Nouvelle analyse

Revient à l'écran principal pour lancer une nouvelle photo ou sélectionner un autre fichier.

---

## Réglages de l'analyse

Les réglages sont accessibles depuis le panneau **Réglages** de l'écran de résultat.

### Profil attendu

Permet d'indiquer manuellement la référence attendue.

Ce champ est utile pour :

- vérifier le rang obtenu par une référence connue ;
- analyser pourquoi un profil est mal classé ;
- préparer un test ou un benchmark.

### Réglage auto

Calcule automatiquement une première combinaison de paramètres d'image à partir du fichier chargé.

### Réglages image

#### Luminosité

Éclaircit ou assombrit l'image avant l'analyse.

#### Contraste

Renforce ou réduit les différences entre le profil et le fond.

#### Flou contours

Applique un flou avant la détection.

- faible valeur : conserve davantage de détails ;
- forte valeur : réduit davantage le bruit.

#### Suppression texture métal

Réduit les stries fines, textures et petits reflets présents sur les surfaces métalliques.

### Réglages de détection

#### Seuil contour

Contrôle la quantité de pixels considérés comme des contours.

- valeur faible : davantage de détails, mais plus de bruit ;
- valeur élevée : moins de bruit, mais risque de perdre des contours faibles.

#### Connexion contours

Relie les segments proches ou interrompus.

Une valeur trop importante peut fusionner plusieurs profils ou zones distinctes.

#### Aire mini

Élimine les petits composants détectés.

- faible valeur : conserve de petits objets ;
- forte valeur : supprime davantage de parasites.

#### Fusion objets

Fusionne les composants proches qui semblent appartenir au même profil.

### Poids du matching

Ces paramètres définissent l'importance de chaque famille de caractéristiques dans le score global.

Les principaux poids disponibles sont :

- Ratio ;
- Signature radiale ;
- Moments de Hu ;
- Fourier ;
- Histogramme d'angles ;
- Remplissage ;
- Minuties ;
- Détails locaux.

Les rapports de benchmark peuvent contenir d'autres scores avancés, par exemple :

- Hausdorff ;
- Shape Context ;
- ICP ;
- RANSAC ;
- Zernike ;
- EFD, selon le niveau d'intégration de l'algorithme.

Un poids élevé ne garantit pas une meilleure reconnaissance. Il doit être validé sur un jeu de benchmark représentatif.

---

## Benchmark par lot

Le benchmark par lot mesure les performances de ProfilScan sur plusieurs fichiers connus.

### Préparer les fichiers

Le nom de chaque fichier doit correspondre à la référence attendue.

Exemples :

```text
127206.jpg
12AR20.png
78XP03.svg
```

### Lancer le benchmark

1. Appuyer sur **Benchmark lot**.
2. Sélectionner plusieurs fichiers.
3. Attendre la fin du traitement.
4. Un rapport JSON est téléchargé automatiquement.

### Indicateurs produits

Le rapport peut contenir :

- précision Top 1 ;
- précision Top 3 ;
- précision Top 10 ;
- rang de la référence attendue ;
- nombre de candidats inspectés ;
- profils non détectés ;
- références absentes de la base ;
- matrice de confusion ;
- analyse des échecs ;
- efficacité des algorithmes ;
- votes par algorithme ;
- comparaison de presets de poids ;
- recommandations d'augmentation ou de réduction de certains algorithmes ;
- diagnostics du pipeline et de la recherche de candidats.

### Benchmark des poids

ProfilScan peut recalculer le classement avec plusieurs presets de poids à partir des résultats collectés.

Cette fonction permet de comparer des stratégies sans relancer toute la détection d'image.

---

## Paramètres du pipeline

Ces paramètres doivent rester cohérents entre :

- la génération des signatures de la base ;
- l'analyse des photos ;
- l'analyse des SVG ;
- les benchmarks.

### Profil témoin

Permet de sélectionner une référence de la base afin de prévisualiser sa signature.

Actions disponibles :

- choisir une référence ;
- sélectionner un profil aléatoire ;
- afficher le profil ;
- consulter l'aperçu des signatures.

### Grille matière

Définit la résolution utilisée pour représenter le remplissage du profil.

- grille plus fine : meilleure précision, calcul plus long ;
- grille plus grossière : calcul plus rapide, moins de détails.

### Points contour

Définit le nombre de points utilisés pour normaliser les contours.

Ce paramètre influence notamment :

- Fourier ;
- Shape Context ;
- Hausdorff ;
- ICP ;
- les descripteurs locaux ;
- les algorithmes expérimentaux basés sur le contour.

### Simplification contour

Réduit le nombre de variations et de petits détails du contour.

- faible valeur : conserve davantage de détails ;
- forte valeur : lisse davantage le contour.

---

## Gestionnaire de configurations

Le gestionnaire distingue plusieurs niveaux de configuration.

### Configuration officielle

Configuration validée et fournie par le dépôt dans :

```text
configs/validated-default.json
```

### Configuration locale expérimentale

Réglages modifiés sur l'appareil, non encore validés par benchmark.

### Configuration candidate

Configuration exportée pour être versionnée, discutée et validée dans le dépôt.

### Actions disponibles

- appliquer la configuration locale ;
- restaurer la configuration officielle ;
- comparer les différences ;
- importer une configuration JSON ;
- exporter la configuration locale ;
- exporter une configuration candidate pour Git.

### Cycle recommandé

```text
Réglages locaux
      ↓
Benchmark
      ↓
Export candidate
      ↓
Validation dans le dépôt
      ↓
Publication comme validated-default
```

---

## Signatures des profils

L'écran **Signatures profils** permet de :

- rechercher une référence ;
- afficher la signature enregistrée ;
- consulter les données brutes ;
- copier la signature ;
- comparer une signature de base avec une analyse réelle.

Une signature peut contenir :

- résumé géométrique ;
- ratio ;
- contours normalisés ;
- signature radiale ;
- histogramme d'angles ;
- Fourier ;
- moments de Hu ;
- remplissage ;
- minuties ;
- détails locaux ;
- informations de topologie ;
- données avancées selon la version de la base.

---

## Debug du pipeline

Le debug pipeline sert à comprendre où apparaît un problème.

Les étapes observables peuvent inclure :

1. image d'origine ;
2. mise à l'échelle ;
3. niveaux de gris ;
4. suppression de texture ;
5. flou ;
6. segmentation ;
7. masque de matière ou masque de contours ;
8. connexion des contours ;
9. composants détectés ;
10. sélection des sections candidates ;
11. contours et trous ;
12. normalisation ;
13. calcul des descripteurs ;
14. recherche des candidats ;
15. score final.

Le rapport de debug peut aider à distinguer :

- un problème de prise de vue ;
- un problème de segmentation ;
- un contour ouvert ou incomplet ;
- une mauvaise fusion de composants ;
- une signature incorrecte ;
- une mauvaise pondération du matching.

Des pages de diagnostic complémentaires existent également dans le dépôt :

- `pipeline-debug.html` ;
- `pipeline-compare.html` ;
- `visual-compare.html`.

---

## Observabilité du moteur

La vue **Observabilité du moteur** permet d'inspecter le fonctionnement interne sans modifier le résultat de reconnaissance.

Elle affiche notamment :

- le registre des algorithmes ;
- leur version ;
- leur étape dans le pipeline ;
- leur statut ;
- la présence ou non d'une implémentation exécutable ;
- le nombre d'appels ;
- le temps moyen ;
- le P95 ;
- les erreurs ;
- les sorties manquantes ;
- les recommandations disponibles ;
- les résultats de cohérence entre l'ancien moteur et le registre ;
- l'état de préparation à la migration de certains descripteurs.

### Statuts possibles

- `validated` : algorithme utilisé et considéré comme stable ;
- `experimental` : algorithme en cours d'évaluation ;
- `disabled` : algorithme désactivé ;
- `non-evaluable` : algorithme présent mais non comparable automatiquement dans l'état actuel.

### Télémétrie Web Worker

Les analyses principales sont exécutées dans un Web Worker. Un pont d'observabilité rapatrie les mesures vers l'interface principale après les analyses.

### Export observabilité

Le bouton **Exporter JSON** télécharge un rapport comprenant :

- le registre ;
- la télémétrie du thread principal ;
- la télémétrie du worker ;
- les rapports de cohérence disponibles.

### Réinitialiser les mesures

Efface les mesures d'observabilité accumulées pendant la session courante.

Cette action ne supprime pas la base profils.

---

## Exports disponibles

Selon l'écran utilisé, ProfilScan peut produire plusieurs fichiers JSON.

### Rapport d'analyse unique

Contient notamment :

- les objets détectés ;
- les références proposées ;
- les scores ;
- les meilleurs candidats ;
- les réglages ;
- les informations de segmentation ;
- les diagnostics disponibles.

### Rapport de benchmark

Contient les résultats consolidés du lot, les échecs, les classements complets, les statistiques et les recommandations.

### Configuration locale

Permet de sauvegarder les réglages actuels.

### Configuration candidate Git

Permet de proposer une configuration destinée à être versionnée et validée.

### Rapport d'observabilité

Contient les mesures du registre, du thread principal et du Web Worker.

---

## Stockage local et confidentialité

### Données stockées localement

ProfilScan peut conserver dans le navigateur :

- la base profils ;
- les paramètres du pipeline ;
- la configuration locale ;
- certaines préférences de l'interface ;
- le cache de la PWA.

### IndexedDB

La base profils est stockée dans IndexedDB.

### Confidentialité

Les photos, signatures et bases ne sont pas envoyées vers un serveur par le fonctionnement normal de l'application.

La base propriétaire n'est pas incluse dans le dépôt public.

Il reste recommandé de vérifier la configuration d'hébergement et les extensions du navigateur lorsque l'application est utilisée avec des données sensibles.

---

## Utilisation hors ligne

ProfilScan utilise un Service Worker pour mettre en cache l'interface et les principaux modules JavaScript.

Après un premier chargement réussi, une partie importante de l'application peut fonctionner sans connexion.

Certaines limites restent possibles :

- la première installation nécessite une connexion ;
- une mise à jour nécessite un nouveau chargement en ligne ;
- les fonctions dépendant d'une ressource non encore mise en cache peuvent échouer hors ligne ;
- les capacités caméra et fichiers dépendent du navigateur et du système.

En cas de comportement incohérent après une mise à jour :

1. recharger l'application ;
2. fermer puis rouvrir la PWA ;
3. utiliser **Réinitialiser ProfilScan** si le cache reste bloqué.

---

## Moteur de reconnaissance

ProfilScan utilise ShapeEngine, un moteur géométrique structuré autour de plusieurs étapes.

### Prétraitement

- niveaux de gris ;
- luminosité et contraste ;
- réduction du bruit ;
- flou ;
- suppression de texture métallique.

### Segmentation

- détection robuste des contours ;
- segmentation de matière remplie ;
- connexion de segments ;
- extraction de composants ;
- détection des contours et des trous.

### Normalisation

- centrage ;
- changement d'échelle ;
- rééchantillonnage ;
- simplification ;
- normalisation des contours.

### Descripteurs principaux

- ratio ;
- signature radiale ;
- histogramme d'angles ;
- Fourier ;
- moments de Hu ;
- remplissage ;
- minuties ;
- détails locaux.

### Comparaisons avancées

Selon la configuration et l'étape de développement :

- Hausdorff ;
- Shape Context ;
- ICP ;
- RANSAC ;
- Zernike ;
- Elliptic Fourier Descriptors (EFD).

### Architecture modulaire

Le moteur comprend désormais :

- un registre d'algorithmes ;
- des implémentations runtime ;
- un orchestrateur ;
- une télémétrie ;
- une validation de cohérence ;
- un collecteur de rapports ;
- un tableau de bord d'observabilité.

Les algorithmes expérimentaux ne sont pas nécessairement intégrés au score final. Leur présence dans le registre signifie qu'ils peuvent être calculés, mesurés ou évalués, mais pas qu'ils influencent déjà la reconnaissance de production.

---

## Limites actuelles

La reconnaissance dépend fortement de la qualité de l'entrée.

Les difficultés fréquentes sont :

- reflets importants ;
- fond trop proche de la couleur du profil ;
- profil partiellement masqué ;
- ombres dures ;
- perspective excessive ;
- contour incomplet ;
- plusieurs profils qui se touchent ;
- faible résolution ;
- référence absente de la base ;
- signatures de base générées avec des paramètres différents de ceux de l'analyse.

Le score représente une similarité calculée, pas une certitude absolue.

Les réglages avancés et les algorithmes expérimentaux doivent être validés par benchmark avant d'être utilisés comme configuration officielle.

---

## Structure du projet

```text
ProfilScan/
├── configs/                  Configurations validées
├── src/
│   ├── app/                  Interface utilisateur
│   ├── config/               Gestion des configurations
│   ├── import/               Import de la base profils
│   ├── observability/        Registre, télémétrie et rapports
│   ├── shape-engine/         Reconnaissance géométrique
│   ├── storage/              IndexedDB
│   └── workers/              Analyse d'image en arrière-plan
├── index.html                Interface principale
├── pipeline-debug.html       Outil de diagnostic du pipeline
├── pipeline-compare.html     Comparaison de pipelines
├── visual-compare.html       Comparaison visuelle
├── manifest.json             Configuration PWA
└── service-worker.js         Cache et fonctionnement hors ligne
```

---

## Conseils pour obtenir de bons résultats

- utiliser une base créée avec les mêmes paramètres de pipeline que l'analyse ;
- photographier le profil sur un fond uni ;
- éviter les reflets directs ;
- ne pas couper les bords du profil ;
- conserver une résolution suffisante ;
- tester les réglages automatiques avant les réglages manuels ;
- utiliser le debug pipeline pour identifier l'étape fautive ;
- valider toute modification de poids avec un benchmark complet ;
- exporter les configurations intéressantes avant de réinitialiser l'application.

---

## État du projet

ProfilScan est en développement actif.

Certaines fonctions sont considérées comme stables, tandis que d'autres sont expérimentales et servent à comparer de nouvelles stratégies de reconnaissance avant leur intégration définitive.

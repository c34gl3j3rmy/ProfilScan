# ProfilScan

PWA mobile-first pour detecter, compter et identifier des profils aluminium a partir d'une photo.

## Objectif

ProfilScan permet de :

- prendre une photo depuis un smartphone ;
- importer une image ;
- detecter les profils visibles ;
- comparer les formes avec une base locale ;
- afficher la reference la plus probable avec un score.

## Confidentialite

La base `dataprofils.js` n'est pas incluse dans le depot.

L'utilisateur importe sa base localement depuis son smartphone. Les donnees restent stockees uniquement sur l'appareil via IndexedDB.

## Fonctionnement

1. Importer la base profils.
2. Prendre une photo ou importer une image.
3. L'analyse demarre automatiquement.
4. Les profils detectes sont entoures.
5. La meilleure reference est affichee avec un score.

## Technologies

- PWA
- JavaScript natif
- Canvas
- Web Worker
- IndexedDB
- GitHub Pages

## Moteur

ProfilScan utilise ShapeEngine, un moteur de reconnaissance geometrique base sur :

- detection de contours ;
- normalisation de forme ;
- ShapeFingerprint pour la recherche rapide ;
- ShapeDNA pour la comparaison precise ;
- ShapeSensors pour les scores explicables.

## Statut

MVP V1 scaffold pret a developper.

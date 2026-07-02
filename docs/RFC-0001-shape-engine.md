# RFC-0001 — ShapeEngine

Version : 0.1  
Statut : Draft  
Auteur : Jeremy Le Gac  
Projet : ProfilScan

## Vision

ShapeEngine est un moteur de reconnaissance geometrique explicable.

Il identifie une forme a partir d'une image, d'un dessin vectoriel ou d'un modele CAO, sans apprentissage automatique.

## Philosophie

ShapeEngine ne reconnait pas des profils. Il reconnait des formes.

Toute connaissance metier est apportee par une collection de formes.

## Architecture

```text
Entree
-> Pretraitement
-> Segmentation
-> Extraction
-> ShapeDNA
-> ShapeSensors
-> Fusion
-> Resultat
```

## Modules

- ImagePreprocessor
- ObjectSegmenter
- ShapeExtractor
- ShapeDNABuilder
- ShapeMatcher
- ScoreFusion

## Principe fondamental

Le moteur ne compare jamais image contre image. Il compare toujours ShapeDNA contre ShapeDNA.

## Decouplage

ShapeEngine ne doit pas connaitre l'interface, la camera, IndexedDB, GitHub Pages, Tiaso ou ProfilScan.

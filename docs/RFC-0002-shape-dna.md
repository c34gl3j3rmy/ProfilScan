# RFC-0002 — ShapeDNA & ShapeFingerprint

## Decision

ShapeEngine utilise deux formats :

- ShapeFingerprint : recherche rapide.
- ShapeDNA : comparaison precise.

## ShapeFingerprint

Format leger servant a eliminer rapidement les mauvais candidats et garder un Top 20.

## ShapeDNA

Format complet contenant :

- identity
- globalShape
- topology
- contour
- descriptors
- quality

## Recherche progressive

```text
Base complete
-> ShapeFingerprint
-> Top 20 candidats
-> ShapeDNA
-> Matching precis
-> Meilleur resultat
```

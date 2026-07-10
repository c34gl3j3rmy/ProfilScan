# ProfilScan — Golden Dataset

## But

Le golden dataset sert à mesurer objectivement chaque évolution du moteur Shape Engine v3. Il distingue trois familles d'entrée :

1. `svg-direct` : géométrie de référence sans segmentation ;
2. `svg-raster` : SVG rasterisé puis analysé comme une image parfaite ;
3. `photo` : image dégradée, réelle ou synthétique.

Chaque scénario doit être déterministe, versionné et reproductible.

## Niveaux

### Niveau A — Référence absolue

- SVG direct.
- SVG rasterisé noir sur fond blanc.
- Rotation par multiples de 90 degrés.
- Changement d'échelle sans perte notable.

Objectifs :

- Top 1 : 100 % en SVG direct.
- Top 1 : au moins 99 % en SVG rasterisé.
- Top 3 : 100 %.
- Non-détection : 0 %.

### Niveau B — Dégradations légères

- Rotation libre faible.
- Flou léger.
- Bruit faible.
- Contraste légèrement réduit.
- Translation et marges variables.
- Redimensionnement non entier.

Objectifs :

- Top 1 : au moins 97 %.
- Top 3 : au moins 99 %.
- Non-détection : au plus 1 %.

### Niveau C — Dégradations réalistes

- Perspective modérée.
- Éclairage non uniforme.
- Reflets modérés.
- Fond simple non blanc.
- Bruit et compression.
- Rotation libre.

Objectifs initiaux :

- Top 1 : au moins 90 %.
- Top 3 : au moins 97 %.
- Non-détection : au plus 3 %.

### Niveau D — Cas difficiles

- Perspective forte.
- Faible contraste.
- Fond encombré.
- Reflets importants.
- Occultation partielle.
- Recadrage incomplet.
- Photo réelle prise au téléphone.

Ce niveau sert d'observation et d'amélioration progressive. Aucun seuil bloquant n'est fixé au départ.

## Scénarios synthétiques

Chaque scénario possède :

- un identifiant stable ;
- une version ;
- un niveau ;
- une graine déterministe ;
- une liste de transformations ;
- des seuils de réussite ;
- un coût maximal indicatif.

Transformations prévues :

- rotation ;
- échelle ;
- translation ;
- perspective ;
- flou gaussien ;
- bruit gaussien ;
- bruit impulsionnel ;
- contraste ;
- luminosité ;
- gradient d'éclairage ;
- compression ;
- occultation ;
- changement de fond.

## Rapport compact

Pour chaque image :

```json
{
  "reference": "71AR01",
  "scenario": "B-rotation-blur",
  "rank": 1,
  "score": 96.4,
  "secondScore": 82.1,
  "margin": 14.3,
  "detected": true,
  "elapsedMs": 42.7,
  "warnings": []
}
```

Pour chaque scénario :

- Top 1, Top 3, Top 10 ;
- score moyen du bon profil ;
- marge moyenne ;
- non-détections ;
- temps moyen, médian et P95 ;
- profils les plus fragiles ;
- comparaison avec la version de référence.

## Comparaison A/B

Chaque rapport doit pouvoir comparer :

- version A du moteur ;
- version B du moteur ;
- profils corrigés ;
- profils dégradés ;
- variation de précision ;
- variation de temps ;
- variation de mémoire ;
- variation de la taille du rapport.

Une nouvelle fonctionnalité n'est validée que si :

1. elle améliore le niveau ciblé ;
2. elle ne provoque pas de régression au-delà de la tolérance ;
3. son coût en temps et mémoire reste acceptable ;
4. son pouvoir discriminant est mesurable.

## Gestion des photos réelles

Les photos réelles sont stockées séparément des scénarios synthétiques. Chaque photo doit conserver :

- la référence attendue ;
- l'appareil utilisé ;
- la distance approximative ;
- l'angle de prise de vue ;
- le type d'éclairage ;
- le type de fond ;
- les défauts connus ;
- un identifiant anonymisé.

Aucune donnée personnelle ou information sensible ne doit être intégrée au dataset.

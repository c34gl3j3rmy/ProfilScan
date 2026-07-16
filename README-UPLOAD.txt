ProfilScan - modularisation de analysis-worker.js
================================================

À déposer à la racine du dépôt via GitHub > Add file > Upload files.

Fichiers concernés :
- src/workers/analysis-worker.js
- src/workers/analysis/settings.js
- src/workers/analysis/contour-utils.js
- src/workers/analysis/fingerprint-debug.js
- src/workers/analysis/matcher.js
- src/workers/analysis/debug-pipeline.js
- src/workers/analysis/run-analysis.js

Résultat :
- analysis-worker.js devient un point d'entrée léger ;
- réglages, contours, matching et diagnostics sont séparés ;
- EFD et Structural sont ajoutés aux diagnostics de signature ;
- le comportement de l'analyse reste inchangé.

Validation :
- node --check exécuté sur tous les fichiers JavaScript.
- Le workflow GitHub Actions existant validera également la syntaxe après upload.

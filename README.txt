ProfilScan - modularisation du benchmark
========================================

INSTALLATION

1. Fais une sauvegarde de ton dépôt actuel.
2. Extrais ce ZIP à la racine du dépôt ProfilScan.
3. Accepte la fusion du dossier src et le remplacement de :
   src/app/batch-benchmark.js
4. Les nouveaux modules seront créés dans :
   src/app/benchmark/

FICHIERS

- src/app/batch-benchmark.js
- src/app/benchmark/benchmark-algorithms.js
- src/app/benchmark/benchmark-diagnostics.js
- src/app/benchmark/benchmark-report.js
- src/app/benchmark/benchmark-ui.js
- src/app/benchmark/benchmark-utils.js

PRINCIPES

- batch-benchmark.js conserve uniquement l'orchestration, l'analyse des images
  et la construction du résultat individuel.
- Les algorithmes, diagnostics, rapports, utilitaires et fonctions d'interface
  sont isolés dans des modules spécialisés.
- EFD et structural sont enregistrés dans benchmark-algorithms.js.
- Le rapport exporté passe en batch-benchmark-full-ranking-v3.
- La configuration candidate actuel-interface-sans-hu est inscrite dans le rapport.

IMPORTANT

Ce paquet suppose que le fichier suivant est déjà présent et exporte :
- buildWeightPresetBenchmark
- CANDIDATE_WEIGHT_PRESET_NAME

Fichier attendu :
src/app/benchmark-weight-presets.js

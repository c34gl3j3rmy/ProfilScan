ProfilScan - modularisation visual-compare + CI
=================================================

À déposer à la racine du dépôt via GitHub > Add file > Upload files.

Fichiers ajoutés/modifiés :
- src/app/visual-compare.js
- src/app/visual-compare/canvas-tools.js
- src/app/visual-compare/diagnostics.js
- src/app/shared/common-utils.js
- .github/workflows/javascript-check.yml

Le fichier common-utils.js remplace la version existante et conserve les exports
utilisés par app-main, tout en ajoutant les fonctions nécessaires à visual-compare.

Validation locale :
- node --check sur tous les fichiers JavaScript du ZIP.

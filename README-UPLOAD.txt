ProfilScan - correctif modulaire pour débloquer la PWA

Déposer le dossier src à la racine du dépôt via Add file > Upload files.

Effets :
- candidate-search restauré et découpé en modules spécialisés ;
- façade candidate-search.js conservée pour les imports existants ;
- structural-signature.js temporairement non chargé ;
- EFD et les scores existants restent actifs.

Après le commit, attendre GitHub Actions puis le redéploiement Pages.

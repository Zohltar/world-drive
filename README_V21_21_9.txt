WORLD DRIVE V21.21.9 — TERRAIN ORIENTATION HOTFIX CANDIDATE

Base : V21.21.8 frame-pacing candidate.

Correctif ciblé :
- corrige le terrain rendu à 90 degrés par rapport à la route;
- cause : V21.21.8 avait figé la matrice du mesh `ground` alors que terrain.js remplace sa géométrie par une PlaneGeometry déjà tournée dans le plan XZ puis remet ground.rotation à 0;
- le mesh terrain principal conserve maintenant matrixAutoUpdate actif;
- coût attendu négligeable : un seul mesh dynamique supplémentaire;
- toutes les optimisations de frame pacing V21.21.8 sont conservées;
- aucune modification à terrain.js, vehicle-system.js, vehicle-dynamics.js, vehicle-presentation.js, au réseau ou à la qualité visuelle.

Statut : candidate de test, pas baseline avant validation utilisateur.

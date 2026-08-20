WORLD DRIVE V21.21.1 — PERFORMANCE HOTFIX (CANDIDATE)

OBJECTIF
Conserver la fondation de physique généralisée de V21.21 tout en retirant le coût inutile observé en jeu sur les véhicules actuels.

OPTIMISATIONS
- Cache du layout physique normalisé du véhicule : masse, voie, empattement, inertie et essieux ne sont plus reconstruits plusieurs fois par frame.
- Invalidation automatique du cache lorsque le véhicule sélectionné change (le tableau d'essieux est remplacé).
- Les voitures actuelles à 4 roues reprennent le calcul rapide historique de plan de support.
- Le solveur générique de plan multi-roues reste disponible uniquement pour les futurs châssis 6/8+ roues.
- Suppression d'allocations temporaires dans le calcul générique du plan de support.
- Suppression des closures répétées du calcul de compression pour les 4 roues actuelles.

NON MODIFIÉ
- Terrain / route / streaming.
- Electron, proxy OSM, multijoueur.
- Calibrations physiques V21.21.
- Schéma multi-essieux et métadonnées d'attelage.

STATUT
Candidate de performance à valider visuellement et en FPS sur le poste utilisateur. V21.20.1 reste la baseline stable tant que V21.21.x n'est pas approuvée.

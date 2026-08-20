WORLD DRIVE V21.22.1 — MEDIUM TERRAIN REFINEMENT CANDIDATE

Base stable: V21.21.27
Base de travail: V21.22.0 Distant Terrain Candidate

Objectif
- Corriger la bande de terrain moyenne distance qui restait facettée/striée sur relief raide.

Changements
- Horizon square-ring: 15 -> 32 rangées radiales, portée extérieure inchangée (5860 m demi-largeur).
- Zone ~1.6–3.6 km fortement densifiée (~60–165 m entre anneaux).
- Lissage DEM démarre plus doucement après la couture: protection exacte jusqu’à +120 m, puis blend 0.055 -> 0.29.
- Rayon de lissage: 8 -> 42 m avec la distance.
- Corridor routier toujours protégé du lissage.
- Palette V21.22.0, haze, terrain proche, streaming et physique inchangés.

Statut: CANDIDATE — validation visuelle utilisateur requise.

WORLD DRIVE V21.21.4 — BALANCED QUALITY / PERFORMANCE

Base : V21.21.3 60-FPS performance candidate.
Statut : candidate à valider visuellement.

Objectif : conserver les optimisations CPU de V21.21.3 tout en remontant nettement
la qualité graphique sans sacrifier la cible de 60 FPS.

Changements visibles :
- FPS déplacé en bas à gauche.
- Boussole et cadrans remis à jour à chaque frame, comme avant les optimisations.
- Antialiasing WebGL réactivé.
- Distance caméra restaurée à 4500 m.
- Résolution dynamique beaucoup moins agressive : 1.35 / 1.12 / 1.0 / 0.85 max DPR.
- Ombres directionnelles restaurées avec map 1024 et rafraîchissement espacé.
- Le gouverneur dégrade d'abord les ombres, puis seulement la résolution si nécessaire.

Conservé de V21.21.3 :
- index spatial de route;
- optimisations allocations / physique;
- détection de crêtes allégée;
- contact shadow optimisé;
- télémétrie FPS/performance;
- moteur physique V21.21 inchangé.

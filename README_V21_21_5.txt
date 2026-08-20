WORLD DRIVE V21.21.5 — CPU OPTIMIZATION / BALANCED QUALITY CANDIDATE

Base
- V21.21.4 Balanced Quality candidate.
- Qualité de rendu V21.21.4 conservée : antialias activé, far plane 4500 m,
  même gouverneur de résolution/ombres et même plancher de pixel ratio 0.85.
- FPS toujours affiché en bas à gauche.
- Boussole et cadrans toujours rafraîchis à chaque frame.

Optimisations CPU
1. Cadrans : les fonds, graduations, textes, chrome et gradients sont pré-rendus
   dans une couche statique. À chaque frame, seuls aiguilles + LCD sont redessinés.
2. Boussole : graduations et points cardinaux pré-rendus dans un ruban hors écran;
   chaque frame ne fait qu'un blit + ligne centrale + texte si le degré affiché change.
3. Route : la boucle de conduite utilise un hint de segment local (±40 segments)
   avec fallback global si la voiture s'éloigne de plus de 20 m du corridor local.
   Les projections OSM/signes continuent d'utiliser le nearestRoute global exact.
4. Suspension : sur route, les quatre roues utilisent le plan local déjà résolu sous
   le châssis plutôt que quatre recherches spatiales indépendantes. Les probes de
   crête/saut restent précis et les roues hors corridor retombent sur le lookup exact.
5. Pneus : le solveur détaillé par roue (répartition grip/slip) tourne à 24 Hz;
   direction, lacet, propulsion, freinage, gravité de pente et position restent par-frame.
6. Challenge/HUD : écritures DOM répétitives limitées à 10 Hz quand le texte n'a pas
   besoin d'être modifié à chaque frame.
7. vehicle-dynamics.js : cache de layout simplifié, inertie de lacet pré-calculée,
   fast path deux essieux et suppression d'allocations fallback inutiles.

Compromis intentionnels
- Le support vertical des roues sur route est une approximation plane locale à l'échelle
  du châssis. Les essais synthétiques serrés mesurent une erreur maximale de 3.90 mm.
- Le grip/slip détaillé roue-par-roue peut réagir avec jusqu'à ~42 ms de retard. Le modèle
  de direction et les forces longitudinales principales restent calculés chaque frame.
- Le solveur multi-essieux générique reste présent pour les futurs camions/remorques.

Test utilisateur suggéré
- Reprendre exactement le trajet ayant donné ~30 FPS en V21.21.4.
- Vérifier le FPS après 10 secondes.
- Vérifier : pente à l'arrêt, freinage, virages serrés, crêtes, suspension visuelle,
  aiguille de vitesse/RPM et boussole.
- Cible : 45–60 FPS sans baisse perceptible de qualité graphique.

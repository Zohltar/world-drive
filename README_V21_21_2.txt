World Drive V21.21.2 — Performance Optimization Candidate

Base: V21.21.1 performance hotfix candidate.

Objectif:
- conserver le nouvel engin physique généralisé V21.21;
- récupérer beaucoup plus de FPS sans retirer les comportements physiques validés;
- afficher les FPS en bas à droite.

Optimisations principales:
1. Index spatial 48 m du profil routier local.
   - roadFrameAt/roadSurfaceAt ne parcourent plus tout le profil routier à chaque
     échantillon de roue, skid mark ou ombre.
   - fallback exact vers le scan complet si la requête sort du corridor indexé.
   - les branches superposées restent toutes candidates dans les cellules voisines.

2. Ombres.
   - shadowMap Three.js n'est plus recalculée à chaque frame.
   - projection détaillée de l'ombre de contact mise à jour à cadence réduite.
   - géométrie du decal réduite de 35 à 20 sommets.
   - position/yaw/fade de l'ombre restent mis à jour à chaque frame.

3. HUD / Canvas.
   - informations DOM principales: 10 Hz.
   - minimap: 5 Hz.
   - compteur et boussole: cadence visuelle adaptative.
   - lune/ciel: cadence réduite.

4. Gouverneur adaptatif.
   - mesure FPS intégrée.
   - si les FPS restent bas, réduction progressive du pixel ratio.
   - hystérésis pour éviter les changements de qualité constants.

5. Physique verticale.
   - sous 7.5 m/s, les coûteux probes de décollage sont évités puisque l'ancien
     critère interdisait déjà tout décollage sous ce seuil.
   - aucun changement du résultat physique dans cette plage.

FPS:
- affichage permanent `FPS xx` en bas à droite.

Statut:
Candidate de test. Ne pas promouvoir baseline avant validation visuelle/performance
sur le poste utilisateur.

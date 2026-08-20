World Drive V21.21.18 — Physical Lane Assist Candidate
======================================================

Objectif
--------
Mettre à jour l'assistance de maintien sur route après les révisions majeures
V21.21.10–V21.21.17 de la physique des pneus, du momentum et du freinage.

Problème V21.21.17
------------------
En mode Assist normal, le jeu pouvait encore corriger directement :
- le heading du châssis;
- absX / absZ vers le centre de la route.

Cette correction intervenait après la physique des pneus. Elle pouvait donc se
sentir comme une force invisible qui ramenait la voiture vers la route, même si
le véhicule n'avait pas physiquement braqué assez pour le faire.

V21.21.18
---------
L'assistance normale ne modifie plus directement la position ni le heading.
Elle produit uniquement une petite commande de braquage qui passe ensuite par :

  steeringCommand -> angle réel des roues -> enveloppe latérale -> cercle de
  friction -> yaw -> momentum.

Ainsi, l'assistance ne peut pas créer d'adhérence. Si les pneus saturent, la
voiture peut quand même sous-virer, glisser ou quitter la route.

Conduite à droite
-----------------
Le point visé n'est plus la ligne centrale de la chaussée. Le système vise le
centre de la voie de droite, à environ 1,65 m du centre de la route dans le sens
de déplacement.

Le côté est inversé automatiquement lorsqu'on parcourt le tracé dans l'autre
sens : la voie reste toujours à droite du conducteur.

Comportement conducteur
------------------------
- Assistance complète seulement près de la zone neutre du volant.
- Elle s'efface progressivement avec l'entrée manuelle.
- À environ 28 % de commande manuelle, l'assistance est entièrement retirée.
- Contribution maximale : 30 % de la commande de direction.
- Assistance désactivée dans les airs.
- Assistance désactivée avec le frein à main.
- Assistance fortement réduite puis retirée lors d'un vrai décrochage des pneus.

L'autopilote conserve pour l'instant sa logique plus forte distincte. Ce
correctif concerne le mode Assist de conduite manuelle.

Fichiers fonctionnels modifiés
------------------------------
- src/main.js
- src/vehicle-dynamics.js
- package.json

QA ajoutée
----------
qa/V21_21_18_LANE_ASSIST_QA.mjs

Le test vérifie notamment :
- sens de la voie droite en circulation avant et inverse;
- correction vers la voie avec le volant plutôt qu'un déplacement du châssis;
- absence de correction une fois centré dans la voie droite;
- priorité complète du conducteur;
- absence d'assistance en drift, frein à main ou en vol;
- limite de 30 % de commande de direction.

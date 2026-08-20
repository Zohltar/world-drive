World Drive V21.21.19 — Right-Lane Assist Fix Candidate

Base: V21.21.18 Physical Lane Assist Candidate.

Correction ciblée:
- L'assistance de voie V21.21.18 utilisait la normale latérale opposée sur les
  coordonnées géographiques réelles de World Drive (+X est, -Z nord).
- Le point de visée est maintenant placé du côté DROIT du conducteur:
    right = (-cos(heading), +sin(heading))
- Cela fonctionne dans les deux sens de parcours de la route.
- Aucun retour de correction magique de position/heading: l'assistance continue
  d'agir uniquement sur le braquage des roues avant.

Aucun changement au moteur de pneus, friction circle, momentum, freinage,
terrain, rendu, frame pacing ou multijoueur.

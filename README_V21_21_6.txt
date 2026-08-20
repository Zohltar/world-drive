WORLD DRIVE V21.21.6 — FXAA / RENDER BALANCE CANDIDATE

But de cette candidate
----------------------
La V21.21.5 n'a pratiquement pas amélioré les FPS sur le poste de test alors
qu'elle réduisait déjà plusieurs coûts CPU. Cela indique que le plafond observé
(~30 FPS sur le même trajet) est principalement dans le rendu 3D, pas dans le
nouvel engin physique.

V21.21.6 conserve donc la qualité de scène de V21.21.4/V21.21.5 (distance 4500 m,
matériaux, relief, décor, boussole et cadrans plein régime) mais change le coût de
l'anti-aliasing :

- MSAA natif WebGL désactivé ;
- FXAA post-process officiel Three.js activé ;
- résolution gardée près du natif (plancher 0.94 au niveau perf maximal) ;
- mêmes matériaux, même distance de vue et même politique d'ombres ;
- matrices des objets statiques du monde gelées entre deux reconstructions ;
- vérification des frontières de streaming réduite à ~8 Hz ;
- état secondaire grip/slip roue par roue réduit de 24 à 20 Hz ;
- direction, propulsion, freinage, gravité en pente, lacet et déplacement restent
  calculés à chaque frame.

Le FPS reste affiché en bas à gauche.

Statut
------
CANDIDATE. Ne pas promouvoir comme baseline avant validation visuelle et FPS sur
le poste utilisateur.

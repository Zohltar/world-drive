World Drive V21.24.42 — Honda Civic daytime brightness + light logic fix

Changements:
- Civic GLB rendue plus claire de jour (midi) avec un remplissage visuel doux
  sur la peinture, les garnitures, les jantes et le vitrage.
- Ajout de la logique de lumières comme pour la WRX:
  - freinage = feux arrière rouges plus intenses;
  - recul = feux blancs de recul;
  - nuit = phares avant allumés + faisceaux projetés + veilleuses arrière rouges.
- Le main loop transmet maintenant braking / reversing / nightLevel au système Civic.
- Nettoyage du module Civic: correction de l'animation des roues et suppression
  d'un doublon dans animateWheels().

Fichiers principaux touchés:
- src/civic-glb.js
- src/main.js

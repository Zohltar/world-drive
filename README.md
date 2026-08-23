# World Drive V21.24.64 — Hyundai Sonata 2006 GLB candidate

![World Drive gameplay](docs/images/world-drive-gameplay.webp)

Conversion visuelle de la Sonata vers le modèle haute fidélité fourni `2006_hyundai_sonata.glb`.

## Changements

- remplace le visuel procédural de la Sonata par le GLB Hyundai Sonata 2006;
- orientation source vérifiée : **+Z = avant**, aucune rotation corrective nécessaire;
- normalisation à **4,85 m** de longueur, sans modifier la physique;
- roues GLB utilisées directement;
- quatre roues tournent avec la vitesse;
- roues avant braquent avec l'angle réel de direction;
- pivots de roues pris sur les quatre groupes authored dédiés du GLB;
- léger tuning de matériaux pour une meilleure lecture en plein jour;
- ajout du traitement lumineux habituel : phares de nuit + faisceaux, feux arrière de nuit, freinage et marche arrière;
- visuel procédural conservé uniquement comme fallback si le GLB ne charge pas.

## Géométrie vérifiée

Après normalisation :

- empattement visuel GLB ≈ **2,83 m**;
- voie visuelle ≈ **1,68 m**;
- hauteur du centre de roue ≈ **0,35 m**.

Ces valeurs sont cohérentes avec le profil physique existant (`wheelbase: 2.80`, `trackWidth: 1.60`) sans retoucher sa calibration.

## Inchangé

- masse / FWD / accélération / freinage;
- steering rack;
- grip et dynamique latérale;
- suspension;
- audio / transmission;
- terrain et streaming.

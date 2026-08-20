WORLD DRIVE V21.21.8 — FRAME PACING CANDIDATE

Objectif
- Conserver la qualité visuelle de V21.21.7.
- Réduire surtout les chutes ponctuelles vers ~30 FPS.
- Ne pas toucher au modèle physique principal validé en V21.21.x.

Optimisations ciblées
- Matrices des géométries statiques gelées entre les rebuilds.
- Vérification des frontières de streaming à ~8 Hz au lieu de chaque frame.
- Préchargement directionnel ramené à ~4 Hz.
- Rebuilds complets liés au DEM/hydro coalescés sous une seule tâche différée.
- Chargements OSM de panneaux / métadonnées ne reconstruisent plus terrain + route :
  les panneaux ont maintenant leur groupe visuel indépendant.
- Recentrage floating-origin moins fréquent : 520 m au lieu de 360 m.
- Un recenter annule un rebuild complet différé devenu redondant.
- Décor/horizon différés davantage pour mieux répartir les gros travaux.
- Solveur secondaire grip/slip roue-par-roue : 20 Hz au lieu de 24 Hz.

Qualité graphique
- Identique à V21.21.7 : MSAA conservé, matériaux conservés, distance de vue conservée,
  même gouverneur de résolution et mêmes ombres.
- Boussole et cadrans restent rafraîchis à chaque frame.
- FPS reste en bas à gauche.

Statut
- Candidate de test. Ne remplace pas encore la baseline stable.

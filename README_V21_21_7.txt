WORLD DRIVE V21.21.7 — QUALITY / PERFORMANCE RECOVERY CANDIDATE

Base
- Repart de V21.21.5, la dernière version jugée visuellement correcte.
- V21.21.6 / FXAA est abandonnée : plus laide et moins fluide sur le poste de test.

Objectif
- Conserver le rendu V21.21.4 / V21.21.5 : MSAA, 4500 m de profondeur, cadrans et boussole plein débit.
- Sortir du plateau ~30 FPS sans retoucher davantage la physique V21.21.

Changements V21.21.7
- Aucun FXAA / aucun EffectComposer.
- MSAA WebGL conservé.
- Distance caméra 4500 m conservée.
- Boussole et cadrans mis à jour à chaque frame.
- FPS en bas à gauche.
- Ombres directionnelles sacrifiées avant la résolution lorsque les FPS baissent.
- Gouverneur de résolution plus agressif mais encore nettement plus propre que V21.21.3 :
  niveau 0 = 1.00x natif max
  niveau 1 = 0.92x
  niveau 2 = 0.80x
  niveau 3 = 0.72x
- Moteur physique identique à V21.21.5.

Pourquoi ne pas couper davantage la physique ?
V21.21.5 avait déjà réduit fortement le coût CPU physique sans gain FPS mesurable sur le trajet de référence. C'est un signal fort que le plateau actuel est principalement côté rendu/fill-rate. Réduire encore la physique sacrifierait du comportement pour peu ou pas de gain.

Statut
Candidate de test. Ne pas promouvoir en baseline avant validation visuelle et FPS utilisateur.

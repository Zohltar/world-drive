World Drive V21.19 — Robust Road Mesh (candidate)

Base: V21.18 Flat Start Platform.

But de cette version:
- conserver la correction du terrain et le départ plat de V21.18;
- rendre la route visuellement robuste dans les pentes/lacets extrêmes;
- supprimer les grands triangles/bandes beige qui pouvaient traverser l'asphalte.

Changements route uniquement:
1. Un cadre latéral commun et borné est utilisé par l'asphalte, les accotements,
   les lignes et le volume 3D de route.
2. Les mitres de virage sont plafonnées pour éviter les pointes sur les épingles
   proches de 180 degrés.
3. Les accotements sont maintenant deux bandes latérales indépendantes.
   Il n'y a plus un grand ruban d'accotement caché sous toute la chaussée.
4. Les lignes blanches utilisent directement le même cadre que l'asphalte au lieu
   de recalculer leur propre polyligne décalée.

Aucun changement dans terrain.js par rapport à V21.18.

Cette version est une candidate à valider visuellement avant de la considérer
comme nouvelle baseline.

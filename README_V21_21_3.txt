World Drive V21.21.3 — 60 FPS Performance Candidate

Base: V21.21.2 performance candidate.

Objectif:
- conserver l'engin physique généralisé V21.21;
- viser 60 FPS au lieu de stabiliser autour de 20-30 FPS;
- réduire surtout le coût CPU des recherches route/suspension et le coût GPU des ombres/résolution.

Optimisations principales:
1. Ombres GPU
   - shadow maps directionnelles Three.js désactivées.
   - l'ombre de contact projetée sous le véhicule est conservée.
   - suppression d'un second rendu de scène coûteux pour les shadow maps.

2. Résolution adaptative orientée 60 FPS
   - antialias matériel WebGL désactivé.
   - pixel ratio natif plafonné à 1.0.
   - niveaux adaptatifs: 1.00 / 0.80 / 0.64 / 0.50.
   - le gouverneur baisse la résolution tant que les FPS restent sous la cible,
     puis remonte progressivement quand une marge >60 FPS est disponible.

3. Recherche de route chaude
   - l'index spatial n'utilise plus de clés texte "cx:cz" à chaque échantillon.
   - index Map numérique imbriqué cx -> cz.
   - état de recherche réutilisé; moins d'objets temporaires.
   - roadFrameAt / roadSurfaceAt peuvent remplir un objet fourni par l'appelant.

4. Suspension / décollage
   - buffers de samples/contact/compression réutilisés d'une frame à l'autre.
   - détection de crête basée sur le support au centre du châssis.
   - 3 probes de support au lieu de 12 probes supplémentaires au-dessus de 7.5 m/s.
   - le support indépendant de chaque roue demeure utilisé pour la suspension réelle.

5. Dynamique véhicule
   - résultats de traction, freinage, direction, enveloppe latérale et grip réutilisés.
   - suppression d'une grande partie des allocations par frame.
   - équations physiques inchangées; comparaison numérique V21.21.2 -> V21.21.3: 0 différence.

6. Diagnostic
   - FPS toujours affichés en bas à droite.
   - une ligne [WorldDrive perf] est écrite dans la console toutes les 5 s avec:
     FPS, échelle de rendu, niveau qualité, coût simulation CPU et coût de soumission render.

Important:
Le changement de résolution et la suppression des shadow maps sont des compromis visuels volontaires.
La physique, les routes, le terrain, l'hydrographie, le décor OSM, Electron et le multijoueur ne sont pas retirés.

Statut:
Candidate de test. Ne pas promouvoir baseline avant validation utilisateur sur plusieurs presets.

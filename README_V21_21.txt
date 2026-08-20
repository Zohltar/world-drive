WORLD DRIVE V21.21 — GENERALIZED VEHICLE PHYSICS (CANDIDATE)

Base: V21.20.1 stable.
Status: candidate de test — ne remplace pas la baseline tant que le feeling n'a pas été validé en jeu.

OBJECTIF
Préparer le moteur physique à des catégories de véhicules plus variées, notamment les futurs camions et remorques, sans bricoler une physique séparée autour du modèle voiture 4 roues actuel.

NOUVEAU — ARCHITECTURE PHYSIQUE
- Nouveau module pur src/vehicle-dynamics.js, testable hors du renderer.
- Châssis décrit par masse, centre de gravité, empattement, voie, inertie de lacet et essieux.
- Essieux généralisés : position, charge statique, direction, part de propulsion, part de freinage, largeur de voie et nombre de roues.
- Le moteur mathématique accepte déjà plus de deux essieux et plus de quatre roues.
- Les profils actuels gardent leurs champs historiques pour compatibilité, mais reçoivent une calibration châssis plus complète.
- Métadonnées de point d'attelage ajoutées aux véhicules actuels pour préparer l'articulation future.
- Un corps non motorisé avec driveShare=0 ne peut pas générer artificiellement de propulsion (préparation remorque).

NOUVEAU — DYNAMIQUE
- Transfert de charge longitudinal selon accélération/freinage, hauteur du centre de gravité et empattement.
- Limitation de traction selon adhérence et essieux réellement moteurs.
- Frein de service limité par l'adhérence disponible; frein à main limité au groupe arrière.
- Gravité réelle dans les pentes : montée pénalise l'accélération, descente ajoute de l'accélération.
- Sur route, la pente est prise sur la branche cumulative exacte du trajet, important dans les lacets superposés de Yungas.
- Hors route, la pente est estimée directement depuis le DEM devant/derrière le véhicule.
- En l'air, les pneus ne peuvent plus produire propulsion/freinage/force de roulement.
- Inertie de lacet dérivée du gabarit et de la masse : un futur véhicule lourd/long répond naturellement plus lentement en rotation.
- Modèle de charge/adhérence par roue rendu compatible avec un nombre variable de roues.
- Plan de support suspension calculé par ajustement multi-roues plutôt que par hypothèse rigide de quatre contacts.

COMPATIBILITÉ / INTENTION
- La courbe de commande de direction et l'enveloppe latérale pré-glisse V21.20.1 ont été conservées numériquement pour les véhicules actuels.
- Les changements de comportement intentionnels concernent surtout : pente, transfert de charge, traction longitudinale, état en l'air et inertie de lacet.
- Terrain, génération de route, Electron, proxy OSM et multijoueur Windows sont inchangés.
- Aucune remorque articulée visible/physique n'est encore ajoutée dans V21.21; cette version construit la fondation.

FICHIERS V21.21
- src/main.js
- src/vehicle-system.js
- src/vehicle-dynamics.js (nouveau)
- src/vehicle-presentation.js
- package.json
- qa/V21_21_PHYSICS_QA.mjs
- qa/V21_21_FUZZ_QA.mjs

TEST RECOMMANDÉ CÔTÉ UTILISATEUR
1. Route 389 — WRX puis ID.4 : montées/descentes, freinage en pente et stabilité générale.
2. Route 169 — Civic/Sonata : vérifier le comportement FWD sous accélération et en courbe.
3. Route 132 — Countach : vérifier propulsion RWD et transfert de charge.
4. Yungas — WRX + Countach : épingles, très fortes pentes, changements de branche et éventuels décollages.
5. F1 — route ouverte : stabilité haute vitesse et absence de régression de direction.

Points à surveiller particulièrement :
- sensation d'accélération en montée vs descente;
- départ fort avec Civic/Sonata (FWD);
- freinage en forte pente;
- comportement après une bosse/crête lorsque les roues quittent le sol;
- direction à haute vitesse;
- suspension/roulis/tangage sur les irrégularités.

Voir VALIDATION_V21_21.txt pour le détail de l'assurance qualité automatisée.

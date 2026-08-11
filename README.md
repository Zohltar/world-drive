# World Drive V18

**World Drive** est un simulateur de conduite 3D dans le navigateur construit avec **Three.js** et **Vite**.

Le projet combine des routes réelles, du relief, de l’imagerie, des données OpenStreetMap, une physique de conduite légère, plusieurs véhicules procéduraux et un mode multijoueur LAN sans collisions.

La V18 marque la fin d’une grosse phase de développement : le moteur monolithique des premières versions a été découpé en sous-systèmes indépendants, le multijoueur est fonctionnel et les véhicules ont maintenant leur propre personnalité physique, visuelle et sonore.

---

## Fonctionnalités principales

### Monde et routes

- Routes réelles et création de trajets
- Recherche de lieux et géocodage
- Presets de routes québécoises
- Relief basé sur des données d’élévation
- Imagerie aérienne / satellite
- Mode terrain topographique lorsque l’imagerie est désactivée
- Eau, rivières, lacs, ponts, bâtiments, forêt et décor OSM
- Panneaux routiers et métadonnées de route
- Limites de vitesse OSM
- Streaming dynamique du monde autour du joueur
- Cache persistant IndexedDB
- Floating origin pour garder une bonne précision sur les longs trajets

### Conduite

- Physique propre à chaque véhicule
- Direction sensible à la vitesse
- Limite d’accélération latérale propre à chaque véhicule
- Assistance de maintien sur la route
- Pilote automatique
- Frein à main
- Support indépendant des quatre roues sur la route / le terrain
- Dévers, pente, suspension visuelle, roulis et tangage
- Ombre procédurale sous le véhicule
- Crissement des pneus lié à la vraie saturation d’adhérence
- Traces de pneus procédurales après glisse soutenue
- Traces au freinage et au frein à main

### Jour / nuit

- Heure de la journée réglable
- Éclairage dynamique
- Phares automatiques
- Phares visibles sur les autres joueurs en multijoueur
- Croissant de lune procédural
- Faible éclairage lunaire pour garder les véhicules lisibles la nuit

### Audio

- Audio activable / désactivable
- Profils sonores propres aux véhicules
- Moteurs thermiques et électriques
- F1 V8 synthétique
- Countach V12 synthétique
- Crissement des pneus
- Crissement au freinage

---

## Véhicules disponibles

| Véhicule | Type | Caractère |
|---|---|---|
| Volkswagen ID.4 | VÉ AWD | Stable et progressif |
| Subaru WRX | AWD turbo | Plus vif et plus accrocheur |
| Honda Civic noire | Traction | Berline compacte |
| Hyundai Sonata Sport blanche | Traction | Berline routière |
| BMW i3 2017 | VÉ propulsion | Petite électrique légère |
| Lamborghini Countach 80s | V12 propulsion | Supercar old-school, 320 km/h |
| F1 2010 | Monoplace | Très forte adhérence, 350 km/h |

Les modèles sont construits procéduralement dans le code : aucune librairie de modèles 3D externes n’est requise.

---

## Multijoueur LAN

La V18 inclut un mode multijoueur LAN léger.

Chaque ordinateur simule **sa propre voiture localement**. Le serveur WebSocket ne fait que relayer l’état des joueurs.

### Principes

- Plusieurs joueurs simultanés
- Position basée sur latitude / longitude
- Interpolation côté client
- Modèle exact du véhicule choisi par chaque joueur
- Suspension / dévers reproduits sur les voitures distantes
- Phares et feux de freinage distants
- Skid marks distants
- Aucun calcul de physique serveur
- **Aucune collision entre joueurs**

L’absence de collision est volontaire : World Drive est avant tout un jeu d’exploration et de conduite.

### Lancer une partie LAN

Sur le PC qui héberge la partie, ouvrir deux terminaux.

#### Terminal 1 — serveur multijoueur

```bash
node server/multiplayer-server.mjs
```

Le serveur écoute par défaut sur le port :

```text
8081
```

#### Terminal 2 — World Drive

```bash
npm run dev -- --host 0.0.0.0
```

Vite utilise normalement le port :

```text
5173
```

Sur le PC hôte :

```text
http://localhost:5173
```

Sur les autres ordinateurs du réseau :

```text
http://ADRESSE_IP_DU_PC_HOTE:5173
```

Le client multijoueur utilise automatiquement le même nom d’hôte avec le port `8081`.

Si nécessaire, autoriser les ports **5173** et **8081** dans le pare-feu du PC hôte.

---

## Installation

### Prérequis

- Node.js LTS
- npm
- Un navigateur moderne avec WebGL
- Chrome / Edge / Firefox récent recommandé

### Premier lancement

```bash
npm install
npm run dev
```

Vite affichera une adresse locale, généralement :

```text
http://localhost:5173
```

Sous Windows, `START_WORLD_DRIVE.bat` peut également être utilisé pour installer les dépendances au premier lancement et démarrer Vite.

---

## Contrôles

### Clavier

| Touche | Action |
|---|---|
| `W` / `↑` | Accélérer |
| `S` / `↓` | Freiner / reculer |
| `A` / `←` | Tourner à gauche |
| `D` / `→` | Tourner à droite |
| `Espace` | Frein à main |
| `C` | Changer de caméra |
| `L` | Assistance route ON / OFF |
| `P` | Pilote automatique ON / OFF |
| `R` | Replacer la voiture sur la route |

### Manette Xbox / compatible

- Stick gauche : direction
- Stick droit : caméra
- RT : accélérateur
- LT : frein / marche arrière
- A : frein à main
- Y : changer de caméra
- X : assistance route
- B : pilote automatique
- Menu : replacer la voiture

---

## Challenge de trajet

La carte du trajet contient un petit mode challenge :

- **Temps** : démarre lorsque la voiture commence à rouler
- **Qualité** : commence à 100 %
- Chaque seconde complète passée hors route retire 1 point de qualité
- Le challenge se termine à l’arrivée

Le système utilise le même état Route / Terrain que la physique du véhicule.

---

## Architecture V18

Le projet n’est plus un gros fichier JavaScript monolithique.

`main.js` agit principalement comme **orchestrateur** tandis que les fonctions spécialisées vivent dans leurs propres modules.

```text
world-drive/
│
├── index.html
├── package.json
├── START_WORLD_DRIVE.bat
│
├── server/
│   └── multiplayer-server.mjs
│
└── src/
    ├── main.js
    ├── styles.css
    │
    ├── vehicle-system.js
    ├── vehicle-visuals.js
    ├── vehicle-presentation.js
    ├── multiplayer.js
    ├── multiplayer-visuals.js
    ├── skidmarks.js
    ├── audio.js
    ├── gamepad.js
    ├── camera.js
    │
    ├── routing.js
    ├── routing-service.js
    ├── geocoding.js
    │
    ├── terrain.js
    ├── elevation.js
    ├── imagery.js
    ├── water-data.js
    ├── water-renderer.js
    ├── scenery-data.js
    ├── scenery-renderer.js
    ├── bridges.js
    ├── signs.js
    │
    ├── overpass.js
    ├── cache.js
    └── world-streaming.js
```

### Responsabilités principales

**`main.js`**  
Coordonne les systèmes, l’état de conduite, le HUD et la boucle principale.

**`vehicle-system.js`**  
Registre des véhicules et paramètres physiques.

**`vehicle-visuals.js`**  
Modèles procéduraux, roues, phares et feux du véhicule local.

**`vehicle-presentation.js`**  
Suspension visuelle, roulis, tangage, dévers des roues et ombre du véhicule.

**`audio.js`**  
Moteurs, pneus et sons de freinage.

**`multiplayer.js`**  
Synchronisation réseau des joueurs.

**`multiplayer-visuals.js`**  
Reproduction locale des véhicules distants, phares, suspension et support au sol.

**`skidmarks.js`**  
Traces de pneus locales et multijoueur via un `InstancedMesh` partagé.

**`world-streaming.js`**  
Coordonne les chargements dynamiques autour de la voiture.

---

## Performance

Plusieurs optimisations sont maintenant intégrées :

- `InstancedMesh` pour les éléments répétés
- pool circulaire pour les skid marks
- chargement visuel différé / coalescé
- préchargement directionnel
- cache IndexedDB
- floating origin
- aucune physique multijoueur côté serveur
- aucun spotlight distant avec ombres
- réutilisation des géométries pour les voitures distantes

Le but est de garder le jeu fluide même pendant les longs trajets et avec plusieurs joueurs.

---

## Développement

Le workflow Git utilisé pour le projet est :

```text
dev   → développement et tests
main  → version stable
```

Une fois une fonctionnalité validée sur `dev`, elle est fusionnée dans `main`.

### Build de production

```bash
npm run build
```

Le résultat est généré dans :

```text
dist/
```

Pour tester le build :

```bash
npm run preview
```

---

## Données et services externes

World Drive utilise ou peut utiliser des données provenant notamment de :

- OpenStreetMap
- services Overpass
- services de routage
- services d’élévation
- imagerie cartographique

La disponibilité et la précision de certaines données peuvent donc varier selon la région.

---

## Statut du projet

**V18 — stable**

La V18 termine principalement :

- la modularisation du moteur
- le multijoueur LAN
- les véhicules distants fidèles au véhicule local
- les phares multijoueur
- la Countach 80s
- l’éclairage lunaire
- le modèle naturel de crissement des pneus
- les skid marks locaux et multijoueur

La prochaine phase de développement commencera avec la **V19**.

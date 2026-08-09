# World Drive V5.2.8 — VS Code Edition

Cette migration conserve la logique de la V5.2.8 et sépare seulement les trois gros blocs :

- `index.html` : interface HTML
- `src/styles.css` : apparence
- `src/main.js` : moteur du jeu
- `package.json` : lancement avec Vite

## Premier lancement

1. Installer Node.js LTS si ce n'est pas déjà fait.
2. Ouvrir ce dossier dans Visual Studio Code.
3. Ouvrir **Terminal > New Terminal**.
4. Exécuter :

```bash
npm install
npm run dev
```

5. Vite affiche une adresse locale, habituellement du genre `http://localhost:5173/`.
6. Ctrl+clic sur l'adresse pour ouvrir World Drive dans Chrome.

## Arrêter le serveur

Dans le terminal VS Code où Vite fonctionne :

```text
Ctrl+C
```

## Construire une version distribuable

```bash
npm run build
```

La version produite sera dans le dossier `dist/`.

## Pourquoi cette première migration reste volontairement simple

La V5.2.8 est devenue un gros programme où plusieurs systèmes partagent encore des variables globales.
Découper immédiatement le moteur en 10 modules risquerait de casser des dépendances difficiles à voir.

Cette étape sépare HTML / CSS / JavaScript sans changer l'architecture interne.
Une fois cette version confirmée stable dans VS Code, la prochaine phase pourra extraire progressivement :

- `vehicle.js`
- `gamepad.js`
- `audio.js`
- `camera.js`
- `routing.js`
- `osm.js`
- `cache.js`
- `world.js`
- `ui.js`

Git est fortement recommandé avant cette deuxième phase.

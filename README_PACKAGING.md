# World Drive V21.20.1 — Windows LAN intégré

Cette version part de la baseline V21.19 et ajoute le multijoueur LAN directement dans l'application Windows Electron.

## Nouveau dans la version Windows

Dans **Menu > Multijoueur**, l'application Windows affiche maintenant une section **Session Windows** avec :

- **Héberger une session** : démarre automatiquement le relais multijoueur sur le PC hôte, port 8081, puis connecte le joueur local.
- **Se connecter** : accepte une adresse du type `192.168.1.42`, `PC-SALON` ou `192.168.1.42:8081`, crée un relais local vers le PC hôte, puis connecte le jeu.
- **Arrêter** : ferme l'hébergement ou le relais de connexion actif.
- L'adresse LAN du PC hôte est affichée directement dans le menu pour pouvoir la donner aux autres joueurs.

Le navigateur/Vite conserve son comportement multijoueur existant. Les nouveaux boutons sont affichés uniquement dans Electron.

## Pourquoi un relais local pour « Se connecter »

Le client multijoueur historique de World Drive se connecte à `ws://<nom-hôte-de-la-page>:8081`. Dans Electron, la page du jeu est servie sur `127.0.0.1`, donc le client cherche naturellement `127.0.0.1:8081`.

V21.20.1 conserve ce client intact :

- en mode **Héberger**, Electron ouvre le vrai serveur LAN sur `0.0.0.0:8081` ;
- en mode **Se connecter**, Electron ouvre un petit proxy TCP sur `127.0.0.1:8081` qui transmet la connexion WebSocket vers le PC hôte.

Cela évite de modifier le protocole multijoueur et garde la compatibilité avec les fonctions existantes : véhicules distants, suspension, phares, skid marks et absence de collisions réseau.

## Pare-feu Windows

Le PC qui héberge doit accepter les connexions entrantes sur le port TCP **8081**. Windows peut afficher une demande d'autorisation au premier hébergement. Autoriser World Drive sur le réseau privé/LAN.

## Test sur le PC de développement

```powershell
npm install
npm run desktop
```

Puis dans World Drive :

1. Menu > Multijoueur.
2. Sur le PC hôte : **Héberger une session**.
3. Noter l'adresse affichée, par exemple `ws://192.168.1.20:8081`.
4. Sur l'autre PC : entrer `192.168.1.20` et cliquer **Se connecter**.

## Générer l'application Windows

```powershell
npm run make
```

ou lancer :

```text
BUILD_WINDOWS_RELEASE.bat
```

Les fichiers générés sont dans `out\make\`.

## Validation effectuée

- syntaxe `src/main.js` : OK
- syntaxe Electron main/preload/runtime : OK
- relais WebSocket embarqué : test local OK
- connexion via proxy local vers un relais distant : test local OK
- échange `hello`, `welcome`, `state`, roster et déconnexion : OK

Le test local utilise plusieurs clients WebSocket et un proxy séparé afin de reproduire le chemin utilisé par deux applications Windows sur un LAN.

## V21.22.5 satellite terrain rewrite
This candidate also replaces `src/imagery.js`. Copy that file along with
`src/main.js` and `src/terrain.js`; otherwise the old monolithic imagery mapper
will remain active and the terrain streaking fix will not be present.


## V21.22.6 satellite/procedural ownership fix

Cette candidate corrige le terrain procédural qui pouvait repasser visuellement au-dessus des chunks satellite en pente. Les chunks satellite sont rendus en premier et marquent stencil ref 2; les couches de terrain procédural rejettent ensuite ces pixels. La physique, le streaming hitch-free et le preload buffer sont inchangés.

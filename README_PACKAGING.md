# World Drive V21.12 — prototype de packaging Windows

Cette version ajoute une enveloppe Electron autour du jeu sans modifier la physique ou le gameplay.

## Ce qui change

- `npm run dev` reste le workflow Vite habituel pour développer.
- `npm run desktop` construit `dist/` puis lance World Drive dans Electron.
- `npm run make` construit `dist/` puis génère les distribuables Windows avec Electron Forge.
- `BUILD_WINDOWS_RELEASE.bat` automatise le build Windows.
- Le renderer Electron reste sandboxé : pas de Node.js dans le code du jeu.
- Le jeu est servi par un petit serveur HTTP local sur `127.0.0.1` avec un port libre choisi automatiquement.
- Le dossier racine `assets/` est recopié dans `dist/assets/` au build afin de conserver les samples audio.

## Premier test sur le PC de développement

Dans PowerShell, à la racine du projet :

```powershell
npm install
npm run desktop
```

Le jeu doit ouvrir sa propre fenêtre World Drive.

## Générer la version distribuable Windows

Option simple : double-cliquer sur :

```text
BUILD_WINDOWS_RELEASE.bat
```

Ou en PowerShell :

```powershell
npm run make
```

Les résultats seront sous :

```text
out\make\
```

Forge génère notamment :

- `WorldDriveSetup.exe` — installateur Squirrel.Windows
- un ZIP Windows contenant l'application packagée

L'utilisateur final n'a pas besoin d'installer Node.js, npm ou Vite.

## Important — multijoueur V21.12

V21.12 est volontairement un prototype de packaging **solo**.

Le workflow LAN actuel par navigateur/Vite reste inchangé dans le projet source. Dans l'application Electron, le contenu est servi localement sur `127.0.0.1`; le client multijoueur actuel déduit encore son serveur WebSocket à partir du nom d'hôte de la page. Un second PC packagé chercherait donc son propre `127.0.0.1:8081`.

La prochaine étape logique est d'intégrer le serveur LAN dans Electron et d'ajouter explicitement « Héberger » / « Rejoindre ».

## Signature Windows

L'installateur V21.12 n'est pas signé. Windows SmartScreen peut donc afficher un avertissement sur un PC qui ne connaît pas encore l'application. La signature pourra être ajoutée plus tard sans changer le jeu.

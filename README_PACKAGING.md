# World Drive — Packaging

La version machine et le canal de build sont définis dans `package.json`:

- `version` : version semver utilisée par Electron Forge / Squirrel (ex. `21.31.0`)
- `worldDriveChannel` : `dev` sur la branche de développement; `stable` uniquement lors d'une promotion de release

`src/version.js`, le titre Electron et le User-Agent desktop dérivent tous de ces métadonnées. Ne pas réintroduire de numéro de version codé en dur ailleurs.

## Build Windows

Depuis la racine du dépôt :

```powershell
npm ci
npm run make
```

Ou lancer `BUILD_WINDOWS_RELEASE.bat` sous Windows.

Les distribuables sont générés sous `out/make/`, notamment l'installateur Squirrel et le ZIP portable.

Avant une release stable :

1. Mettre à jour `package.json` (`version` et `worldDriveChannel: "stable"`).
2. Mettre à jour `package-lock.json` via npm afin qu'il reflète la même version.
3. Exécuter `node qa-version-branding-a6.mjs`.
4. Exécuter la Dev Integration QA complète et le build de production.
5. Ne promouvoir vers `main` qu'après validation.

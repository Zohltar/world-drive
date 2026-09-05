module.exports = {
  packagerConfig: {
    asar: true,
    name: 'World Drive',
    executableName: 'World Drive',
    prune: true,
    ignore: [
      /^\/src($|\/)/,
      /^\/assets($|\/)/,
      /^\/docs($|\/)/,
      /^\/server($|\/)/,
      /^\/world-data($|\/)/,
      /^\/public\/world-data\/osm($|\/)/,
      /^\/README(?:_|\.|$)/i,
      /^\/START_WORLD_DRIVE\.bat$/i,
      /^\/BUILD_WINDOWS_RELEASE\.bat$/i,
      /^\/UPDATE_VERSION_/i,
      /^\/\.git(?:ignore)?$/
    ]
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'WorldDrive',
        setupExe: 'WorldDriveSetup.exe',
        exe: 'World Drive.exe',
        noMsi: true,
        authors: 'World Drive',
        description: 'World Drive - conduite sur routes réelles avec relief et monde dynamique.'
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32']
    }
  ]
};

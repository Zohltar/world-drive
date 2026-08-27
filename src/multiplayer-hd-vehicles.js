// Compatibility entrypoint retained for older imports.
// M3 owns the only remote HD registry/cache implementation.
export {
  createRemoteHdVehicle,
  supportsRemoteHdVehicle,
  remoteHdDiagnostics
} from './multiplayer-hd-vehicles-m3.js';

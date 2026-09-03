import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const srcDir=path.join(root,'src');

// R9 freezes the accepted direct-file topology of src/ after R8. This is an
// architecture gate, not a request to move more files. New subdirectories are
// allowed; any new direct file requires an explicit R9 policy update/review.
const ROOT_POLICY=Object.freeze({
  stableFacades:Object.freeze([
    'application-settings.js',
    'cache.js',
    'desktop-overpass-transport.js',
    'diagnostics.js',
    'gamepad.js',
    'geocoding.js',
    'heading-compass.js',
    'instrument-cluster.js',
    'keyboard-controls.js',
    'loaded-settings-application.js',
    'local-world-builder-p926.js',
    'minimap.js',
    'overpass.js',
    'road-furniture.js',
    'road-geometry.js',
    'route-challenge.js',
    'route-lifecycle.js',
    'route-planner-ui.js',
    'route-presets.js',
    'routing-service.js',
    'routing.js',
    'scenery-renderer.js',
    'startup-ui.js',
    'streaming-coordinator-p913.js',
    'terrain-p926.js',
    'transmission-network-state.js',
    'transmission-runtime-bridge.js',
    'v21-menu.js',
    'version.js',
    'wheel-ground-support.js',
    'world-materials.js',
    'world-scene.js'
  ]),
  protectedOwners:Object.freeze([
    'elevation.js',
    'forest-authored-lite.js',
    'forest-chunk-streamer-core.js',
    'forest-chunk-streamer.js',
    'forest-proxy-assets.js',
    'forest-streaming-policy.js',
    'forest-terrain-sampler.js',
    'forest-water-assets.js',
    'local-world-builder-p925.js',
    'terrain-p925.js',
    'terrain.js',
    'water-data.js',
    'water-offline-hydro-source.js',
    'water-renderer.js'
  ]),
  runtimeOwners:Object.freeze([
    'autopilot-controller.js',
    'bridges.js',
    'camera.js',
    'driving-runtime-base.js',
    'driving-runtime.js',
    'environment-controller.js',
    'frame-runtime-profiler.js',
    'imagery.js',
    'local-world-builder.js',
    'main.js',
    'multiplayer-visuals.js',
    'multiplayer.js',
    'scenery-data.js',
    'signs.js',
    'skidmarks.js',
    'sky-lighting.js',
    'streaming-coordinator.js',
    'styles.css',
    'transmission-controller.js',
    'v21-ui.css',
    'world-streaming.js'
  ]),
  migrationDebt:Object.freeze([])
});

const actual=fs.readdirSync(srcDir,{withFileTypes:true})
  .filter(entry=>entry.isFile())
  .map(entry=>entry.name)
  .sort();
const classified=Object.values(ROOT_POLICY).flat();
const duplicates=classified.filter((name,index)=>classified.indexOf(name)!==index).sort();
const accepted=[...new Set(classified)].sort();
const unexpected=actual.filter(name=>!accepted.includes(name));
const missing=accepted.filter(name=>!actual.includes(name));

assert.deepEqual(duplicates,[],`R9 root policy contains duplicate classifications: ${duplicates.join(', ')}`);
assert.equal(accepted.length,67,`R9 accepted src/ root snapshot changed unexpectedly: ${accepted.length} classified files`);
assert.deepEqual(
  unexpected,
  [],
  `R9 root cleanliness: new unexplained direct src/ files detected: ${unexpected.join(', ')}. `+
    'Place new implementation code in an owned folder, or explicitly update the R9 policy with architectural justification.'
);
assert.deepEqual(
  missing,
  [],
  `R9 root cleanliness: accepted direct src/ files disappeared without policy update: ${missing.join(', ')}`
);
assert.deepEqual(
  ROOT_POLICY.migrationDebt,
  [],
  'R9 direct-root placement debt must stay empty; historical P9/V21 naming debt belongs to Phase O.'
);

console.log('R9 ROOT CLEANLINESS QA: PASS',{
  directFiles:actual.length,
  stableFacades:ROOT_POLICY.stableFacades.length,
  protectedOwners:ROOT_POLICY.protectedOwners.length,
  runtimeOwners:ROOT_POLICY.runtimeOwners.length,
  migrationDebt:ROOT_POLICY.migrationDebt.length
});

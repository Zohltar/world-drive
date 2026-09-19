// Synthetic regression for the exact Rock and Ice metadata observed in the pinned source.
import assert from 'node:assert/strict';
import { createBiomeClassifier } from '../tools/biomes/biome-classifier-prototype.mjs';
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function fixture() {
  return { schema: 'world-drive-biome-atlas-v1', crs: 'EPSG:4326', width: 360, height: 180,
    west: -180, north: 90, cellDegrees: 1,
    source: { id: 'synthetic-test-only', license: 'CC-BY-4.0', sha256: '0'.repeat(64) },
    records: [null, { id: 1, biome: 1, name: 'synthetic tropical', realm: 'test' },
      { id: 6, biome: 6, name: 'synthetic boreal', realm: 'test' }], cells: new Uint16Array(64800) };
}
const slotFor = biome => biome === 6 ? 2 : 1;
check('real-source rock/ice profile preserves the original tundra code', () => {
  const a = fixture(); a.source.id = 'RESOLVE-ECOREGIONS-2017';
  a.records[1] = { id: 0, biome: 11, name: 'Rock and Ice', realm: 'N/A' };
  a.cells.fill(1);
  const r = createBiomeClassifier(a).query(70.5, -40.5);
  assert.equal(r.family, 'rock-ice'); assert.equal(r.biome, 98);
  assert.equal(r.ecoregion.biome, 11); assert.equal(r.ecoregion.id, 0);
  assert.deepEqual(r.mix, [{ biome: 98, weight: 1 }]);
  assert.equal(r.canopy, 'none'); assert.equal(r.placementAuthority, false);
});
check('rock/ice recognition does not reclassify ordinary tundra or unknown sources', () => {
  const a = fixture(); a.source.id = 'RESOLVE-ECOREGIONS-2017';
  a.records[1] = { id: 420, biome: 11, name: 'Pacific Coastal Mountain icefields and tundra', realm: 'Nearctic' };
  a.cells.fill(1);
  assert.equal(createBiomeClassifier(a).query(70.5, -40.5).family, 'alpine-tundra');
  a.records[1] = { id: 0, biome: 11, name: 'Rock and Ice', realm: 'N/A' };
  a.source.id = 'different-source';
  assert.equal(createBiomeClassifier(a).query(70.5, -40.5).family, 'alpine-tundra');
});
check('rock/ice transition weights use the same local profile as the primary result', () => {
  const a = fixture(); a.source.id = 'RESOLVE-ECOREGIONS-2017';
  a.records[1] = { id: 0, biome: 11, name: 'Rock and Ice', realm: 'N/A' };
  for (let row = 0; row < 180; row++) for (let col = 0; col < 360; col++) a.cells[row * 360 + col] = col < 180 ? 1 : slotFor(6);
  const r = createBiomeClassifier(a).query(0.5, -0.001);
  assert.equal(r.family, 'rock-ice'); assert.ok(r.mix.some(v => v.biome === 98));
  assert.ok(!r.mix.some(v => v.biome === 11));
  assert.ok(Math.abs(r.mix.reduce((n, v) => n + v.weight, 0) - 1) < 1e-10);
});
console.log(`Block 8 rock/ice: ${checks}/${checks} test groups PASS`);

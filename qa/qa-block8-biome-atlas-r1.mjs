// Geographic smoke on a REAL generated atlas. Separate from synthetic contract tests.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createBiomeClassifier } from '../tools/biomes/biome-classifier-prototype.mjs';

const directory = process.argv[2];
assert.ok(directory, 'Usage: node qa/qa-block8-biome-atlas-r1.mjs ATLAS_DIRECTORY');
const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
assert.equal(manifest.source.id, 'RESOLVE-ECOREGIONS-2017');
assert.equal(manifest.encoding, 'uint16-little-endian-gzip');
assert.ok([0.1, 0.05].includes(manifest.cellDegrees));
assert.ok(manifest.records.length > 800 && manifest.records.length < 1000);
const raw = gunzipSync(readFileSync(join(directory, 'cells.u16le.gz')), { maxOutputLength: 51_840_000 });
assert.equal(raw.byteLength, manifest.width * manifest.height * 2);
assert.equal(createHash('sha256').update(raw).digest('hex'), manifest.cellSha256);
const cells = new Uint16Array(raw.length / 2);
for (let i = 0; i < cells.length; i++) cells[i] = raw.readUInt16LE(i * 2);
const start = performance.now();
const service = createBiomeClassifier({ ...manifest, cells });
const constructionMs = performance.now() - start;
// Broad regional interior checks; city coordinates do NOT authorize urban forest.
const cases = [
  ['Manic-5 regional context', 50.8, -68.8, ['boreal']],
  ['Montreal regional context', 45.5, -73.6, ['temperate']],
  ['Borneo interior', 0.5, 114, ['tropical']],
  ['Central Sahara', 24, 10, ['desert']],
  ['Baffin Island', 67.5, -64, ['alpine-tundra']],
  ['Tibetan plateau', 32, 88, ['alpine-tundra']],
];
const results = cases.map(([name, lat, lon, expected]) => {
  const result = service.query(lat, lon);
  assert.ok(expected.includes(result.family), `${name}: expected ${expected}, got ${JSON.stringify(result)}`);
  assert.deepEqual(service.query(lat, lon), result);
  return { name, lat, lon, biome: result.biome, family: result.family, ecoregion: result.ecoregion.name };
});
// A sensitive road corridor is measured, not falsely certified by a broad-family smoke.
const corridor = Array.from({ length: 21 }, (_, i) => {
  const lat = -16.33 + i * 0.01, lon = -67.95 + i * 0.0125;
  const r = service.query(lat, lon);
  return { lat, lon, biome: r.biome, ecoregion: r.ecoregion?.name ?? null };
});
assert.equal(service.query(0, -140).reason, 'no-data');
assert.deepEqual(service.query(0, -180), service.query(0, 180));
const queryStart = performance.now();
for (let i = 0; i < 100000; i++) service.query(50.8 + (i % 1000) / 100000, -68.8 + i / 100000);
const report = { geographicChecks: results.length, results, yungasCorridorDiagnosticOnly: corridor,
  sourceSha256: manifest.source.sha256, cellSha256: manifest.cellSha256,
  constructionMs, query100kMs: performance.now() - queryStart, diagnostics: service.diagnostics(),
  limitations: ['Regional raster, not exact polygon boundaries', 'No elevation/treeline override',
    'No production palette/asset integration', 'Timing is not a GPU/frame-pacing benchmark'] };
writeFileSync(resolve(directory, 'geographic-qa.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
console.log(`Block 8 real-atlas geographic smoke: ${results.length}/${results.length} PASS`);

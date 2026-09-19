import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createBiomeClassifier, BIOME_PROFILES, ATLAS_SCHEMA } from '../tools/biomes/biome-classifier-prototype.mjs';

let checks = 0;
function check(name, action) { action(); checks++; console.log(`PASS ${name}`); }
function fixture() {
  return { schema: ATLAS_SCHEMA, crs: 'EPSG:4326', width: 360, height: 180,
    west: -180, north: 90, cellDegrees: 1,
    source: { id: 'synthetic-test-only', license: 'CC-BY-4.0', sha256: '0'.repeat(64) },
    records: [null, ...Object.values(BIOME_PROFILES).filter(p => p.biome).map(p => ({
      id: p.biome, biome: p.biome, name: `SYNTHETIC ${p.palette}`, realm: 'test-only',
    }))], cells: new Uint16Array(360 * 180) };
}
const atlas = fixture();
function slotFor(biome) { return atlas.records.findIndex(r => r?.biome === biome); }
// Artificial global stripes exercise the code, NOT ecological accuracy at named places.
for (let row = 0; row < 180; row++) for (let col = 0; col < 360; col++) {
  atlas.cells[row * 360 + col] = 1 + Math.floor(col / 24) % (atlas.records.length - 1);
}
const service = createBiomeClassifier(atlas, { cacheLimit: 8 });
check('all 14 source biomes and rock/ice retain distinct profiles', () => {
  assert.equal(Object.keys(BIOME_PROFILES).length, 16);
  for (let i = 1; i < atlas.records.length; i++) {
    const result = service.query(0.5, -180 + (i - 1) * 24 + 0.5);
    assert.equal(result.biome, atlas.records[i].biome);
    assert.equal(result.placementAuthority, false);
    assert.equal(result.confidence, 'regional');
  }
});
check('tropical forest families never select the boreal palette', () => {
  for (const n of [1, 2, 3]) assert.notEqual(BIOME_PROFILES[n].palette, BIOME_PROFILES[6].palette);
  assert.equal(BIOME_PROFILES[3].palette, 'tropical-conifer');
});
check('desert/tundra/unknown do not silently become dense generic forest', () => {
  for (const n of [0, 10, 11, 13, 98]) assert.notEqual(BIOME_PROFILES[n].canopy, 'forest');
});
check('invalid inputs are neutral, never clamped onto valid land', () => {
  for (const [lat, lon] of [[NaN, 0], [Infinity, 0], [91, 0], [-91, 0], [0, 181], [0, -181], ['0', 0], [null, 0]]) {
    assert.equal(service.query(lat, lon).reason, 'invalid-coordinate');
  }
});
check('missing atlas yields conservative explicit fallback', () => {
  const result = createBiomeClassifier().query(45, -73);
  assert.equal(result.family, 'unknown'); assert.equal(result.reason, 'atlas-unavailable');
});
check('no-data never searches neighboring land', () => {
  const a = fixture(); a.cells.fill(slotFor(1)); a.cells[90 * 360 + 180] = 0;
  const result = createBiomeClassifier(a).query(-0.001, 0.001);
  assert.equal(result.reason, 'no-data'); assert.equal(result.canopy, 'none');
});
check('dateline is wrapped and both poles are bounded', () => {
  assert.deepEqual(service.query(0.5, -180), service.query(0.5, 180));
  for (const lat of [-90, 90]) for (const lon of [-180, 180]) assert.ok(service.query(lat, lon).family);
});
check('transition weights are continuous, normalized and at most four probes', () => {
  const a = fixture();
  for (let row = 0; row < 180; row++) for (let col = 0; col < 360; col++) a.cells[row * 360 + col] = slotFor(col < 180 ? 1 : 6);
  const s = createBiomeClassifier(a);
  const weight = lon => s.query(0.5, lon).mix.find(p => p.biome === 6)?.weight ?? 0;
  assert.ok(Math.abs(weight(-1e-8) - weight(1e-8)) < 1e-5);
  let previous = -1;
  for (let i = -100; i <= 100; i++) {
    const r = s.query(0.5, i / 10000);
    assert.ok(Math.abs(r.mix.reduce((sum, p) => sum + p.weight, 0) - 1) < 1e-10);
    assert.ok(weight(i / 10000) >= previous - 1e-12); previous = weight(i / 10000);
  }
  assert.equal(s.query(0.5, -0.01).transition, false);
  assert.equal(s.query(0.5, -0.001).palette, 'tropical-moist-broadleaf');
  assert.ok(s.diagnostics().maxProbes <= 4);
});
check('four-way corners, nodata neighbors and polar caps stay normalized', () => {
  const a = fixture(); a.cells.fill(slotFor(4)); a.cells[89 * 360 + 179] = slotFor(1);
  a.cells[90 * 360 + 179] = slotFor(6); a.cells[90 * 360 + 180] = 0;
  const s = createBiomeClassifier(a);
  for (const [lat, lon] of [[0.0001, -0.0001], [90, -180], [-90, 180]]) {
    const r = s.query(lat, lon);
    assert.ok(Math.abs(r.mix.reduce((sum, p) => sum + p.weight, 0) - 1) < 1e-10);
  }
  assert.equal(s.diagnostics().maxProbes, 4);
});
check('bounded cache cannot change deterministic output', () => {
  const first = service.query(45.25, -73.25);
  for (let i = 0; i < 1000; i++) service.query((i % 160) - 80 + 0.1, (i % 358) - 179 + 0.1);
  assert.ok(service.diagnostics().cachedCells <= 8); assert.ok(service.diagnostics().evictions > 0);
  service.clearCache(); assert.deepEqual(service.query(45.25, -73.25), first);
  assert.deepEqual(createBiomeClassifier(atlas, { cacheLimit: 0 }).query(45.25, -73.25), first);
});
check('caller mutations cannot poison atlas, records or query output', () => {
  const a = fixture(); a.cells.fill(slotFor(1)); const s = createBiomeClassifier(a);
  const before = s.query(0.5, 0.5); a.cells.fill(slotFor(6)); a.records[1].name = 'changed'; a.source.id = 'changed';
  assert.deepEqual(s.query(0.5, 0.5), before); assert.throws(() => { before.ecoregion.name = 'changed'; });
  assert.throws(() => { before.mix[0].weight = 0; });
});
check('malformed and oversized atlases fail closed at construction', () => {
  const mutations = [a => a.width = 7201, a => a.height = -1, a => a.crs = 'EPSG:3857',
    a => a.cellDegrees = 2, a => a.west = 0, a => a.source.sha256 = '', a => a.source.license = 'unknown',
    a => a.cells = new Uint16Array(1), a => a.cells[0] = 65000,
    a => a.records[1].biome = 99, a => a.records[2].id = a.records[1].id,
    a => { a.width = 10000; a.height = 5000; }];
  for (const mutation of mutations) { const a = fixture(); mutation(a); assert.throws(() => createBiomeClassifier(a)); }
  for (const cacheLimit of [-1, 1.5, 4097]) assert.throws(() => createBiomeClassifier(null, { cacheLimit }));
  for (const blendMeters of [-1, NaN, 2001]) assert.throws(() => createBiomeClassifier(null, { blendMeters }));
});
check('no invented universal treeline or placement authorization', () => {
  assert.equal(service.query(45.5, -73.5).elevationApplied, false);
  assert.equal(service.query(45.5, -73.5).placementAuthority, false);
});
check('100k sustained queries remain bounded (timing informational)', () => {
  const start = performance.now();
  for (let i = 0; i < 100000; i++) service.query((i % 17000) / 100 - 85, (i % 35900) / 100 - 179.5);
  assert.ok(service.diagnostics().cachedCells <= 8); assert.ok(service.diagnostics().maxProbes <= 4);
  console.log(JSON.stringify({ queries: 100000, elapsedMs: performance.now() - start, ...service.diagnostics() }));
});
console.log(`Block 8 biome prototype: ${checks}/${checks} test groups PASS (synthetic atlas; geographic validation is separate).`);

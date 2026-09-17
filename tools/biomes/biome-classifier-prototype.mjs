/**
 * Block 8 R1: offline, browser-compatible classification prototype.
 * NOT imported by the game. No network, timers, renderer, scheduler or RNG.
 * Atlas cells are uint16 record slots, not ECO_IDs (slot 0 = no data).
 * Regional biome context is NOT a land-cover/placement permission.
 */
export const ATLAS_SCHEMA = 'world-drive-biome-atlas-v1';
const MAX_CELLS = 25_920_000; // 0.05-degree global prototype ceiling.
const MAX_RECORDS = 4096;
const profiles = {
  0: ['unknown', 'neutral-sparse', 'none'],
  1: ['tropical', 'tropical-moist-broadleaf', 'forest'],
  2: ['tropical', 'tropical-dry-broadleaf', 'forest'],
  3: ['tropical', 'tropical-conifer', 'forest'],
  4: ['temperate', 'temperate-broadleaf-mixed', 'forest'],
  5: ['temperate', 'temperate-conifer', 'forest'],
  6: ['boreal', 'boreal-conifer', 'forest'],
  7: ['grassland-scrub', 'tropical-savanna', 'open'],
  8: ['grassland-scrub', 'temperate-grassland', 'open'],
  9: ['wetland', 'flooded-grassland', 'open'],
  10: ['alpine-tundra', 'montane-grassland', 'open'],
  11: ['alpine-tundra', 'tundra', 'none'],
  12: ['grassland-scrub', 'mediterranean-woodland-scrub', 'open'],
  13: ['desert', 'desert-xeric-scrub', 'open'],
  14: ['wetland', 'mangrove', 'forest'],
  98: ['rock-ice', 'rock-ice', 'none'],
};
export const BIOME_PROFILES = Object.freeze(Object.fromEntries(
  Object.entries(profiles).map(([id, [family, palette, canopy]]) => [id,
    Object.freeze({ biome: Number(id), family, palette, canopy })]),
));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const validPoint = (lat, lon) => Number.isFinite(lat) && Math.abs(lat) <= 90
  && Number.isFinite(lon) && Math.abs(lon) <= 180;
const smooth = x => x * x * (3 - 2 * x);

function validateAtlas(atlas) {
  if (!atlas || atlas.schema !== ATLAS_SCHEMA || atlas.crs !== 'EPSG:4326') {
    throw new TypeError('Unsupported biome atlas schema/CRS');
  }
  const { width, height, records, cells, source } = atlas;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2
      || width !== 2 * height || width * height > MAX_CELLS) {
    throw new RangeError('Expected a bounded, global, square-degree grid');
  }
  if (atlas.west !== -180 || atlas.north !== 90 || atlas.cellDegrees !== 360 / width) {
    throw new RangeError('Atlas must start at (-180, 90), north-to-south, without a duplicate seam column');
  }
  if (!(cells instanceof Uint16Array) || cells.length !== width * height) {
    throw new TypeError('Atlas requires exactly width*height Uint16 cells');
  }
  if (!source || typeof source.id !== 'string' || !source.id
      || source.license !== 'CC-BY-4.0' || typeof source.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(source.sha256)) {
    throw new TypeError('Missing versioned source, license or SHA-256 provenance');
  }
  if (!Array.isArray(records) || records.length < 1 || records.length > MAX_RECORDS
      || records[0] !== null) throw new TypeError('Record slot 0 must be null');
  const ids = new Set();
  for (const record of records.slice(1)) {
    if (!record || !Number.isInteger(record.id) || record.id < 0 || ids.has(record.id)
        || !Number.isInteger(record.biome) || !own(BIOME_PROFILES, record.biome) || record.biome === 0
        || typeof record.name !== 'string' || !record.name || record.name.length > 256
        || typeof record.realm !== 'string' || record.realm.length > 128) {
      throw new TypeError('Invalid or duplicate ecoregion record');
    }
    ids.add(record.id);
  }
  for (const slot of cells) if (slot >= records.length) throw new RangeError('Invalid atlas record slot');
}

/** A dataset is immutable for a service lifetime. Recreate on dataset changes.
 * Loading/decompression belongs outside this service and outside frame work.
 * @param {object|null} atlas Validated by construction; null is a safe fallback.
 * @param {{cacheLimit?: number, blendMeters?: number}} options
 */
export function createBiomeClassifier(atlas = null, { cacheLimit = 256, blendMeters = 500 } = {}) {
  if (!Number.isInteger(cacheLimit) || cacheLimit < 0 || cacheLimit > 4096) {
    throw new RangeError('cacheLimit must be an integer in [0, 4096]');
  }
  if (!Number.isFinite(blendMeters) || blendMeters < 0 || blendMeters > 2000) {
    throw new RangeError('blendMeters must be in [0, 2000]');
  }
  if (atlas !== null) validateAtlas(atlas);
  // Defensive copy: callers cannot poison future results by editing input buffers/records.
  const cells = atlas ? new Uint16Array(atlas.cells) : null;
  const records = atlas ? atlas.records.map(r => r && Object.freeze({
    id: r.id, biome: r.biome, name: r.name, realm: r.realm,
  })) : null;
  const source = atlas ? Object.freeze({ id: atlas.source.id,
    license: atlas.source.license, sha256: atlas.source.sha256 }) : null;
  const width = atlas?.width ?? 0, height = atlas?.height ?? 0;
  const cellDegrees = atlas?.cellDegrees ?? null;
  const cache = new Map();
  const stats = { queries: 0, cellReads: 0, hits: 0, misses: 0, evictions: 0, maxProbes: 0 };
  function recordAt(row, col) {
    const key = Math.max(0, Math.min(height - 1, row)) * width + ((col % width + width) % width);
    stats.cellReads++;
    if (cache.has(key)) {
      stats.hits++;
      const value = cache.get(key); cache.delete(key); cache.set(key, value); return value;
    }
    stats.misses++;
    const value = records[cells[key]];
    if (cacheLimit) {
      if (cache.size >= cacheLimit) { cache.delete(cache.keys().next().value); stats.evictions++; }
      cache.set(key, value);
    }
    return value;
  }
  function fallback(reason) {
    return Object.freeze({ ...BIOME_PROFILES[0], ecoregion: null, source,
      confidence: 'unavailable', reason, resolutionDegrees: cellDegrees,
      transition: false, mix: Object.freeze([]), elevationApplied: false,
      placementAuthority: false });
  }
  // Real RESOLVE source assigns ECO_ID 0 ('Rock and Ice') to BIOME_NUM 11.
  // Preserve that source metadata, but do not mistake permanent ice for a tundra
  // asset palette. 98 is a LOCAL rendering-context profile, not an upstream code.
  function profileBiome(record) {
    return source?.id === 'RESOLVE-ECOREGIONS-2017' && record?.id === 0
      && record.biome === 11 && record.name === 'Rock and Ice' ? 98 : (record?.biome ?? 0);
  }
  function axisMix(fraction, halfWidth) {
    if (halfWidth <= 0) return [0, 0];
    if (fraction < halfWidth) return [-1, 0.5 * (1 - smooth(fraction / halfWidth))];
    if (1 - fraction < halfWidth) return [1, 0.5 * (1 - smooth((1 - fraction) / halfWidth))];
    return [0, 0];
  }
  function query(lat, lon) {
    stats.queries++;
    if (!validPoint(lat, lon)) return fallback('invalid-coordinate');
    if (!cells) return fallback('atlas-unavailable');
    const x = (lon === 180 ? 0 : (lon + 180) / 360 * width);
    const y = Math.max(0, Math.min(height - 1e-9, (90 - lat) / 180 * height));
    const col = Math.min(width - 1, Math.floor(x)), row = Math.floor(y);
    const primary = recordAt(row, col);
    // No nearest-land search: missing ocean/coast/island data remains missing.
    if (!primary) { stats.maxProbes = Math.max(stats.maxProbes, 1); return fallback('no-data'); }
    const latMeters = cellDegrees * 111_195;
    const lonMeters = latMeters * Math.max(1e-6, Math.cos(lat * Math.PI / 180));
    const [dx, wx] = axisMix(x - col, Math.min(0.49, blendMeters / lonMeters));
    const [dy, wy] = axisMix(y - row, Math.min(0.49, blendMeters / latMeters));
    const weights = new Map();
    function add(record, weight) {
      if (weight <= 0) return;
      const biome = profileBiome(record);
      weights.set(biome, (weights.get(biome) ?? 0) + weight);
    }
    add(primary, (1 - wx) * (1 - wy));
    let probes = 1;
    if (wx > 0) { add(recordAt(row, col + dx), wx * (1 - wy)); probes++; }
    if (wy > 0) { add(recordAt(row + dy, col), wy * (1 - wx)); probes++; }
    if (wx > 0 && wy > 0) { add(recordAt(row + dy, col + dx), wx * wy); probes++; }
    stats.maxProbes = Math.max(stats.maxProbes, probes);
    const mix = Object.freeze([...weights].sort((a, b) => a[0] - b[0])
      .map(([biome, weight]) => Object.freeze({ biome, weight })));
    const transition = mix.length > 1;
    return Object.freeze({ ...BIOME_PROFILES[profileBiome(primary)], ecoregion: primary, source,
      confidence: transition ? 'boundary' : 'regional', reason: null,
      resolutionDegrees: cellDegrees, transition, mix, elevationApplied: false,
      placementAuthority: false });
  }
  return Object.freeze({ query, clearCache: () => cache.clear(), diagnostics: () => ({
    ...stats, cachedCells: cache.size, cacheLimit, atlasBytes: cells?.byteLength ?? 0,
    resolutionDegrees: cellDegrees, blendMeters,
  }) });
}

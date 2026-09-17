/**
 * Block 8 R3 maintained service, not yet connected to the game.
 * Preparation is explicit and asynchronous. query() is synchronous, bounded and
 * performs no I/O, decoding, hashing, loading, scheduling or asset installation.
 * Trusted manifests identify data; digests are integrity checks, not signatures.
 */
import {createBiomeClassifier} from './regional-classifier.js';
import {createLocalRefinement, refinementAddress, parseRefinementTile,
  MAX_TILE_JSON_BYTES} from './local-refinement.js';
import {BIOME_PROFILES, biomeIdForRecord} from './biome-profiles.js';

export const BIOME_CONTEXT_SCHEMA = 'world-drive-biome-context-v1';
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;
const validPoint = (lat, lon) => Number.isFinite(lat) && Math.abs(lat) <= 90
  && Number.isFinite(lon) && Math.abs(lon) <= 180;
const freeze = Object.freeze;

async function digest(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is required during biome preparation');
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(result), n => n.toString(16).padStart(2, '0')).join('');
}
function recordsSnapshot(records) {
  return records.map(r => r && freeze({id:r.id, biome:r.biome, name:r.name, realm:r.realm}));
}
function sourceSnapshot(source) {
  return source && freeze({id:source.id, license:source.license, sha256:source.sha256});
}
function tileEntries(manifest) {
  if (!Array.isArray(manifest.tiles) || manifest.tiles.length > 128) {
    throw new RangeError('Expected one bounded refinement batch (at most 128 tiles)');
  }
  const entries = new Map();
  for (const entry of manifest.tiles) {
    if (!entry || !integer(entry.x, 0, 3599) || !integer(entry.y, 0, 1799)
        || entry.file !== `${entry.x}-${entry.y}.json.gz` || !hash(entry.sha256)
        || !integer(entry.jsonBytes, 1, MAX_TILE_JSON_BYTES)
        || !integer(entry.gzipBytes, 1, MAX_TILE_JSON_BYTES + 4096)) {
      throw new TypeError('Invalid tile descriptor, path, digest or byte ceiling');
    }
    const key = `${entry.x}-${entry.y}`;
    if (entries.has(key)) throw new TypeError('Duplicate refinement tile descriptor');
    entries.set(key, freeze({key, x:entry.x, y:entry.y, file:entry.file,
      sha256:entry.sha256, jsonBytes:entry.jsonBytes, gzipBytes:entry.gzipBytes}));
  }
  return entries;
}

/**
 * Prepare an immutable dataset instance BEFORE use in driving/frame work.
 * Atlas cells must already be decoded Uint16 data; tile preparation below accepts
 * decompressed UTF-8 bytes. A bounded transport/decompressor remains a separate
 * owner. Both the regional cell hash and local catalog hash are verified here.
 *
 * @param {object} config
 * @returns {Promise<object>} service with a synchronous geographic query
 */
export async function prepareBiomeService({regionalAtlas = null, refinementManifest = null,
  regionalOptions = {}, localOptions = {}, maxPendingTiles = 2,
  maxPendingBytes = 4 * 1024 * 1024} = {}) {
  if (!integer(maxPendingTiles, 1, 4) || !integer(maxPendingBytes, 1, 8 * 1024 * 1024)) {
    throw new RangeError('Invalid preparation concurrency/byte ceiling');
  }
  // The tested constructors validate and snapshot before the first async yield.
  let regional = createBiomeClassifier(regionalAtlas, regionalOptions);
  let local = refinementManifest ? createLocalRefinement(refinementManifest, localOptions) : null;
  const source = sourceSnapshot(refinementManifest?.source ?? regionalAtlas?.source ?? null);
  const catalog = refinementManifest ? recordsSnapshot(refinementManifest.records) : null;
  const catalogSha256 = refinementManifest?.catalogSha256 ?? null;
  const entries = refinementManifest ? tileEntries(refinementManifest) : new Map();
  const resolutionDegrees = regionalAtlas?.cellDegrees ?? null;
  if (regionalAtlas && refinementManifest) {
    const a = regionalAtlas.source, b = refinementManifest.source;
    if (a.id !== b.id || a.sha256 !== b.sha256 || a.license !== b.license
        || JSON.stringify(recordsSnapshot(regionalAtlas.records)) !== JSON.stringify(catalog)) {
      throw new TypeError('Regional and refined data do not have the same source/catalog');
    }
  }
  // Serialize the copied records in the authoring contract's explicit key order.
  const catalogBytes = catalog ? new TextEncoder().encode(JSON.stringify(catalog)) : null;
  let atlasBytes = null;
  const atlasSha256 = regionalAtlas?.cellSha256;
  if (regionalAtlas) {
    if (!hash(atlasSha256)) throw new TypeError('Missing regional cell SHA-256');
    atlasBytes = new Uint8Array(regionalAtlas.cells.length * 2);
    const view = new DataView(atlasBytes.buffer);
    for (let i = 0; i < regionalAtlas.cells.length; i++) view.setUint16(i * 2, regionalAtlas.cells[i], true);
  }
  if (catalogBytes && await digest(catalogBytes) !== catalogSha256) throw new Error('Refinement catalog SHA-256 mismatch');
  if (atlasBytes && await digest(atlasBytes) !== atlasSha256) throw new Error('Regional cells SHA-256 mismatch');
  atlasBytes = null;

  let generation = 0, disposed = false;
  let token = freeze({generation});
  const stats = {queries:0, resolved:0, noData:0, unavailable:0, installations:0,
    rejected:0, staleDrops:0, busyDrops:0, pendingTiles:0, pendingBytes:0,
    maxPendingTilesObserved:0, maxPendingBytesObserved:0};
  const current = requestToken => !disposed && requestToken === token;
  const outcome = (status, reason = null) => freeze({status, reason});
  function beginRoute() {
    if (disposed) throw new Error('Biome service is disposed');
    token = freeze({generation:++generation});
    local?.clear(); regional?.clearCache();
    // Old pending work stays accounted until its finally block has released it.
    return token;
  }
  function requestFor(lat, lon) {
    const address = refinementAddress(lat, lon);
    return !disposed && address ? entries.get(address.key) ?? null : null;
  }
  async function prepareTile(key, inputBytes, requestToken) {
    if (!current(requestToken)) { stats.staleDrops++; return outcome('discarded', 'stale-route'); }
    const entry = entries.get(key);
    if (!local || !entry) { stats.rejected++; return outcome('rejected', 'tile-not-in-manifest'); }
    if (!(inputBytes instanceof Uint8Array) || !(inputBytes.buffer instanceof ArrayBuffer)
        || inputBytes.byteLength !== entry.jsonBytes || inputBytes.byteLength > MAX_TILE_JSON_BYTES) {
      stats.rejected++; return outcome('rejected', 'tile-byte-length');
    }
    if (stats.pendingTiles >= maxPendingTiles || stats.pendingBytes + inputBytes.byteLength > maxPendingBytes) {
      stats.busyDrops++; return outcome('busy', 'preparation-budget');
    }
    // Private byte snapshot BEFORE the first await; never hash one buffer and
    // subsequently parse a caller-mutated view. No unbounded pending queue.
    const bytes = new Uint8Array(inputBytes);
    stats.pendingTiles++; stats.pendingBytes += bytes.byteLength;
    stats.maxPendingTilesObserved = Math.max(stats.maxPendingTilesObserved, stats.pendingTiles);
    stats.maxPendingBytesObserved = Math.max(stats.maxPendingBytesObserved, stats.pendingBytes);
    try {
      const actual = await digest(bytes);
      if (!current(requestToken)) { stats.staleDrops++; return outcome('discarded', 'stale-route'); }
      if (actual !== entry.sha256) { stats.rejected++; return outcome('rejected', 'tile-sha256'); }
      // Fatal decoding refuses silently replaced invalid UTF-8. Schema/geometry
      // validation and cache eviction are atomic inside the R2 installer.
      const tile = parseRefinementTile(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
      if (tile.tileX !== entry.x || tile.tileY !== entry.y) {
        stats.rejected++; return outcome('rejected', 'tile-address');
      }
      local.install(tile);
      stats.installations++;
      return outcome('installed');
    } catch (error) {
      stats.rejected++;
      return outcome('rejected', 'tile-validation');
    } finally {
      stats.pendingTiles--; stats.pendingBytes -= bytes.byteLength;
    }
  }
  function unavailable(status, reason, regionalHint = null) {
    stats[status === 'no-data' ? 'noData' : 'unavailable']++;
    return freeze({schema:BIOME_CONTEXT_SCHEMA, ...BIOME_PROFILES[0], status, reason,
      source, ecoregion:null, precision:null, confidence:'unavailable',
      paletteEligible:false, regionalHint, resolutionDegrees, generation,
      transitionReady:false, boundaryDiagnostic:false,
      placementAuthority:false, elevationApplied:false});
  }
  function query(lat, lon) {
    stats.queries++;
    if (disposed) return unavailable('unavailable', 'disposed');
    if (!validPoint(lat, lon)) return unavailable('unavailable', 'invalid-coordinate');
    const refined = local?.query(lat, lon);
    if (refined?.status === 'resolved') {
      stats.resolved++;
      const profile = BIOME_PROFILES[biomeIdForRecord(refined.ecoregion, source.id)];
      return freeze({schema:BIOME_CONTEXT_SCHEMA, ...profile, status:'resolved', reason:null,
        source, ecoregion:refined.ecoregion, precision:'source-polygons',
        confidence:'source-agreement', paletteEligible:true, regionalHint:null,
        resolutionDegrees:null, generation, transitionReady:false,
        boundaryDiagnostic:refined.boundary === true, placementAuthority:false, elevationApplied:false});
    }
    // Precise source no-data overrides coarse forest. Never turn uncertainty,
    // missing detail or a cache miss into a confident coarse palette decision.
    if (refined?.status === 'no-data') return unavailable('no-data', 'source-no-data');
    const hint = regional.query(lat, lon);
    return unavailable('unavailable', refined?.reason ?? 'refinement-unavailable',
      hint.ecoregion ? hint : null);
  }
  function dispose() {
    disposed = true; token = null; entries.clear();
    local?.clear(); regional?.clearCache(); local = null; regional = null;
  }
  return freeze({query, beginRoute, requestFor, prepareTile, dispose,
    routeToken:() => token,
    diagnostics:() => ({...stats, generation, disposed, source,
      maxPendingTiles, maxPendingBytes, manifestTiles:entries.size,
      regional:regional?.diagnostics() ?? null, refinement:local?.diagnostics() ?? null})});
}

/** Source-coordinate local refinement. NOT imported by the game.
 * Install/decode is explicit authoring/preload work; query never loads anything.
 * No nearest-land search, renderer, scheduling, density or elevation authority.
 */
export const REFINEMENT_SCHEMA = 'world-drive-biome-refinement-v1';
const DIV = 16, SCALE = 160, MAX_EDGES = 512, MAX_POINTS = 32768;
export const MAX_TILE_JSON_BYTES = 2 * 1024 * 1024;
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const integer = (v, low, high) => Number.isInteger(v) && v >= low && v <= high;
const validPoint = (lat, lon) => Number.isFinite(lat) && Math.abs(lat) <= 90
  && Number.isFinite(lon) && Math.abs(lon) <= 180;

export function refinementAddress(lat, lon) {
  if (!validPoint(lat, lon)) return null;
  const gx = Math.min(57599, Math.floor(((lon === 180 ? -180 : lon) + 180) * SCALE));
  const gy = Math.min(28799, Math.floor((90 - lat) * SCALE));
  const x = Math.floor(gx / DIV), y = Math.floor(gy / DIV);
  return { x, y, key: `${x}-${y}`, cell: (gy % DIV) * DIV + gx % DIV };
}

/** Parser ceiling applies BEFORE JSON parsing. Cryptographic digest verification
 * belongs to the external loader; the R2 file QA verifies the manifest SHA-256.
 */
export function parseRefinementTile(text) {
  if (typeof text !== 'string' || text.length > MAX_TILE_JSON_BYTES
      || new TextEncoder().encode(text).length > MAX_TILE_JSON_BYTES) {
    throw new RangeError('Refinement tile exceeds the JSON decode ceiling');
  }
  return JSON.parse(text);
}

function offsets(value, length, end, name) {
  if (!Array.isArray(value) || value.length !== length || value[0] !== 0
      || value.at(-1) !== end) throw new TypeError(`Invalid ${name}`);
  for (let i = 0; i < value.length; i++) {
    if (!integer(value[i], 0, end) || (i && value[i] < value[i - 1])) {
      throw new RangeError(`Unordered ${name}`);
    }
  }
}

function compileTile(tile, sourceSha, catalogSha, recordCount) {
  if (!tile || tile.schema !== REFINEMENT_SCHEMA || tile.crs !== 'EPSG:4326'
      || tile.sourceSha256 !== sourceSha || tile.catalogSha256 !== catalogSha
      || tile.divisions !== DIV || !integer(tile.tileX, 0, 3599)
      || !integer(tile.tileY, 0, 1799)) throw new TypeError('Tile identity/schema mismatch');
  const {cellSlots, cellReasons, cellPolygonOffsets: co, polygonSlots: ps,
    polygonRingOffsets: po, ringPointOffsets: ro, coordinates: xy} = tile;
  if (!Array.isArray(cellSlots) || cellSlots.length !== 256 || !Array.isArray(cellReasons)
      || cellReasons.length !== 256 || !Array.isArray(ps) || ps.length > MAX_POINTS / 4
      || !Array.isArray(xy) || xy.length % 2 || xy.length > MAX_POINTS * 2
      || !Array.isArray(ro) || ro.length > MAX_POINTS / 4 + 1 || ro.length < 1) {
    throw new RangeError('Unbounded or malformed tile arrays');
  }
  offsets(co, 257, ps.length, 'cell offsets');
  offsets(po, ps.length + 1, ro.length - 1, 'polygon offsets');
  offsets(ro, ro.length, xy.length / 2, 'ring offsets');
  for (const slot of ps) if (!integer(slot, 1, recordCount - 1)) throw new RangeError('Invalid polygon record');
  for (let cell = 0; cell < 256; cell++) {
    const label = cellSlots[cell], reason = cellReasons[cell];
    if (!integer(label, -2, recordCount - 1) || !integer(reason, 0, 4)
        || ((label === -2) !== (reason > 0)) || ((label === -1) !== (co[cell + 1] > co[cell]))) {
      throw new TypeError('Invalid cell status');
    }
    let edges = 0;
    const gx = tile.tileX * DIV + cell % DIV, gy = tile.tileY * DIV + Math.floor(cell / DIV);
    const west = -180 + gx / SCALE, east = -180 + (gx + 1) / SCALE;
    const north = 90 - gy / SCALE, south = 90 - (gy + 1) / SCALE;
    for (let p = co[cell]; p < co[cell + 1]; p++) {
      if (po[p + 1] <= po[p]) throw new TypeError('Polygon has no outer ring');
      for (let r = po[p]; r < po[p + 1]; r++) {
        const first = ro[r], last = ro[r + 1] - 1;
        if (last - first < 3 || xy[first * 2] !== xy[last * 2]
            || xy[first * 2 + 1] !== xy[last * 2 + 1]) throw new TypeError('Unclosed/degenerate ring');
        edges += last - first;
        if (edges > MAX_EDGES) throw new RangeError('Cell exceeds 512-edge query ceiling');
        for (let i = first; i <= last; i++) {
          const x = xy[i * 2], y = xy[i * 2 + 1];
          if (!Number.isFinite(x) || !Number.isFinite(y) || x < west - 1e-11 || x > east + 1e-11
              || y < south - 1e-11 || y > north + 1e-11) throw new RangeError('Point outside its closed cell');
        }
      }
    }
  }
  // Caller mutations cannot alter the resident tile. All payload arrays are private.
  const result = {cellSlots: Int16Array.from(cellSlots), cellReasons: Uint8Array.from(cellReasons),
    co: Uint32Array.from(co), ps: Uint16Array.from(ps), po: Uint32Array.from(po),
    ro: Uint32Array.from(ro), xy: Float64Array.from(xy)};
  result.bytes = Object.values(result).reduce((sum, v) => sum + v.byteLength, 0);
  result.key = `${tile.tileX}-${tile.tileY}`;
  return result;
}

/** Bounded LRU by TILE COUNT AND TYPED-ARRAY BYTES, not estimated total JS heap.
 * Source/catalog are fixed for this instance. No silent replacement by new data.
 */
export function createLocalRefinement(manifest, {maxTiles = 8, maxBytes = 8 * 1024 * 1024} = {}) {
  if (!integer(maxTiles, 1, 32) || !integer(maxBytes, 2048, 32 * 1024 * 1024)) {
    throw new RangeError('Invalid resident resource ceiling');
  }
  if (!manifest || manifest.schema !== REFINEMENT_SCHEMA || !hash(manifest.source?.sha256)
      || !hash(manifest.catalogSha256) || manifest.source.license !== 'CC-BY-4.0'
      || manifest.source.id !== 'RESOLVE-ECOREGIONS-2017' || !Array.isArray(manifest.records)
      || manifest.records.length < 1 || manifest.records.length > 4096 || manifest.records[0] !== null) {
    throw new TypeError('Invalid refinement manifest/source/catalog');
  }
  const ids = new Set();
  let previousId = -1;
  const records = manifest.records.map((r, i) => {
    if (i === 0) return null;
    if (!r || !integer(r.id, 0, 65534) || (ids.has(r.id) || r.id <= previousId) || !integer(r.biome, 1, 98)
        || !(r.biome <= 14 || r.biome === 98) || typeof r.name !== 'string' || !r.name
        || r.name.length > 256 || typeof r.realm !== 'string' || r.realm.length > 128) {
      throw new TypeError('Invalid ecoregion catalog');
    }
    ids.add(r.id); previousId = r.id;
    return Object.freeze({id:r.id, biome:r.biome, name:r.name, realm:r.realm});
  });
  const sourceSha = manifest.source.sha256, catalogSha = manifest.catalogSha256;
  const tiles = new Map();
  let bytes = 0;
  const stats = {queries:0, hits:0, misses:0, evictions:0, unresolved:0,
    edgesTested:0, maxEdgesTested:0, maxResidentBytes:0, maxResidentTiles:0};
  function unavailable(reason, key = null) {
    return {status:'unavailable', reason, key, slot:null, ecoregion:null,
      sourceSha256:sourceSha, precision:null, placementAuthority:false, elevationApplied:false};
  }
  function install(tile) {
    const compiled = compileTile(tile, sourceSha, catalogSha, records.length);
    if (compiled.bytes > maxBytes) throw new RangeError('Tile exceeds resident payload budget');
    // Validation is atomic with respect to the cache: a rejected tile evicts nothing.
    if (tiles.has(compiled.key)) { bytes -= tiles.get(compiled.key).bytes; tiles.delete(compiled.key); }
    while (tiles.size >= maxTiles || bytes + compiled.bytes > maxBytes) {
      const key = tiles.keys().next().value;
      bytes -= tiles.get(key).bytes; tiles.delete(key); stats.evictions++;
    }
    tiles.set(compiled.key, compiled); bytes += compiled.bytes;
    stats.maxResidentBytes = Math.max(stats.maxResidentBytes, bytes);
    stats.maxResidentTiles = Math.max(stats.maxResidentTiles, tiles.size);
    return compiled.bytes;
  }
  function query(lat, lon) {
    stats.queries++;
    const address = refinementAddress(lat, lon);
    if (!address) return unavailable('invalid-coordinate');
    const tile = tiles.get(address.key);
    if (!tile) { stats.misses++; return unavailable('tile-not-loaded', address.key); }
    stats.hits++; tiles.delete(address.key); tiles.set(address.key, tile);
    const cell = address.cell, label = tile.cellSlots[cell];
    if (label === -2) {
      stats.unresolved++;
      return unavailable(['', 'source-topology', 'clip-topology', 'complexity-limit', 'degenerate-contact'][tile.cellReasons[cell]], address.key);
    }
    let chosen = Math.max(0, label), tested = 0, boundary = false;
    const x = lon === 180 ? -180 : lon, y = lat;
    function ringState(r) {
      let inside = false;
      for (let i = tile.ro[r]; i < tile.ro[r + 1] - 1; i++) {
        tested++;
        const ax = tile.xy[i * 2], ay = tile.xy[i * 2 + 1];
        const bx = tile.xy[i * 2 + 2], by = tile.xy[i * 2 + 3];
        const dx = bx - ax, dy = by - ay;
        // Arithmetic tolerance (~micrometres), not a geographic fill corridor.
        const length = Math.hypot(dx, dy);
        if (length > 0 && Math.abs((x-ax)*dy - (y-ay)*dx) <= 1e-11 * length
            && x >= Math.min(ax,bx)-1e-11 && x <= Math.max(ax,bx)+1e-11
            && y >= Math.min(ay,by)-1e-11 && y <= Math.max(ay,by)+1e-11) return 0;
        if ((ay > y) !== (by > y) && x < ax + (y-ay) * dx / dy) inside = !inside;
      }
      return inside ? 1 : -1;
    }
    if (label === -1) {
      for (let p = tile.co[cell]; p < tile.co[cell + 1]; p++) {
        let state = ringState(tile.po[p]);
        if (state < 0) continue;
        if (state === 0) boundary = true;
        let covered = true;
        if (state > 0) {
          for (let r = tile.po[p] + 1; r < tile.po[p + 1]; r++) {
            state = ringState(r);
            if (state === 0) { boundary = true; break; } // covers includes hole edges
            if (state > 0) { covered = false; break; }
          }
        }
        if (covered) chosen = Math.max(chosen, tile.ps[p]);
      }
    }
    stats.edgesTested += tested; stats.maxEdgesTested = Math.max(stats.maxEdgesTested, tested);
    return {status:chosen ? 'resolved' : 'no-data', reason:chosen ? null : 'source-no-data',
      key:address.key, slot:chosen, ecoregion:records[chosen], sourceSha256:sourceSha,
      precision:'source-polygons', boundary, placementAuthority:false, elevationApplied:false};
  }
  return Object.freeze({install, query, has:key => tiles.has(key), clear(){ tiles.clear(); bytes=0; },
    diagnostics(){ return {...stats, residentTiles:tiles.size, residentArrayBytes:bytes,
      maxTiles, maxBytes, maxCellEdges:MAX_EDGES}; }});
}

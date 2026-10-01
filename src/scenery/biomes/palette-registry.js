/**
 * Explicit, immutable natural-asset eligibility registry. Not a tree spawner.
 * No authored model is approved by this module. The default registry is EMPTY.
 * Asset IDs/provenance must come from a separately reviewed authoring catalog.
 */
import {BIOME_PROFILES, biomeIdForRecord} from './biome-profiles.js';
import {BIOME_CONTEXT_SCHEMA} from './biome-service.js';

const freeze = Object.freeze;
const KINDS = freeze(['tree', 'shrub', 'ground-cover', 'rock']);
const vegetation = freeze(['shrub', 'ground-cover', 'rock']);
const all = freeze([...KINDS]);
const noTrees = new Set([0, 8, 9, 10, 11, 13, 98]);
const bare = new Set([0, 98]);
// This is a conservative initial authoring policy, not a scientific tree-cover
// map. In particular, desert/riparian exceptions require later explicit evidence.
export const PALETTE_POLICIES = freeze(Object.fromEntries(Object.values(BIOME_PROFILES).map(p => [p.palette,
  freeze({id:p.palette, biome:p.biome, family:p.family,
    treePolicy:noTrees.has(p.biome) ? 'none' : [7, 12].includes(p.biome) ? 'sparse' : 'regional-forest',
    allowedKinds:bare.has(p.biome) ? freeze(['rock']) : noTrees.has(p.biome) ? vegetation : all,
    densityScale:null, placementAuthority:false})])));
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,127}$/.test(value);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function stringSet(values, label, maxLength, valid = value => typeof value === 'string' && value.length > 0 && value.length <= 128) {
  if (!Array.isArray(values) || values.length < 1 || values.length > maxLength
      || !values.every(valid) || new Set(values).size !== values.length) throw new TypeError(`Invalid ${label}`);
  return freeze([...values].sort(compare));
}
function hash32(parts) {
  // Explicit UTF-16 code units and length prefixes: stable across JS engines,
  // independent of locale, insertion order, random state, cache and world rebases.
  let hash = 2166136261;
  for (const part of parts) {
    const text = `${part.length}:${part}`;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  }
  return hash;
}
function validContext(context) {
  if (!context || context.schema !== BIOME_CONTEXT_SCHEMA || context.status !== 'resolved'
      || context.precision !== 'source-polygons' || context.paletteEligible !== true
      || context.placementAuthority !== false || context.elevationApplied !== false
      || typeof context.source?.id !== 'string' || !context.source.id
      || context.source.license !== 'CC-BY-4.0' || typeof context.source.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(context.source.sha256) || !context.ecoregion
      || !Number.isInteger(context.ecoregion.id) || context.ecoregion.id < 0
      || typeof context.ecoregion.realm !== 'string') return false;
  const id = biomeIdForRecord(context.ecoregion, context.source.id), profile = BIOME_PROFILES[id];
  return !!profile && id !== 0 && profile.biome === context.biome
    && profile.palette === context.palette && profile.family === context.family;
}

/**
 * @param {Array<object>} assets Explicit reviewed model metadata; no wildcard pools.
 * @param {{revision?:string}} options Version authoring changes intentionally.
 * select() returns a model ID only. Existing road/water/landuse/blocker owners
 * must independently authorize the point; missing permission always skips it.
 */
export function createPaletteRegistry(assets = [], {revision = 'block8-palette-contract-r3'} = {}) {
  if (!validId(revision) || !Array.isArray(assets) || assets.length > 256) {
    throw new RangeError('Invalid palette revision or asset count');
  }
  const seen = new Set(), pools = new Map();
  for (const asset of assets) {
    if (!asset || !validId(asset.id) || seen.has(asset.id) || !KINDS.includes(asset.kind)
        || asset.reviewed !== true || !validId(asset.provenanceId)
        || !Number.isInteger(asset.weight) || asset.weight < 1 || asset.weight > 65535) {
      throw new TypeError('Invalid/unreviewed/duplicate natural asset');
    }
    seen.add(asset.id);
    const palettes = stringSet(asset.palettes, 'palette list', 16, id => typeof id === 'string' && own(PALETTE_POLICIES, id) && id !== 'neutral-sparse');
    if (palettes.some(id => !PALETTE_POLICIES[id].allowedKinds.includes(asset.kind))) {
      throw new TypeError('Asset kind conflicts with a declared palette policy');
    }
    const realms = asset.realms === undefined ? null : stringSet(asset.realms, 'realm restriction', 16);
    let ecoregionIds = null;
    if (asset.ecoregionIds !== undefined) {
      ecoregionIds = stringSet(asset.ecoregionIds, 'ecoregion restriction', 4096,
        id => Number.isInteger(id) && id >= 0 && id <= 65534);
    }
    const entry = freeze({id:asset.id, kind:asset.kind, weight:asset.weight,
      provenanceId:asset.provenanceId, palettes, realms, ecoregionIds});
    for (const palette of palettes) {
      const key = `${palette}/${asset.kind}`;
      if (!pools.has(key)) pools.set(key, []);
      pools.get(key).push(entry);
    }
  }
  for (const [key, entries] of pools) {
    if (entries.length > 128) throw new RangeError('Palette exceeds 128 eligible asset descriptors');
    pools.set(key, freeze(entries.sort((a, b) => compare(a.id, b.id))));
  }
  function skip(reason, policy = null) {
    return freeze({assetId:null, reason, paletteId:policy?.id ?? null,
      treePolicy:policy?.treePolicy ?? 'none', revision, placementAuthority:false});
  }
  function select(context, {kind = 'tree', stableKey, seed = 'world-drive-biomes-v1', placementAllowed = false} = {}) {
    if (placementAllowed !== true) return skip('placement-not-authorized');
    if (!validContext(context)) return skip('biome-unavailable');
    const policy = PALETTE_POLICIES[context.palette];
    if (!KINDS.includes(kind) || !policy.allowedKinds.includes(kind)) return skip('kind-not-allowed', policy);
    if (typeof stableKey !== 'string' || !stableKey || stableKey.length > 256
        || typeof seed !== 'string' || !seed || seed.length > 128) return skip('invalid-stable-key', policy);
    const candidates = pools.get(`${policy.id}/${kind}`) ?? [];
    const eligible = asset => (!asset.realms || asset.realms.includes(context.ecoregion.realm))
      && (!asset.ecoregionIds || asset.ecoregionIds.includes(context.ecoregion.id));
    let total = 0;
    for (const asset of candidates) if (eligible(asset)) total += asset.weight;
    if (!total) return skip('no-compatible-asset', policy);
    let target = hash32([revision, seed, stableKey, kind, policy.id, context.source.id,
      context.source.sha256, String(context.ecoregion.id)]) / 4294967296 * total;
    for (const asset of candidates) {
      if (!eligible(asset)) continue;
      if (target < asset.weight) return freeze({assetId:asset.id, reason:null,
        provenanceId:asset.provenanceId, paletteId:policy.id, treePolicy:policy.treePolicy,
        revision, placementAuthority:false});
      target -= asset.weight;
    }
    return skip('no-compatible-asset', policy);
  }
  return freeze({select, policy:paletteId => own(PALETTE_POLICIES, paletteId) ? PALETTE_POLICIES[paletteId] : null,
    diagnostics:() => ({revision, assets:seen.size, pools:pools.size, maxPoolAssets:128})});
}

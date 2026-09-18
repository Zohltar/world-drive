/**
 * Candidate-only natural palette policy. No rendering, terrain sampling or I/O.
 * Configured metre bands are authoring inputs, NOT a global treeline model.
 * Default registry remains empty. Nothing imports this from the game entrypoint.
 */
import {createPaletteRegistry, PALETTE_POLICIES} from '../../src/scenery/biomes/palette-registry.js';
import {BIOME_CONTEXT_SCHEMA} from '../../src/scenery/biomes/biome-service.js';
import {BIOME_PROFILES, biomeIdForRecord} from '../../src/scenery/biomes/biome-profiles.js';
const freeze = Object.freeze;
const SHA = /^[a-f0-9]{64}$/;
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const pairKey = (a, b) => [a, b].sort().join('|');
const permittedPairs = new Set([
  pairKey('temperate-broadleaf-mixed', 'temperate-conifer'),
  pairKey('temperate-conifer', 'boreal-conifer'),
]);
function validContext(c) {
  if (!c || c.schema !== BIOME_CONTEXT_SCHEMA || c.status !== 'resolved'
      || c.precision !== 'source-polygons' || c.paletteEligible !== true
      || c.placementAuthority !== false || c.elevationApplied !== false
      || !text(c.source?.id) || c.source.license !== 'CC-BY-4.0'
      || !SHA.test(c.source.sha256) || !Number.isInteger(c.ecoregion?.id)
      || c.ecoregion.id < 0 || typeof c.ecoregion.realm !== 'string') return false;
  const id = biomeIdForRecord(c.ecoregion, c.source.id), p = BIOME_PROFILES[id];
  return !!p && id !== 0 && id === c.biome && p.family === c.family && p.palette === c.palette;
}
function unit(parts) {
  let h = 2166136261;
  for (const part of parts) {
    const s = `${part.length}:${part}`;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h / 4294967296;
}
const permitted = (a, c) => a.palettes.includes(c.palette)
  && (!a.realms || a.realms.includes(c.ecoregion.realm))
  && (!a.ecoregionIds || a.ecoregionIds.includes(c.ecoregion.id));

/**
 * assets obey the maintained R3 registry contract (including reviewed provenance).
 * transitions: reviewed {palettes:[a,b], widthM, reference} authoring pairs.
 * treelines: reviewed {ecoregionId, sourceId, sourceSha256, lowerM, upperM, datum, reference}.
 * No defaults assert that any specific site has a measured treeline.
 */
export function createVegetationPolicy({assets = [], transitions = [], treelines = [],
  revision = 'block8-vegetation-policy-r11'} = {}) {
  const registry = createPaletteRegistry(assets, {revision});
  if (!Array.isArray(transitions) || transitions.length > 8
      || !Array.isArray(treelines) || treelines.length > 256) throw new RangeError('Policy count exceeds bound');
  // Own all mutable input data; later authoring mutations cannot affect reads.
  const descriptors = new Map(assets.map(a => [a.id, freeze({...a,
    palettes:freeze([...a.palettes]), realms:a.realms ? freeze([...a.realms]) : null,
    ecoregionIds:a.ecoregionIds ? freeze([...a.ecoregionIds]) : null})]));
  const bands = new Map(), pairs = new Map();
  for (const b of treelines) {
    if (!b || b.reviewed !== true || !Number.isInteger(b.ecoregionId) || b.ecoregionId < 0
        || b.ecoregionId > 65534 || !text(b.sourceId) || !SHA.test(b.sourceSha256) || !text(b.reference)
        || !text(b.datum) || !Number.isFinite(b.lowerM) || !Number.isFinite(b.upperM)
        || b.lowerM < -500 || b.upperM > 9000 || b.upperM <= b.lowerM
        || b.upperM - b.lowerM > 1500) throw new TypeError('Invalid reviewed regional elevation band');
    const key = `${b.sourceId}:${b.sourceSha256}:${b.ecoregionId}`;
    if (bands.has(key)) throw new TypeError('Duplicate regional elevation band');
    bands.set(key, freeze({...b}));
  }
  for (const t of transitions) {
    if (!t || t.reviewed !== true || !Array.isArray(t.palettes) || t.palettes.length !== 2
        || !t.palettes.every(p => typeof p === 'string' && Object.hasOwn(PALETTE_POLICIES, p))
        || t.palettes[0] === t.palettes[1] || !text(t.reference)
        || !Number.isFinite(t.widthM) || t.widthM < 1 || t.widthM > 500) {
      throw new TypeError('Invalid reviewed transition');
    }
    const key = pairKey(...t.palettes);
    if (!permittedPairs.has(key) || pairs.has(key)) throw new TypeError('Unsupported/duplicate ecological transition');
    const shared = assets.filter(a => t.palettes.every(p => a.palettes.includes(p)));
    pairs.set(key, freeze({widthM:t.widthM, reference:t.reference,
      registry:createPaletteRegistry(shared, {revision})}));
  }
  function select(context, options = {}) {
    let selected = registry.select(context, options);
    let treeWeight = 1, elevationStatus = 'unconfigured', transitionStatus = 'not-requested';
    let transitionWeight = 0;
    const finish = () => freeze({...selected, policyRevision:revision, treeWeight,
      elevationStatus, elevationApplied:elevationStatus === 'applied',
      transitionStatus, transitionWeight, placementAuthority:false});
    const skip = reason => { selected = {...selected, assetId:null, provenanceId:null, reason}; return finish(); };
    // Preserve blocker precedence and all R3 fail-closed context rules.
    if (!selected.assetId) return finish();
    const kind = options.kind ?? 'tree';
    if (kind === 'tree') {
      const band = bands.get(`${context.source.id}:${context.source.sha256}:${context.ecoregion.id}`);
      if (band) {
        const elevation = options.elevation;
        if (!elevation || elevation.reliable !== true || elevation.datum !== band.datum
            || !Number.isFinite(elevation.metres) || elevation.metres < -500 || elevation.metres > 9000) {
          elevationStatus = 'missing-or-incompatible-elevation'; treeWeight = 0;
          return skip('elevation-unavailable');
        }
        treeWeight = 1 - smooth((elevation.metres - band.lowerM) / (band.upperM - band.lowerM));
        elevationStatus = 'applied';
        const sample = unit([revision, options.seed ?? 'world-drive-biomes-v1', options.stableKey,
          'treeline', context.source.sha256, String(context.ecoregion.id)]);
        if (treeWeight <= 0 || sample >= treeWeight) return skip('regional-treeline');
      }
    } else elevationStatus = 'not-tree';
    const boundary = options.boundary;
    if (!boundary) return finish();
    const neighbor = boundary.neighbor;
    if (!validContext(neighbor) || neighbor.source.id !== context.source.id
        || neighbor.source.sha256 !== context.source.sha256
        || !Number.isFinite(boundary.distanceM) || boundary.distanceM < 0
        || boundary.verified !== true) {
      transitionStatus = 'missing-boundary-evidence'; return finish();
    }
    const pair = pairs.get(pairKey(context.palette, neighbor.palette));
    if (!pair) { transitionStatus = 'not-configured'; return finish(); }
    if (boundary.distanceM >= pair.widthM) { transitionStatus = 'outside-band'; return finish(); }
    transitionWeight = 1 - smooth(boundary.distanceM / pair.widthM);
    const sample = unit([revision, options.seed ?? 'world-drive-biomes-v1', options.stableKey,
      'boundary', context.source.sha256, pairKey(context.palette, neighbor.palette)]);
    if (sample >= transitionWeight) { transitionStatus = 'native-pool'; return finish(); }
    // Shared assets must be declared for BOTH palettes and BOTH exact contexts.
    // Never select from a neighbour-only pool, even at the centre of a boundary.
    const shared = pair.registry.select(context, options);
    const descriptor = descriptors.get(shared.assetId);
    if (!descriptor || !permitted(descriptor, neighbor)) {
      transitionStatus = 'no-shared-compatible-asset'; return finish();
    }
    selected = shared; transitionStatus = 'shared-pool';
    return finish();
  }
  return freeze({select, diagnostics:() => freeze({revision, assets:descriptors.size,
    transitions:pairs.size, regionalTreelines:bands.size, placementAuthority:false,
    maxAssets:256, maxTransitions:8, maxRegionalTreelines:256})});
}

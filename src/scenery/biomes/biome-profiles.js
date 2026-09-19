// Regional descriptors only, never current land cover or placement permission.
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

/** Local rendering context; never rewrite the upstream record's biome. */
export function biomeIdForRecord(record, sourceId) {
  return sourceId === 'RESOLVE-ECOREGIONS-2017' && record?.id === 0
    && record.biome === 11 && record.name === 'Rock and Ice' ? 98 : (record?.biome ?? 0);
}

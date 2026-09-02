// Internal compatibility bridge for the moved Overpass implementation.
// Keeps its historical './diagnostics.js' dependency byte-for-byte while the
// canonical diagnostics implementation now lives under src/app/.
export * from '../diagnostics.js';

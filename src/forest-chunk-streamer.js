// Foret P9.12 implementation lives in a separate module so the transition-safe
// streaming rewrite remains isolated and easy to compare/revert.
export {createForestChunkStreamer} from './forest-chunk-streamer-p912.js';

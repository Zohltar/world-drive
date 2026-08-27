// Foret P9.28 diagnostics wrapper. The proven P9.12 streamer remains the
// authoritative implementation; P9.28 only observes it and correlates forest
// activity with frame-pacing hitches.
export {createForestChunkStreamer} from './forest-chunk-streamer-p928.js';

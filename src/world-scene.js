// R8 world-scene facade — keep the stable root import while implementation lives under src/terrain/.
export {
  createWorldScene,
  freezeStaticMatrices,
  resetStaticGroupOrigin,
  NEAR_TERRAIN_SIZE,
  NEAR_TERRAIN_SEGMENTS
} from './terrain/world-scene.js';

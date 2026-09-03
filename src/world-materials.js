// R8 world-materials facade — keep the stable root import while implementation lives under src/terrain/.
export {
  createWorldMaterials,
  ROAD_SURFACE_OFFSET,
  TIRE_VISUAL_CLEARANCE,
  WHEEL_RADIUS,
  TIRE_HALF_WIDTH,
  ROAD_WHEEL_CONTACT_HALF_WIDTH
} from './terrain/world-materials.js';

// Foret P9 implementation lives in a separate module so the forest streaming
// rewrite remains isolated and easy to revert while preserving the public API
// imported by main.js.
export {createSceneryRenderer} from './scenery-renderer-p9.js';

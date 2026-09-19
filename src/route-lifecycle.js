export * from './routing/route-lifecycle.js';
import {createRouteLifecycle as createMaintainedRouteLifecycle} from './routing/route-lifecycle.js';
import {attachBiomeRouteDiagnostics} from './app/biome-diagnostics.js';

// Optional diagnostic observer. Routing, terrain and forest ownership stay below.
export function createRouteLifecycle(options){
  return attachBiomeRouteDiagnostics(createMaintainedRouteLifecycle(options),options);
}

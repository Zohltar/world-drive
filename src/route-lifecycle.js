export * from './routing/route-lifecycle.js';
import {createRouteLifecycle as createMaintainedRouteLifecycleImpl} from './routing/route-lifecycle.js';
import {attachBiomeRouteDiagnostics} from './app/biome-diagnostics.js';

// Stable routing facade. The raw maintained lifecycle is exported separately so
// main can install R24 explicitly without bypassing the public routing boundary.
export const createMaintainedRouteLifecycle=createMaintainedRouteLifecycleImpl;
export function createRouteLifecycle(options){
  return attachBiomeRouteDiagnostics(createMaintainedRouteLifecycleImpl(options),options);
}

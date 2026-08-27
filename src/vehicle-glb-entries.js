import {createDeferredGlbSystem} from './deferred-glb-system.js';
import {getAuthoredVehicleDescriptor,loadAuthoredVehicleFactory} from './vehicle-authored-registry.js';

// Local gameplay and multiplayer resolve their authored controllers from the
// same registry. The local path keeps its deferred facade so heavy modules are
// still imported only when selected.
function deferredFor(vehicleId){
  const descriptor=getAuthoredVehicleDescriptor(vehicleId);
  if(!descriptor||descriptor.kind!=='passenger')throw new Error(`Invalid passenger authored descriptor: ${vehicleId}`);
  return options=>createDeferredGlbSystem({
    label:descriptor.label,
    options,
    loadFactory:()=>loadAuthoredVehicleFactory(vehicleId)
  });
}

export const createCountachGlbSystem=deferredFor('countach_80');
export const createId4GlbSystem=deferredFor('id4');
export const createWrxGlbSystem=deferredFor('wrx');
export const createCivicGlbSystem=deferredFor('civic');
export const createSonataGlbSystem=deferredFor('sonata');
export const createF1GlbSystem=deferredFor('f1_2010');
export const createI3GlbSystem=deferredFor('i3_2017');

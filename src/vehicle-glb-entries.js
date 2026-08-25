import {createDeferredGlbSystem} from './deferred-glb-system.js';

function deferred(label,importer,exportName){
  return options=>createDeferredGlbSystem({
    label,
    options,
    loadFactory:async()=>{
      const module=await importer();
      return module?.[exportName];
    }
  });
}

export const createCountachGlbSystem=deferred(
  'Countach',
  ()=>import('./countach-glb.js'),
  'createCountachGlbSystem'
);

export const createId4GlbSystem=deferred(
  'ID.4',
  ()=>import('./id4-glb.js'),
  'createId4GlbSystem'
);

export const createWrxGlbSystem=deferred(
  'WRX',
  ()=>import('./wrx-glb.js'),
  'createWrxGlbSystem'
);

export const createCivicGlbSystem=deferred(
  'Civic',
  ()=>import('./civic-glb.js'),
  'createCivicGlbSystem'
);

export const createSonataGlbSystem=deferred(
  'Sonata',
  ()=>import('./sonata-glb.js'),
  'createSonataGlbSystem'
);

export const createF1GlbSystem=deferred(
  'F1',
  ()=>import('./f1-glb.js'),
  'createF1GlbSystem'
);

export const createI3GlbSystem=deferred(
  'BMW i3',
  ()=>import('./i3-glb.js'),
  'createI3GlbSystem'
);

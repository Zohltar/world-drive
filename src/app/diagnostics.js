const DIAGNOSTIC_CATEGORIES=Object.freeze([
  'framePacing',
  'forest',
  'physics',
  'traffic',
  'multiplayer',
  'wheelspin',
  'streaming',
  'roadSigns',
  'presentation'
]);

function objectLike(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}

export function ensureWorldDriveDiagnostics(target=globalThis){
  let root=target.WorldDriveDiagnostics;
  if(!objectLike(root)){
    root={};
    target.WorldDriveDiagnostics=root;
  }
  for(const category of DIAGNOSTIC_CATEGORIES){
    if(!objectLike(root[category]))root[category]={};
  }
  return root;
}

export function installDiagnosticAlias(alias,resolve,target=globalThis){
  if(typeof alias!=='string'||!alias)throw new TypeError('diagnostic alias name required');
  if(typeof resolve!=='function')throw new TypeError('diagnostic alias resolver required');
  const delegate=(...args)=>{
    const value=resolve();
    return typeof value==='function'?value(...args):value;
  };
  Object.defineProperty(delegate,'__worldDriveDiagnosticAlias',{value:alias});
  target[alias]=delegate;
  return delegate;
}

export function readWorldDriveDiagnostics(target=globalThis){
  return objectLike(target.WorldDriveDiagnostics)?target.WorldDriveDiagnostics:null;
}

// Canonical World Drive application-settings lifecycle.
// Owns one stable settings object across defaults, IndexedDB load and debounced
// saves so controllers created before async startup never retain a stale root.

function isPlainObject(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  return prototype===Object.prototype||prototype===null;
}

export function cloneSettingsValue(value){
  if(Array.isArray(value))return value.map(cloneSettingsValue);
  if(isPlainObject(value)){
    const out={};
    for(const [key,item] of Object.entries(value)){
      out[key]=cloneSettingsValue(item);
    }
    return out;
  }
  return value;
}

export function replaceSettingsInPlace(target,source){
  if(!isPlainObject(target)){
    throw new Error('Settings target must be a plain object');
  }
  if(!isPlainObject(source)){
    throw new Error('Settings source must be a plain object');
  }

  for(const key of Object.keys(target)){
    if(!Object.prototype.hasOwnProperty.call(source,key)){
      delete target[key];
    }
  }

  for(const [key,value] of Object.entries(source)){
    if(isPlainObject(value)&&isPlainObject(target[key])){
      replaceSettingsInPlace(target[key],value);
    }else{
      target[key]=cloneSettingsValue(value);
    }
  }

  return target;
}

export function createApplicationSettingsController({
  defaults,
  store,
  saveDelayMs=120,
  setTimeoutFn=setTimeout,
  clearTimeoutFn=clearTimeout,
  warn=(...args)=>console.warn(...args)
}={}){
  if(!isPlainObject(defaults)){
    throw new Error('Application settings requires plain-object defaults');
  }
  if(typeof store?.load!=='function'||typeof store?.save!=='function'){
    throw new Error('Application settings requires load/save store');
  }
  if(typeof setTimeoutFn!=='function'||typeof clearTimeoutFn!=='function'){
    throw new Error('Application settings requires timer functions');
  }

  const settings=cloneSettingsValue(defaults);
  let loaded=false;
  let saveTimer=null;

  async function load(){
    const loadedSettings=await store.load();
    const next=isPlainObject(loadedSettings)
      ?loadedSettings
      :defaults;

    replaceSettingsInPlace(settings,next);
    loaded=true;
    return settings;
  }

  function queueSave(){
    if(!loaded)return false;

    if(saveTimer!==null){
      clearTimeoutFn(saveTimer);
    }

    saveTimer=setTimeoutFn(()=>{
      saveTimer=null;
      Promise.resolve(store.save(settings)).catch(error=>{
        warn('Settings save failed',error);
      });
    },saveDelayMs);

    return true;
  }

  function cloneDefaultControls(){
    return cloneSettingsValue(defaults.controls||{});
  }

  return Object.freeze({
    settings,
    load,
    queueSave,
    cloneDefaultControls,
    saveDelayMs,
    get loaded(){
      return loaded;
    }
  });
}

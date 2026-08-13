// World Drive - generic cache infrastructure
// Step 1: memory LRU + IndexedDB persistence.
// OSM/Overpass fetching remains in main.js for now.

const WORLD_DB_NAME='worlddrive_cache_v3';
const WORLD_DB_VERSION=2;
const SETTINGS_STORE='settings';

export const DEFAULT_WORLD_SETTINGS={
  audioEnabled:true,
  displayDistance:'high',
  transmissionMode:'automatic',
  assist:true,
  obeyRoadSpeedLimits:true,
  imageryEnabled:true,

  display:{
    cluster:true,
    minimap:true,
    compass:true
  },

  controls:{
    keyboard:{
      accelerate:['KeyW','ArrowUp'],
      brake:['KeyS','ArrowDown'],
      steerLeft:['KeyA','ArrowLeft'],
      steerRight:['KeyD','ArrowRight'],
      handbrake:['Space'],
      shiftUp:['BracketRight'],
      shiftDown:['BracketLeft'],
      camera:['KeyC'],
      assist:['KeyL'],
      autopilot:['KeyP'],
      reset:['KeyR']
    },

    gamepad:{
      joystickSensitivity:1.0,
      steerAxis:0,
      lookXAxis:2,
      lookYAxis:3,
      brakeButton:6,
      throttleButton:7,
      handbrakeButton:1,
      shiftUpButton:0,
      shiftDownButton:2,
      cameraButton:3,
      assistButton:null,
      autopilotButton:8,
      resetButton:9,
      reverseViewButton:11
    }
  }
};

function cloneJson(value){
  return JSON.parse(JSON.stringify(value));
}

function mergeObject(base,stored){
  const out=cloneJson(base);

  if(!stored||typeof stored!=='object'){
    return out;
  }

  for(const [key,value] of Object.entries(stored)){
    if(
      value&&
      typeof value==='object'&&
      !Array.isArray(value)&&
      out[key]&&
      typeof out[key]==='object'&&
      !Array.isArray(out[key])
    ){
      out[key]=mergeObject(out[key],value);
    }else{
      out[key]=cloneJson(value);
    }
  }

  return out;
}

export const WorldCache={
  limits:{
    elevation:72,
    imagery:110,
    osmMemory:10,
    osmPersistent:120
  },

  // Legacy keys are kept only to migrate V5.2 localStorage entries.
  osmPrefix:'worlddrive_osm_v2:',
  osmIndexKey:'worlddrive_osm_v2:index',

  touch(map,key,value){
    if(map.has(key))map.delete(key);
    map.set(key,value);
    return value;
  },

  get(map,key){
    if(!map.has(key))return null;
    const value=map.get(key);
    map.delete(key);
    map.set(key,value);
    return value;
  },

  trim(map,max,onEvict=null){
    while(map.size>max){
      const first=map.keys().next().value;
      const value=map.get(first);
      map.delete(first);
      try{onEvict?.(value,first)}catch(error){
        console.warn('Cache eviction callback failed',error);
      }
    }
  },

  cellSize(namespace){
    if(namespace==='roadmeta')return .003;
    if(namespace==='scenery')return .020;
    if(namespace==='signs')return .025;
    return .025;
  },

  cell(namespace,lat,lon){
    const size=this.cellSize(namespace);
    return `${Math.floor(lat/size)}:${Math.floor(lon/size)}`;
  },

  osmKey(namespace,lat,lon){
    return `${namespace}:${this.cell(namespace,lat,lon)}`;
  }
};

class IndexedDbCache {
  constructor({
    dbName=WORLD_DB_NAME,
    storeName='osm',
    memoryLimit=WorldCache.limits.osmMemory,
    persistentLimit=WorldCache.limits.osmPersistent
  }={}){
    this.dbName=dbName;
    this.storeName=storeName;
    this.memoryLimit=memoryLimit;
    this.persistentLimit=persistentLimit;

    this.memory=new Map();
    this.pending=new Map();
    this.dbPromise=null;
  }

  open(){
    if(this.dbPromise)return this.dbPromise;

    this.dbPromise=new Promise(resolve=>{
      if(!('indexedDB' in window)){
        resolve(null);
        return;
      }

      const request=indexedDB.open(this.dbName,WORLD_DB_VERSION);

      request.onupgradeneeded=()=>{
        const db=request.result;

        if(!db.objectStoreNames.contains(this.storeName)){
          const store=db.createObjectStore(this.storeName,{keyPath:'key'});
          store.createIndex('lastAccess','lastAccess',{unique:false});
          store.createIndex('namespace','namespace',{unique:false});
        }

        if(!db.objectStoreNames.contains(SETTINGS_STORE)){
          db.createObjectStore(SETTINGS_STORE,{keyPath:'key'});
        }
      };

      request.onsuccess=()=>{
        const db=request.result;

        db.onversionchange=()=>{
          try{db.close()}catch(error){}
          this.dbPromise=null;
        };

        resolve(db);
      };

      request.onblocked=()=>{
        console.warn('IndexedDB upgrade blocked by another World Drive tab');
      };

      request.onerror=()=>{
        console.warn('IndexedDB open failed',request.error);
        resolve(null);
      };
    });

    return this.dbPromise;
  }

  memGet(key,ttl){
    const record=WorldCache.get(this.memory,key);
    if(!record)return null;

    if(Date.now()-record.ts>ttl){
      this.memory.delete(key);
      return null;
    }

    record.lastAccess=Date.now();
    return record.data;
  }

  memSet(key,namespace,data,ts=Date.now()){
    WorldCache.touch(this.memory,key,{
      key,
      namespace,
      data,
      ts,
      lastAccess:Date.now()
    });

    WorldCache.trim(this.memory,this.memoryLimit);
  }

  async get(namespace,lat,lon,ttl=1000*60*60*24*14){
    const key=WorldCache.osmKey(namespace,lat,lon);

    const memoryHit=this.memGet(key,ttl);
    if(memoryHit)return memoryHit;

    const db=await this.open();

    if(db){
      const record=await new Promise(resolve=>{
        try{
          const tx=db.transaction(this.storeName,'readonly');
          const request=tx.objectStore(this.storeName).get(key);
          request.onsuccess=()=>resolve(request.result||null);
          request.onerror=()=>resolve(null);
        }catch(error){
          resolve(null);
        }
      });

      if(record){
        if(Date.now()-record.ts<=ttl){
          record.lastAccess=Date.now();
          this.memSet(key,namespace,record.data,record.ts);

          // Refresh access time without delaying the caller.
          try{
            const tx=db.transaction(this.storeName,'readwrite');
            tx.objectStore(this.storeName).put(record);
          }catch(error){}

          return record.data;
        }

        try{
          const tx=db.transaction(this.storeName,'readwrite');
          tx.objectStore(this.storeName).delete(key);
        }catch(error){}
      }
    }

    // One-time migration of the older V5.2 localStorage cache.
    try{
      const legacySize=.04;
      const legacyCell=
        `${Math.floor(lat/legacySize)}:${Math.floor(lon/legacySize)}`;
      const legacyKey=
        `${WorldCache.osmPrefix}${namespace}:${legacyCell}`;
      const raw=localStorage.getItem(legacyKey);

      if(raw){
        const legacy=JSON.parse(raw);

        if(
          legacy?.data &&
          legacy?.ts &&
          Date.now()-legacy.ts<=ttl
        ){
          await this.set(namespace,lat,lon,legacy.data,legacy.ts);
          localStorage.removeItem(legacyKey);
          return legacy.data;
        }
      }
    }catch(error){
      console.warn('Legacy cache migration skipped',error);
    }

    return null;
  }

  async set(namespace,lat,lon,data,ts=Date.now()){
    if(!data)return false;

    const key=WorldCache.osmKey(namespace,lat,lon);
    this.memSet(key,namespace,data,ts);

    const db=await this.open();
    if(!db)return false;

    try{
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(this.storeName,'readwrite');

        tx.objectStore(this.storeName).put({
          key,
          namespace,
          ts,
          lastAccess:Date.now(),
          data
        });

        tx.oncomplete=resolve;
        tx.onerror=()=>reject(tx.error);
      });

      this.trimPersistent().catch(error=>{
        console.warn('Persistent cache trim failed',error);
      });

      return true;
    }catch(error){
      console.warn('IndexedDB cache write failed',namespace,error);
      return false;
    }
  }

  async count(namespace=null){
    const db=await this.open();
    if(!db)return 0;

    return new Promise(resolve=>{
      try{
        const tx=db.transaction(this.storeName,'readonly');
        const store=tx.objectStore(this.storeName);
        const request=namespace
          ?store.index('namespace').count(namespace)
          :store.count();

        request.onsuccess=()=>resolve(request.result||0);
        request.onerror=()=>resolve(0);
      }catch(error){
        resolve(0);
      }
    });
  }

  async trimPersistent(){
    const db=await this.open();
    if(!db)return;

    const total=await this.count();
    const excess=total-this.persistentLimit;
    if(excess<=0)return;

    await new Promise(resolve=>{
      try{
        const tx=db.transaction(this.storeName,'readwrite');
        const index=tx
          .objectStore(this.storeName)
          .index('lastAccess');

        let removed=0;
        const request=index.openCursor();

        request.onsuccess=()=>{
          const cursor=request.result;
          if(!cursor||removed>=excess)return;

          cursor.delete();
          removed++;
          cursor.continue();
        };

        tx.oncomplete=resolve;
        tx.onerror=resolve;
      }catch(error){
        resolve();
      }
    });
  }

  async clear(){
    this.memory.clear();
    this.pending.clear();

    const db=await this.open();

    if(db){
      await new Promise(resolve=>{
        try{
          const tx=db.transaction(this.storeName,'readwrite');
          tx.objectStore(this.storeName).clear();
          tx.oncomplete=resolve;
          tx.onerror=resolve;
        }catch(error){
          resolve();
        }
      });
    }

    // Also clear any legacy V5.2 localStorage entries.
    try{
      const keys=[];

      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i);
        if(key&&key.startsWith(WorldCache.osmPrefix)){
          keys.push(key);
        }
      }

      keys.forEach(key=>localStorage.removeItem(key));
      localStorage.removeItem(WorldCache.osmIndexKey);
    }catch(error){
      console.warn('Legacy cache cleanup skipped',error);
    }
  }
}

export const OsmCache=new IndexedDbCache();

class SettingsStore {
  constructor(cache){
    this.cache=cache;
    this.key='app-settings';
  }

  defaults(){
    return cloneJson(DEFAULT_WORLD_SETTINGS);
  }

  async load(){
    const db=await this.cache.open();
    if(!db||!db.objectStoreNames.contains(SETTINGS_STORE)){
      return this.defaults();
    }

    const record=await new Promise(resolve=>{
      try{
        const tx=db.transaction(SETTINGS_STORE,'readonly');
        const request=tx.objectStore(SETTINGS_STORE).get(this.key);
        request.onsuccess=()=>resolve(request.result||null);
        request.onerror=()=>resolve(null);
      }catch(error){
        resolve(null);
      }
    });

    return mergeObject(
      DEFAULT_WORLD_SETTINGS,
      record?.value
    );
  }

  async save(settings){
    const db=await this.cache.open();
    if(!db||!db.objectStoreNames.contains(SETTINGS_STORE)){
      return false;
    }

    const value=mergeObject(
      DEFAULT_WORLD_SETTINGS,
      settings
    );

    return new Promise(resolve=>{
      try{
        const tx=db.transaction(SETTINGS_STORE,'readwrite');

        tx.objectStore(SETTINGS_STORE).put({
          key:this.key,
          updatedAt:Date.now(),
          value
        });

        tx.oncomplete=()=>resolve(true);
        tx.onerror=()=>resolve(false);
      }catch(error){
        resolve(false);
      }
    });
  }

  async clear(){
    const db=await this.cache.open();
    if(!db||!db.objectStoreNames.contains(SETTINGS_STORE)){
      return;
    }

    await new Promise(resolve=>{
      try{
        const tx=db.transaction(SETTINGS_STORE,'readwrite');
        tx.objectStore(SETTINGS_STORE).clear();
        tx.oncomplete=resolve;
        tx.onerror=resolve;
      }catch(error){
        resolve();
      }
    });
  }
}

export const WorldSettings=new SettingsStore(OsmCache);

function roughRecordBytes(value){
  try{
    return new Blob(
      [JSON.stringify(value)]
    ).size;
  }catch(error){
    try{
      return JSON.stringify(value)?.length||0;
    }catch(innerError){
      return 0;
    }
  }
}

async function storeStats(db,storeName){
  if(!db.objectStoreNames.contains(storeName)){
    return {records:0,bytes:0};
  }

  return new Promise(resolve=>{
    let records=0;
    let bytes=0;

    try{
      const tx=db.transaction(storeName,'readonly');
      const request=tx.objectStore(storeName).openCursor();

      request.onsuccess=()=>{
        const cursor=request.result;
        if(!cursor)return;

        records++;
        bytes+=roughRecordBytes(cursor.value);
        cursor.continue();
      };

      tx.oncomplete=()=>resolve({records,bytes});
      tx.onerror=()=>resolve({records,bytes});
    }catch(error){
      resolve({records,bytes});
    }
  });
}

export async function getWorldCacheStats(){
  const db=await OsmCache.open();

  if(!db){
    return {
      bytes:0,
      records:0,
      persistent:false
    };
  }

  const stores=[
    OsmCache.storeName,
    SETTINGS_STORE
  ];

  let bytes=0;
  let records=0;

  for(const storeName of stores){
    const stats=await storeStats(db,storeName);
    bytes+=stats.bytes;
    records+=stats.records;
  }

  return {
    bytes,
    records,
    persistent:true
  };
}

export async function clearWorldDriveCache(){
  await OsmCache.clear();
  await WorldSettings.clear();

  // V21 settings live in IndexedDB, but older versions stored several switches
  // in localStorage. Clearing the cache intentionally restores every default.
  try{
    const keys=[];

    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);

      if(key&&key.startsWith('worlddrive_')){
        keys.push(key);
      }
    }

    keys.forEach(key=>localStorage.removeItem(key));
  }catch(error){
    console.warn('Legacy settings cleanup skipped',error);
  }
}


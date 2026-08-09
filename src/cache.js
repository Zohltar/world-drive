// World Drive - generic cache infrastructure
// Step 1: memory LRU + IndexedDB persistence.
// OSM/Overpass fetching remains in main.js for now.

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
    dbName='worlddrive_cache_v3',
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

      const request=indexedDB.open(this.dbName,1);

      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(this.storeName)){
          const store=db.createObjectStore(this.storeName,{keyPath:'key'});
          store.createIndex('lastAccess','lastAccess',{unique:false});
          store.createIndex('namespace','namespace',{unique:false});
        }
      };

      request.onsuccess=()=>resolve(request.result);
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

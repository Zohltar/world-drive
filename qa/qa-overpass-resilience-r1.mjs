import assert from 'node:assert/strict';
import {createOverpassClient} from '../src/overpass.js';

const nativeFetch=globalThis.fetch;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function cacheStub(){
  return {
    pending:new Map(),
    async get(){return null;},
    async set(){return true;}
  };
}

function jsonResponse(data,status=200){
  return {
    ok:status>=200&&status<300,
    status,
    async json(){return data;}
  };
}

function abortError(message='aborted'){
  const error=new Error(message);
  error.name='AbortError';
  return error;
}

try{
  // R1.1 — a heavy query timing out on every mirror must not blacklist those
  // mirrors for a lighter world-service query that follows it.
  {
    const endpoints=[
      'https://a.test/api/interpreter',
      'https://b.test/api/interpreter'
    ];
    const calls=[];
    globalThis.fetch=async(url,init)=>{
      const query=new URLSearchParams(init.body).get('data');
      calls.push({url:String(url),query});
      if(query==='HYDRO')throw abortError('hydro timeout');
      return jsonResponse({elements:[{id:1}]});
    };

    const client=createOverpassClient({
      cache:cacheStub(),
      keyFor:(namespace,lat,lon)=>`${namespace}:${lat}:${lon}`,
      endpoints,
      minRequestGapMs:0,
      maxConcurrentRequests:1
    });

    const hydro=await client.fetchRaw({
      query:'HYDRO',
      timeoutMs:25,
      label:'Hydro'
    });
    assert.equal(hydro,null,'timed-out hydro should fail cleanly');

    const afterHydro=client.diagnostics();
    assert.equal(
      afterHydro.endpoints.reduce((sum,item)=>sum+item.consecutiveHardFailures,0),
      0,
      'query timeouts must not become endpoint-wide hard failures'
    );
    assert.equal(
      afterHydro.endpoints.every(item=>item.available),
      true,
      'query timeouts must leave mirrors available to unrelated services'
    );

    const scenery=await client.fetchRaw({
      query:'SCENERY',
      timeoutMs:25,
      label:'OSM scenery'
    });
    assert.deepEqual(scenery,{elements:[{id:1}]},'scenery should still get an independent attempt');
    assert.ok(
      calls.some(call=>call.query==='SCENERY'),
      'scenery never reached a mirror after hydro timeout'
    );
  }

  // R1.2 — genuine server failure still cools the bad mirror while failover
  // continues through a healthy mirror.
  {
    const endpoints=[
      'https://hard-fail.test/api/interpreter',
      'https://healthy.test/api/interpreter'
    ];
    const calls=[];
    globalThis.fetch=async(url,init)=>{
      const endpoint=String(url);
      const query=new URLSearchParams(init.body).get('data');
      calls.push({endpoint,query});
      if(endpoint.includes('hard-fail.test')){
        return jsonResponse({
          __worldDriveOverpassFailure:true,
          status:503,
          message:'upstream unavailable'
        });
      }
      return jsonResponse({elements:[{id:2}]});
    };

    const client=createOverpassClient({
      cache:cacheStub(),
      keyFor:(namespace,lat,lon)=>`${namespace}:${lat}:${lon}`,
      endpoints,
      minRequestGapMs:0,
      maxConcurrentRequests:1
    });

    const first=await client.fetchRaw({query:'FIRST',timeoutMs:25,label:'OSM first'});
    assert.deepEqual(first,{elements:[{id:2}]},'healthy mirror failover did not recover request');

    const health=client.diagnostics();
    const bad=health.endpoints.find(item=>item.host==='hard-fail.test');
    assert.ok(bad,'hard-fail mirror diagnostics missing');
    assert.equal(bad.available,false,'503 mirror should enter cooldown');
    assert.ok(bad.cooldownMs>0,'503 mirror cooldown missing');
    assert.equal(bad.consecutiveHardFailures,1,'503 hard-failure count mismatch');

    const hardCallsBefore=calls.filter(call=>call.endpoint.includes('hard-fail.test')).length;
    const second=await client.fetchRaw({query:'SECOND',timeoutMs:25,label:'OSM second'});
    assert.deepEqual(second,{elements:[{id:2}]},'healthy mirror should remain usable');
    const hardCallsAfter=calls.filter(call=>call.endpoint.includes('hard-fail.test')).length;
    assert.equal(
      hardCallsAfter,
      hardCallsBefore,
      'cooling hard-fail mirror was retried immediately'
    );
  }

  // R1.3 — one slow logical service must not monopolize the whole Overpass
  // pipeline. Two lanes are allowed, while production pacing still spaces their
  // actual outbound starts.
  {
    const endpoints=[
      'https://lane-a.test/api/interpreter',
      'https://lane-b.test/api/interpreter'
    ];
    let slowAttempts=0;
    let resolveSlowStarted;
    const slowStarted=new Promise(resolve=>{resolveSlowStarted=resolve;});

    globalThis.fetch=(url,init)=>{
      const query=new URLSearchParams(init.body).get('data');
      if(query==='SLOW'){
        slowAttempts++;
        if(slowAttempts>1)return Promise.reject(abortError('second slow mirror skipped'));
        resolveSlowStarted();
        return new Promise((resolve,reject)=>{
          init.signal.addEventListener('abort',()=>reject(abortError('slow timeout')),{once:true});
        });
      }
      return Promise.resolve(jsonResponse({elements:[{id:3}]}));
    };

    const client=createOverpassClient({
      cache:cacheStub(),
      keyFor:(namespace,lat,lon)=>`${namespace}:${lat}:${lon}`,
      endpoints,
      minRequestGapMs:0,
      maxConcurrentRequests:2
    });

    const slowPromise=client.fetchRaw({
      query:'SLOW',
      timeoutMs:45,
      label:'Hydro slow'
    });
    await slowStarted;

    const fastPromise=client.fetchRaw({
      query:'FAST',
      timeoutMs:25,
      label:'OSM scenery fast'
    });

    const fast=await Promise.race([
      fastPromise,
      delay(20).then(()=>Symbol.for('timeout'))
    ]);
    assert.notEqual(
      fast,
      Symbol.for('timeout'),
      'second world-service request remained blocked behind slow hydro'
    );
    assert.deepEqual(fast,{elements:[{id:3}]},'parallel logical lane returned wrong data');

    const duringSlow=client.diagnostics();
    assert.equal(duringSlow.maxConcurrentRequests,2,'Overpass logical lane count changed');
    assert.ok(
      duringSlow.activeLogicalRequests>=1,
      'slow logical request should still be active while fast request completes'
    );

    const slow=await slowPromise;
    assert.equal(slow,null,'slow timeout should still fail cleanly');
  }

  console.log('OVERPASS RESILIENCE R1 QA: PASS');
  console.log('timeout isolation / hard-failure cooldown / two-lane service concurrency: verified');
}finally{
  globalThis.fetch=nativeFetch;
}

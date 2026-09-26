import assert from 'node:assert/strict';
import {
  MANIC2,MANIC5,YUNGAS_START,YUNGAS_END,YUNGAS_WAYPOINTS,
  LAGUNA_SECA_START,NORDSCHLEIFE_START
} from '../src/routing/route-presets.js';
import {R24_DEFAULT_BIOMES,selectDefaultBiomeR24} from '../tools/biomes/default-biome-activation-r24.mjs';

const state=(routeStart,routeEnd,routeKind='road',routeWaypoints=[])=>({routeStart,routeEnd,routeKind,routeWaypoints});
assert.equal(selectDefaultBiomeR24(state(MANIC2,MANIC5))?.pilot,'r21-manic-boreal-diversity');
assert.equal(selectDefaultBiomeR24(state(YUNGAS_START,YUNGAS_END,'road',YUNGAS_WAYPOINTS))?.pilot,'r20-yungas-humid-montane');
assert.equal(selectDefaultBiomeR24(state(LAGUNA_SECA_START,LAGUNA_SECA_START,'circuit'))?.pilot,'r19-laguna-dry');
assert.equal(selectDefaultBiomeR24(state(NORDSCHLEIFE_START,NORDSCHLEIFE_START,'circuit'))?.pilot,'r22-nord-eifel');
assert.equal(selectDefaultBiomeR24(state(MANIC5,MANIC2)),null,'forward-only accepted Manic pilot must not silently reverse');
assert.equal(selectDefaultBiomeR24(state(YUNGAS_START,YUNGAS_END,'road',[])),null,'Yungas historic waypoint remains part of route admission');
assert.equal(selectDefaultBiomeR24(state({lat:48.4,lon:-71.6},{lat:48.6,lon:-72.4})),null,'unreviewed route must retain generic R4');
assert.equal(selectDefaultBiomeR24({}),null);
assert.deepEqual(Object.keys(R24_DEFAULT_BIOMES).sort(),['laguna','manic','nord','yungas']);
console.log(JSON.stringify({status:'PASS',routes:Object.fromEntries(Object.entries(R24_DEFAULT_BIOMES).map(([k,v])=>[k,v.pilot])),fallback:'generic-r4'}));

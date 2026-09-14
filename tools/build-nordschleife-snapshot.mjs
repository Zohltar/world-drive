import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const RELATION_ID=38566;
const OFFICIAL_LENGTH_M=20832;
const OSM_API=`https://api.openstreetmap.org/api/0.6/relation/${RELATION_ID}/full.json`;
const OUTPUT_URL=new URL('../src/routing/circuits/nordschleife.json',import.meta.url);
const EARTH_RADIUS_M=6371000;

function distanceM(a,b){
  const p1=a.lat*Math.PI/180;
  const p2=b.lat*Math.PI/180;
  const dp=(b.lat-a.lat)*Math.PI/180;
  const dl=(b.lon-a.lon)*Math.PI/180;
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*EARTH_RADIUS_M*Math.asin(Math.min(1,Math.sqrt(h)));
}

function routeLengthM(points){
  let total=0;
  for(let i=1;i<points.length;i++)total+=distanceM(points[i-1],points[i]);
  return total;
}

function fail(message){
  throw new Error(`Nordschleife snapshot: ${message}`);
}

const response=await fetch(OSM_API,{
  headers:{
    Accept:'application/json',
    'User-Agent':'WorldDrive circuit snapshot builder'
  }
});
if(!response.ok)fail(`OSM API returned ${response.status}`);

const data=await response.json();
const relation=data.elements?.find(element=>
  element.type==='relation'&&element.id===RELATION_ID
);
if(!relation)fail(`relation ${RELATION_ID} is missing`);

const nodes=new Map(
  data.elements
    .filter(element=>element.type==='node')
    .map(node=>[node.id,node])
);
const ways=new Map(
  data.elements
    .filter(element=>element.type==='way')
    .map(way=>[way.id,way])
);

const orderedWays=[];
let previousEnd=null;
for(const [index,member] of relation.members.entries()){
  if(member.type!=='way')fail(`member ${index} is not a way`);
  const way=ways.get(member.ref);
  if(!way)fail(`way ${member.ref} is missing`);
  let nodeIds=[...way.nodes];
  let reversed=false;
  if(previousEnd!==null&&nodeIds[0]!==previousEnd){
    if(nodeIds.at(-1)!==previousEnd){
      fail(`way ${way.id} does not join the preceding section`);
    }
    nodeIds.reverse();
    reversed=true;
  }
  if(nodeIds.some(nodeId=>!nodes.has(nodeId))){
    fail(`way ${way.id} references a missing node`);
  }
  orderedWays.push({
    id:way.id,
    name:way.tags?.name||'Nürburgring Nordschleife',
    reversed,
    nodeIds
  });
  previousEnd=nodeIds.at(-1);
}

if(orderedWays.at(-1).nodeIds.at(-1)!==orderedWays[0].nodeIds[0]){
  fail('relation is not a closed loop');
}

const flattened=[];
for(const way of orderedWays){
  for(const nodeId of way.nodeIds){
    if(!flattened.length||flattened.at(-1)!==nodeId)flattened.push(nodeId);
  }
}
if(flattened[0]!==flattened.at(-1))fail('flattened route is not closed');

// The Nürburgring defines the full-lap timing line in the T13 section. Rotate
// the committed loop to the first T13 node so spawning happens on that straight
// while preserving the OSM relation's clockwise direction.
const t13=orderedWays.find(way=>way.name==='T13');
if(!t13)fail('T13 section is missing');
const startNodeId=t13.nodeIds[0];
const uniqueNodeIds=flattened.slice(0,-1);
const startIndex=uniqueNodeIds.indexOf(startNodeId);
if(startIndex<0)fail('T13 start node is missing from the flattened route');
const rotatedNodeIds=[
  ...uniqueNodeIds.slice(startIndex),
  ...uniqueNodeIds.slice(0,startIndex),
  startNodeId
];

const routeNodes=rotatedNodeIds.map(nodeId=>nodes.get(nodeId));
const coordinates=routeNodes.map(node=>[
  Number(node.lon.toFixed(7)),
  Number(node.lat.toFixed(7))
]);
const lengthM=routeLengthM(routeNodes);
let maxSegmentM=0;
for(let i=1;i<routeNodes.length;i++){
  maxSegmentM=Math.max(maxSegmentM,distanceM(routeNodes[i-1],routeNodes[i]));
}

const latestElementTimestamp=data.elements
  .map(element=>Date.parse(element.timestamp||''))
  .filter(Number.isFinite)
  .reduce((latest,value)=>Math.max(latest,value),0);

const snapshot={
  name:'Nürburgring Nordschleife',
  layout:'Full lap · T13 start/finish',
  direction:'clockwise',
  source:`OpenStreetMap relation ${RELATION_ID} route geometry captured ${new Date().toISOString().slice(0,10)}`,
  sourceUrl:`https://www.openstreetmap.org/relation/${RELATION_ID}`,
  sourceRelationId:RELATION_ID,
  sourceLatestElementTimestamp:latestElementTimestamp
    ?new Date(latestElementTimestamp).toISOString()
    :null,
  sourceLicense:'OpenStreetMap contributors · ODbL',
  sourceWayIds:orderedWays.map(way=>way.id),
  orderedWays:orderedWays.map(way=>({
    id:way.id,
    name:way.name,
    reversed:way.reversed,
    joinGapM:0
  })),
  startSection:'T13',
  startWayId:t13.id,
  startNodeId,
  pointCount:coordinates.length,
  lengthM:Number(lengthM.toFixed(2)),
  officialLengthM:OFFICIAL_LENGTH_M,
  officialFactsSource:'https://www.nuerburgring.de/info/nuerburgring/race-tracks/nordschleife?locale=en',
  elevationDifferenceM:300,
  maxClimbPct:18,
  maxDescentPct:11,
  closureGapBeforeSealM:0,
  maxSegmentM:Number(maxSegmentM.toFixed(2)),
  coordinates
};

await writeFile(OUTPUT_URL,`${JSON.stringify(snapshot,null,2)}\n`,'utf8');
console.log('Nordschleife snapshot written',{
  output:fileURLToPath(OUTPUT_URL),
  relation:RELATION_ID,
  ways:orderedWays.length,
  points:coordinates.length,
  lengthM:snapshot.lengthM,
  officialDeltaM:Number((snapshot.lengthM-OFFICIAL_LENGTH_M).toFixed(2)),
  maxSegmentM:snapshot.maxSegmentM,
  startSection:snapshot.startSection
});

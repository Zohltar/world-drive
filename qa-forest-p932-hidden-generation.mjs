import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const policyPath=path.join(root,'src','forest-streaming-policy.js');
const implPath=path.join(root,'src','forest-chunk-streamer-p929.js');

function expect(condition,message){if(!condition)throw new Error(message);}

const policyText=fs.readFileSync(policyPath,'utf8');
const implText=fs.readFileSync(implPath,'utf8');
const {FOREST_STREAMING_POLICY:policy}=await import('./src/forest-streaming-policy.js');

expect(policy.forestAheadLeadMin>=1280,'P9.32 ahead lead minimum must be at least 1280 m');
expect(policy.forestAheadLeadMax>=policy.forestAheadLeadMin,'P9.32 ahead lead max must be >= min');
expect(policy.forestAheadLeadMax<=policy.maxDistance-180,'P9.32 lead must leave a safety margin inside forest coverage');
expect(policy.forestSliceBudgetMs===.95,'P9.32 must preserve the P9.29 0.95 ms slice budget');
expect(policy.candidatesPerBuildSlice===12,'P9.32 must preserve the P9.29 12-candidate cap');
expect(policy.maxDistance===1750,'P9.32 must not increase total forest render distance');
expect(policyText.includes('forestAheadLeadMin:1280'),'P9.32 policy marker missing');
expect(policyText.includes('forestAheadLeadMax:1520'),'P9.32 policy marker missing');
expect(implText.includes('FOREST.forestAheadLeadMin||720'),'P9.31/P9.32 implementation must consume configured lead');
expect(implText.includes('FOREST.forestAheadLeadMax||980'),'P9.31/P9.32 implementation must consume configured max lead');

console.log('PASS P9.32 hidden-generation QA');
console.log({
  forestAheadLeadMin:policy.forestAheadLeadMin,
  forestAheadLeadMax:policy.forestAheadLeadMax,
  maxDistance:policy.maxDistance,
  sliceBudgetMs:policy.forestSliceBudgetMs,
  candidateBatchSize:policy.candidatesPerBuildSlice
});

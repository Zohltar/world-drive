import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'src','skidmarks.js'),'utf8');

assert.match(source,/const deepLateralRubber=hasLateralUsage/,'deep lateral skid-mark path missing');
assert.match(source,/lateralUtil-1\.08/,'deep lateral skid threshold drifted');
assert.match(source,/deepSlip-\.38/,'deep lateral skid deep-slip gate drifted');
assert.match(source,/const intenseLateral=deepLateralRubber>\.72/,'intense lateral fast-delay gate missing');
assert.match(source,/const delay=intenseLateral\?\.18/,'intense lateral skid marks no longer appear promptly');

function smoothstep01(value){const t=Math.max(0,Math.min(1,Number(value)||0));return t*t*(3-2*t);}
function deepLateralRubber(lateralUtil,deepSlip,load=1){
  return smoothstep01((lateralUtil-1.08)/.42)*smoothstep01((deepSlip-.38)/.42)*load;
}

assert.ok(deepLateralRubber(.98,.65)<.01,'normal near-limit cornering should not trigger deep-slide rubber');
assert.ok(deepLateralRubber(1.18,.55)<.25,'mild slip became too eager visually');
assert.ok(deepLateralRubber(1.45,.82)>.70,'intense lateral slide should create strong rubber candidate');

console.log('V21.27 DEEP LATERAL SKIDMARK QA: PASS');

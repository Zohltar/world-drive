import fs from 'node:fs';

function replaceExact(file,from,to){
  let s=fs.readFileSync(file,'utf8');
  if(!s.includes(from))throw new Error(`${file}: expected source block not found`);
  s=s.replace(from,to);
  fs.writeFileSync(file,s);
}

replaceExact('src/multiplayer.js',`try{
  globalThis.__WORLD_DRIVE_MULTIPLAYER_WIRE__=()=>({
    exactLocalGear:normalizeWireGear(readTransmissionNetworkGear()),
    outgoingCount:wireDiagnostics.outgoingCount,
    incomingCount:wireDiagnostics.incomingCount,
    outgoing:wireDiagnostics.outgoing?{...wireDiagnostics.outgoing}:null,
    incoming:wireDiagnostics.incoming?JSON.parse(JSON.stringify(wireDiagnostics.incoming)):null
  });
}catch{}` ,`multiplayerDiagnostics.wire=()=>({
  exactLocalGear:normalizeWireGear(readTransmissionNetworkGear()),
  outgoingCount:wireDiagnostics.outgoingCount,
  incomingCount:wireDiagnostics.incomingCount,
  outgoing:wireDiagnostics.outgoing?{...wireDiagnostics.outgoing}:null,
  incoming:wireDiagnostics.incoming?JSON.parse(JSON.stringify(wireDiagnostics.incoming)):null
});`);

replaceExact('qa-diagnostics-c6-7.mjs',`if(!source.includes('globalThis.__WORLD_DRIVE_MULTIPLAYER_WIRE__=()=>({'))throw new Error('wire diagnostics changed during C6.7');`,`if(!source.includes('multiplayerDiagnostics.wire=()=>({'))throw new Error('canonical wire diagnostics missing after C6.8');
if(/globalThis\\.__WORLD_DRIVE_MULTIPLAYER_WIRE__\\s*=/.test(source))throw new Error('legacy wire writer returned');`);
replaceExact('qa-diagnostics-c6-7.mjs',`try{delete globalThis.__WORLD_DRIVE_MULTIPLAYER_WIRE__;}catch{}
await import(\`./src/multiplayer.js?c67=\${Date.now()}\`);`,`try{delete globalThis.__WORLD_DRIVE_MULTIPLAYER_WIRE__;}catch{}
await import(\`./src/multiplayer.js?c67=\${Date.now()}\`);`);
replaceExact('qa-diagnostics-c6-7.mjs',`if(typeof globalThis.__WORLD_DRIVE_MULTIPLAYER_WIRE__!=='function')throw new Error('wire diagnostics compatibility changed');`,`if(typeof root.multiplayer.wire!=='function')throw new Error('canonical wire diagnostics missing');
if(globalThis.__WORLD_DRIVE_MULTIPLAYER_WIRE__!==undefined)throw new Error('legacy wire global was recreated');`);
replaceExact('qa-diagnostics-c6-7.mjs',`  wireDiagnosticsUntouched:true,`,`  wireBehaviorUntouched:true,
  wireDiagnosticsCanonical:true,`);

replaceExact('qa/V21_31_MULTIPLAYER_M3_PROTOCOL_QA.mjs',`assert(entry.includes('__WORLD_DRIVE_MULTIPLAYER_WIRE__'),'wire diagnostics must expose actual outgoing/incoming state');`,`assert(entry.includes('multiplayerDiagnostics.wire=()=>({'),'canonical wire diagnostics must expose actual outgoing/incoming state');
assert(!entry.includes('globalThis.__WORLD_DRIVE_MULTIPLAYER_WIRE__='),'legacy wire diagnostics writer must stay retired');`);

console.log('Materialized C6.8 canonical multiplayer wire diagnostics');

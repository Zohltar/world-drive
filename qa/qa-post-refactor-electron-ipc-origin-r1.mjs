import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const {
  normalizeHttpOrigin,
  isTrustedIpcCaller,
  createTrustedIpcHandler
}=require('../electron/ipc-origin-guard.cjs');

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(__dirname,'..');
const mainSource=fs.readFileSync(path.join(repoRoot,'electron','main.cjs'),'utf8');
const preloadSource=fs.readFileSync(path.join(repoRoot,'electron','preload.cjs'),'utf8');

const APP_ORIGIN='http://127.0.0.1:17317';

function makeTrustedFixture(origin=APP_ORIGIN){
  const frame={
    origin,
    url:`${origin}/`,
    isDestroyed:()=>false
  };
  const sender={
    mainFrame:frame,
    isDestroyed:()=>false
  };
  return {
    frame,
    sender,
    event:{sender,senderFrame:frame},
    context:{appOrigin:origin,mainWebContents:sender}
  };
}

assert.equal(normalizeHttpOrigin(`${APP_ORIGIN}/foo`),APP_ORIGIN);
assert.equal(normalizeHttpOrigin('file:///tmp/world-drive.html'),'');
assert.equal(normalizeHttpOrigin('ws://127.0.0.1:8081'),'');

const trusted=makeTrustedFixture();
assert.equal(isTrustedIpcCaller(trusted.event,trusted.context),true,'trusted main frame must be accepted');

{
  const bad=makeTrustedFixture();
  bad.event={...bad.event,sender:{...bad.sender}};
  assert.equal(isTrustedIpcCaller(bad.event,bad.context),false,'different WebContents identity must be rejected');
}

{
  const bad=makeTrustedFixture();
  bad.frame.origin='https://evil.example';
  bad.frame.url='https://evil.example/';
  assert.equal(isTrustedIpcCaller(bad.event,bad.context),false,'foreign origin must be rejected');
}

{
  const bad=makeTrustedFixture();
  bad.frame.url='http://127.0.0.1:17318/';
  assert.equal(isTrustedIpcCaller(bad.event,bad.context),false,'different loopback port must be rejected');
}

{
  const bad=makeTrustedFixture();
  const child={origin:APP_ORIGIN,url:`${APP_ORIGIN}/frame`,isDestroyed:()=>false};
  bad.event={sender:bad.sender,senderFrame:child};
  assert.equal(isTrustedIpcCaller(bad.event,bad.context),false,'same-origin child frame must be rejected');
}

{
  const bad=makeTrustedFixture();
  bad.event={sender:bad.sender,senderFrame:null};
  assert.equal(isTrustedIpcCaller(bad.event,bad.context),false,'missing senderFrame must be rejected');
}

{
  const bad=makeTrustedFixture();
  bad.frame.isDestroyed=()=>true;
  assert.equal(isTrustedIpcCaller(bad.event,bad.context),false,'destroyed frame must be rejected');
}

{
  const bad=makeTrustedFixture();
  bad.sender.isDestroyed=()=>true;
  assert.equal(isTrustedIpcCaller(bad.event,bad.context),false,'destroyed WebContents must be rejected');
}

const channels=[
  'worlddrive:multiplayer:host',
  'worlddrive:multiplayer:join',
  'worlddrive:multiplayer:stop',
  'worlddrive:multiplayer:status'
];

for(const channel of channels){
  const mainCount=mainSource.split(channel).length-1;
  const preloadCount=preloadSource.split(channel).length-1;
  assert.equal(mainCount,1,`${channel}: main process registration drifted`);
  assert.equal(preloadCount,1,`${channel}: preload exposure drifted`);
}

assert.ok(mainSource.includes("require('./ipc-origin-guard.cjs')"),'main process must load caller-origin guard');
assert.equal((mainSource.match(/createTrustedIpcHandler\(/g)||[]).length,4,'all four multiplayer IPC handlers must use the trusted wrapper');
assert.ok(mainSource.includes('mainWebContents:mainWindow?.webContents||null'),'IPC context must bind to the active World Drive window');
assert.ok(preloadSource.includes('contextBridge.exposeInMainWorld'),'preload must keep contextBridge boundary');
assert.ok(!preloadSource.includes('ipcRenderer:ipcRenderer'),'preload must not expose raw ipcRenderer');

{
  const fixture=makeTrustedFixture();
  const calls=[];
  let currentContext=fixture.context;
  const context=()=>currentContext;
  const host=createTrustedIpcHandler(options=>{calls.push(['host',options]);return Promise.resolve({ok:true,mode:'host'});},context);
  const join=createTrustedIpcHandler(options=>{calls.push(['join',options]);return Promise.resolve({ok:true,mode:'join'});},context);
  const stop=createTrustedIpcHandler(()=>{calls.push(['stop']);return Promise.resolve({ok:true,mode:'off'});},context);
  const status=createTrustedIpcHandler(()=>{calls.push(['status']);return {ok:true,mode:'off'};},context);

  assert.deepEqual(await host(fixture.event,{port:8081}),{ok:true,mode:'host'});
  assert.deepEqual(await join(fixture.event,{host:'192.168.1.10',port:8081}),{ok:true,mode:'join'});
  assert.deepEqual(await stop(fixture.event),{ok:true,mode:'off'});
  assert.deepEqual(status(fixture.event),{ok:true,mode:'off'});
  assert.deepEqual(calls,[
    ['host',{port:8081}],
    ['join',{host:'192.168.1.10',port:8081}],
    ['stop'],
    ['status']
  ],'trusted handler arguments/results must remain unchanged');

  const before=calls.length;
  const untrusted=makeTrustedFixture('https://evil.example');
  assert.throws(
    ()=>status(untrusted.event),
    /Blocked untrusted World Drive multiplayer IPC caller/,
    'synthetic foreign renderer must be rejected'
  );
  assert.equal(calls.length,before,'rejected caller must not reach multiplayer runtime');

  currentContext={appOrigin:APP_ORIGIN,mainWebContents:null};
  assert.throws(
    ()=>status(fixture.event),
    /Blocked untrusted World Drive multiplayer IPC caller/,
    'closed/no active World Drive window must be rejected'
  );
  assert.equal(calls.length,before,'missing active window must not reach multiplayer runtime');
}

console.log('Post-refactor Electron IPC caller-origin QA PASS');

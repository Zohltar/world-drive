'use strict';

function normalizeHttpOrigin(value){
  try{
    const parsed=new URL(String(value||''));
    if(parsed.protocol!=='http:'&&parsed.protocol!=='https:')return '';
    return parsed.origin;
  }catch{
    return '';
  }
}

function isTrustedIpcCaller(event,{appOrigin,mainWebContents}={}){
  const expectedOrigin=normalizeHttpOrigin(appOrigin);
  if(!expectedOrigin||!event||!mainWebContents)return false;

  const sender=event.sender;
  const frame=event.senderFrame;
  if(!sender||sender!==mainWebContents||!frame)return false;

  if(typeof sender.isDestroyed==='function'&&sender.isDestroyed())return false;
  if(typeof frame.isDestroyed==='function'&&frame.isDestroyed())return false;

  // World Drive exposes its preload API only to the top-level application page.
  // Do not grant the same privileged multiplayer IPC surface to subframes.
  if(sender.mainFrame&&frame!==sender.mainFrame)return false;

  if(String(frame.origin||'')!==expectedOrigin)return false;
  if(normalizeHttpOrigin(frame.url)!==expectedOrigin)return false;

  return true;
}

function assertTrustedIpcCaller(event,context){
  if(isTrustedIpcCaller(event,context))return;
  throw new Error('Blocked untrusted World Drive multiplayer IPC caller');
}

function createTrustedIpcHandler(handler,getContext){
  if(typeof handler!=='function')throw new TypeError('IPC handler must be a function');
  return (event,...args)=>{
    const context=typeof getContext==='function'?getContext():getContext;
    assertTrustedIpcCaller(event,context);
    return handler(...args);
  };
}

module.exports={
  normalizeHttpOrigin,
  isTrustedIpcCaller,
  assertTrustedIpcCaller,
  createTrustedIpcHandler
};

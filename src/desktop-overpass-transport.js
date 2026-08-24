// Desktop-only Overpass transport.
//
// The browser build talks to Overpass directly. The Windows/Electron build
// routes Overpass interpreter requests through the same-origin proxy exposed by
// electron/main.cjs. Keeping this transport outside main.js makes the network
// adaptation an explicit platform concern rather than part of the game loop.

const OVERPASS_HOSTS=new Set([
  'overpass-api.de',
  'overpass.private.coffee',
  'overpass.kumi.systems',
  'overpass.nchc.org.tw'
]);

export function installDesktopOverpassTransport(targetWindow=globalThis.window){
  if(
    !targetWindow?.worldDriveDesktop?.isDesktop||
    targetWindow.__worldDriveOverpassTransportInstalled
  ){
    return false;
  }

  const nativeFetch=targetWindow.fetch.bind(targetWindow);

  targetWindow.fetch=(input,init)=>{
    let sourceUrl='';

    try{
      if(typeof input==='string'||input instanceof URL){
        sourceUrl=String(input);
      }else if(input&&typeof input.url==='string'){
        sourceUrl=input.url;
      }

      const parsed=new URL(sourceUrl,targetWindow.location.href);

      if(
        parsed.protocol==='https:'&&
        OVERPASS_HOSTS.has(parsed.hostname)&&
        /\/api\/interpreter\/?$/i.test(parsed.pathname)
      ){
        const proxy=new URL(
          '/__worlddrive_proxy/overpass',
          targetWindow.location.origin
        );

        proxy.searchParams.set(
          'target',
          parsed.toString()
        );

        return nativeFetch(
          proxy.toString(),
          init
        );
      }
    }catch(error){
      console.warn(
        'Desktop Overpass proxy routing failed; using direct fetch',
        error
      );
    }

    return nativeFetch(input,init);
  };

  targetWindow.__worldDriveOverpassTransportInstalled=true;
  console.info('World Drive desktop Overpass proxy enabled');
  return true;
}

if(typeof window!=='undefined'){
  installDesktopOverpassTransport(window);
}

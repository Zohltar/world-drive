// World Drive application/build branding.
//
// Keep the visible runtime version in one place. Development branches use an
// explicit "dev" channel so local testing cannot be confused with the current
// stable baseline. Stable releases use the explicit "stable" channel.

export const WORLD_DRIVE_VERSION='21.31';
export const WORLD_DRIVE_CHANNEL='stable';
export const WORLD_DRIVE_VERSION_LABEL=`V${WORLD_DRIVE_VERSION} ${WORLD_DRIVE_CHANNEL}`;
export const WORLD_DRIVE_TITLE=`World Drive ${WORLD_DRIVE_VERSION_LABEL}`;

const LEGACY_VERSION_PATTERNS=[
  /V21\.29\s+dev/g,
  /V21\.29/g,
  /V21\.28\s+dev/g,
  /V21\.28/g,
  /V21\.27\s+stable/g,
  /V21\.27/g,
  /V21\.21\.26\s+alpha/g,
  /V21\.21\.26/g,
  /V21\.7\s+alpha/g,
  /V21\.7/g
];

function normalizeVersionText(value){
  let text=String(value??'');
  for(const pattern of LEGACY_VERSION_PATTERNS){
    pattern.lastIndex=0;
    text=text.replace(pattern,WORLD_DRIVE_VERSION_LABEL);
  }
  return text;
}

function normalizeTextNode(node){
  if(!node||node.nodeType!==Node.TEXT_NODE)return;
  const current=node.nodeValue||'';
  const next=normalizeVersionText(current);
  if(next!==current)node.nodeValue=next;
}

function normalizeSubtree(root){
  if(!root)return;
  if(root.nodeType===Node.TEXT_NODE){
    normalizeTextNode(root);
    return;
  }
  if(root.nodeType!==Node.ELEMENT_NODE&&root.nodeType!==Node.DOCUMENT_NODE)return;

  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node=walker.nextNode();
  while(node){
    normalizeTextNode(node);
    node=walker.nextNode();
  }
}

// V21.31 compatibility repair: the extracted instrument cluster looks up
// #compassCanvas while the current shell still exposes the historical #compass
// canvas. Reuse that exact canvas under the runtime ID expected by the cluster,
// while preserving the horizontal HUD sizing previously supplied by #compass CSS.
function repairCompassCanvasId(){
  if(typeof document==='undefined')return;
  if(document.getElementById('compassCanvas'))return;
  const compass=document.getElementById('compass');
  if(!compass)return;
  compass.id='compassCanvas';
  Object.assign(compass.style,{
    position:'absolute',
    inset:'0',
    width:'100%',
    height:'100%'
  });
}

export function applyWorldDriveVersionBranding(){
  if(typeof document==='undefined')return;
  document.title=WORLD_DRIVE_TITLE;
  repairCompassCanvasId();
  normalizeSubtree(document.documentElement);
}

if(typeof window!=='undefined'&&typeof document!=='undefined'){
  window.worldDriveBuild=Object.freeze({
    version:WORLD_DRIVE_VERSION,
    channel:WORLD_DRIVE_CHANNEL,
    label:WORLD_DRIVE_VERSION_LABEL,
    title:WORLD_DRIVE_TITLE
  });

  applyWorldDriveVersionBranding();

  const observer=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      if(mutation.type==='characterData'){
        normalizeTextNode(mutation.target);
        continue;
      }
      for(const node of mutation.addedNodes)normalizeSubtree(node);
    }

    repairCompassCanvasId();
    if(document.title!==WORLD_DRIVE_TITLE)document.title=WORLD_DRIVE_TITLE;
  });

  observer.observe(document.documentElement,{
    subtree:true,
    childList:true,
    characterData:true
  });
}

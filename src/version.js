// World Drive application/build branding.
// package.json is the authoritative machine version + release channel source.
import packageInfo from '../package.json' with {type:'json'};

export const WORLD_DRIVE_PACKAGE_VERSION=String(packageInfo?.version||'0.0.0');
export const WORLD_DRIVE_CHANNEL=String(packageInfo?.worldDriveChannel||'dev');
export const WORLD_DRIVE_VERSION=WORLD_DRIVE_PACKAGE_VERSION.replace(/\.0$/,'');
export const WORLD_DRIVE_VERSION_LABEL=`V${WORLD_DRIVE_VERSION} ${WORLD_DRIVE_CHANNEL}`;
export const WORLD_DRIVE_TITLE=`World Drive ${WORLD_DRIVE_VERSION_LABEL}`;

const VERSION_TEXT_PATTERN=/\bV\d+(?:\.\d+){1,2}(?:\s+(?:alpha|beta|dev|stable|cleanup))?\b/g;

function normalizeVersionText(value){
  return String(value??'').replace(VERSION_TEXT_PATTERN,WORLD_DRIVE_VERSION_LABEL);
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

function applyVersionPlaceholders(){
  for(const node of document.querySelectorAll('[data-world-drive-version-label]')){
    node.textContent=WORLD_DRIVE_VERSION_LABEL;
  }
  for(const node of document.querySelectorAll('[data-world-drive-title]')){
    node.textContent=WORLD_DRIVE_TITLE;
  }
}

export function applyWorldDriveVersionBranding(){
  if(typeof document==='undefined')return;
  document.title=WORLD_DRIVE_TITLE;
  applyVersionPlaceholders();
  normalizeSubtree(document.documentElement);
}

if(typeof window!=='undefined'&&typeof document!=='undefined'){
  window.worldDriveBuild=Object.freeze({
    packageVersion:WORLD_DRIVE_PACKAGE_VERSION,
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

    applyVersionPlaceholders();
    if(document.title!==WORLD_DRIVE_TITLE)document.title=WORLD_DRIVE_TITLE;
  });

  observer.observe(document.documentElement,{
    subtree:true,
    childList:true,
    characterData:true
  });
}

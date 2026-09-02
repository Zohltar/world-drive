// World Drive application/build branding.
// package.json is the authoritative machine version + release channel source.
import packageInfo from '../../package.json' with {type:'json'};

export const WORLD_DRIVE_PACKAGE_VERSION=String(packageInfo?.version||'0.0.0');
export const WORLD_DRIVE_CHANNEL=String(packageInfo?.worldDriveChannel||'dev');
export const WORLD_DRIVE_VERSION=WORLD_DRIVE_PACKAGE_VERSION.replace(/\.0$/,'');
export const WORLD_DRIVE_VERSION_LABEL=`V${WORLD_DRIVE_VERSION} ${WORLD_DRIVE_CHANNEL}`;
export const WORLD_DRIVE_TITLE=`World Drive ${WORLD_DRIVE_VERSION_LABEL}`;

function applyVersionPlaceholders(){
  if(typeof document==='undefined')return;
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
}

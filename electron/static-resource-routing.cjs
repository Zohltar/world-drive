'use strict';

function isWorldDataRequest(requestPath){
  const value=String(requestPath||'');
  return value==='/world-data'||value.startsWith('/world-data/');
}

function staticRootForRequest(requestPath,{distRoot,publicRoot}={}){
  if(!distRoot||!publicRoot){
    throw new Error('Desktop static routing requires distRoot and publicRoot');
  }
  return isWorldDataRequest(requestPath)?publicRoot:distRoot;
}

module.exports={
  isWorldDataRequest,
  staticRootForRequest
};

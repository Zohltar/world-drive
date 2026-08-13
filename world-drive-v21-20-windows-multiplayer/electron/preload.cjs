'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'worldDriveDesktop',
  Object.freeze({
    isDesktop:true,
    platform:process.platform,
    multiplayer:Object.freeze({
      host:(options={})=>ipcRenderer.invoke('worlddrive:multiplayer:host',options),
      join:(options={})=>ipcRenderer.invoke('worlddrive:multiplayer:join',options),
      stop:()=>ipcRenderer.invoke('worlddrive:multiplayer:stop'),
      status:()=>ipcRenderer.invoke('worlddrive:multiplayer:status')
    })
  })
);

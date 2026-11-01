// The one thing pages can ask of the desktop app: whether an update is ready, and to install it.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bopziUpdate', {
  get: () => ipcRenderer.invoke('update:state'),
  install: () => ipcRenderer.invoke('update:install'),
  listen: (callback) => {
    const heard = (_event, state) => callback(state);
    ipcRenderer.on('update:state', heard);
    return () => ipcRenderer.removeListener('update:state', heard);
  },
});

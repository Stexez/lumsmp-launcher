'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args).then((result) => {
  if (!result || !result.ok) throw new Error(result?.error || 'İşlem başarısız.');
  return result.data;
});

const EVENTS = new Set(['update', 'progress', 'game', 'state']);

contextBridge.exposeInMainWorld('lumsmp', Object.freeze({
  state: () => invoke('state:get'),
  siteLogin: (username, password) => invoke('site:login', String(username), String(password)),
  siteLogout: () => invoke('site:logout'),
  microsoftLogin: () => invoke('ms:login'),
  microsoftLogout: () => invoke('ms:logout'),
  updateSettings: (patch) => invoke('settings:update', {
    ramMb: patch.ramMb,
    mods: Array.isArray(patch.mods) ? patch.mods.map(String) : undefined,
    modsSetup: typeof patch.modsSetup === 'boolean' ? patch.modsSetup : undefined,
    ramAuto: typeof patch.ramAuto === 'boolean' ? patch.ramAuto : undefined,
    perfMode: typeof patch.perfMode === 'string' ? patch.perfMode : undefined,
  }),
  homeData: () => invoke('home:data'),
  modsCatalog: () => invoke('mods:catalog'),
  play: () => invoke('game:play'),
  open: (kind) => invoke('open', String(kind)),
  minimize: () => invoke('window:minimize'),
  close: () => invoke('window:close'),
  on: (event, callback) => {
    if (!EVENTS.has(event) || typeof callback !== 'function') return () => {};
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on(event, listener);
    return () => ipcRenderer.removeListener(event, listener);
  },
}));

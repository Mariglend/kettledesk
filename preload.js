// preload.js — ponte sicuro tra Electron e l'interfaccia
const { contextBridge, ipcRenderer } = require('electron')
const inv = (ch) => (...a) => ipcRenderer.invoke(ch, ...a)

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  setLang: (code) => ipcRenderer.send('set-lang', code),
  // Google
  googleOAuth:   inv('google-oauth'),
  googleRefresh: inv('google-refresh'),
  // Archivio cifrato
  storeRead:   inv('store-read'),
  storeWrite:  inv('store-write'),
  storeDelete: inv('store-delete'),
  secureGet:   inv('secure-get'),
  secureSet:   inv('secure-set'),
  // Backup
  chooseFolder:       inv('choose-folder'),
  openFolder:         inv('open-folder'),
  writeBackup:        inv('write-backup'),
  pickBackup:         inv('pick-backup'),
  readBackup:         inv('read-backup'),
  importBackupPhotos: inv('import-backup-photos'),
})

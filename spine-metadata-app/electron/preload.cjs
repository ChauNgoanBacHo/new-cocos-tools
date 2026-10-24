const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spineNotes", {
    selectFolder: () => ipcRenderer.invoke("spine-notes:select-folder"),
    scanFolder: (folderPath) => ipcRenderer.invoke("spine-notes:scan-folder", folderPath),
});

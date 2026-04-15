import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("apiDesktopBridge", {
  startApi: () => ipcRenderer.invoke("api:start"),
  stopApi: () => ipcRenderer.invoke("api:stop"),
  getStatus: () => ipcRenderer.invoke("api:status"),
  onStatus: (cb: (online: boolean) => void) => {
    ipcRenderer.on("api:status-changed", (_event, online: boolean) => cb(online));
  },
  onLog: (cb: (line: string) => void) => {
    ipcRenderer.on("api:log", (_event, line: string) => cb(line));
  }
});

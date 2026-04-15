import { contextBridge, ipcRenderer } from "electron";

type EventType =
  | "no_face"
  | "multi_face"
  | "suspicious_head_motion"
  | "window_focus_lost"
  | "context_switch_attempt"
  | "screen_share_interrupted";

contextBridge.exposeInMainWorld("antiCheatBridge", {
  onFlag: (cb: (eventType: EventType) => void) => {
    ipcRenderer.on("flag-event", (_event, eventType: EventType) => cb(eventType));
  }
});

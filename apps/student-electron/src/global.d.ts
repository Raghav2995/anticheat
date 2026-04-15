import { EventType } from "@anticheat/shared-types";

declare global {
  interface Window {
    antiCheatBridge: {
      onFlag: (cb: (eventType: EventType) => void) => void;
    };
  }
}

export {};

declare global {
  interface Window {
    apiDesktopBridge: {
      startApi: () => Promise<void>;
      stopApi: () => Promise<void>;
      getStatus: () => Promise<boolean>;
      onStatus: (cb: (online: boolean) => void) => void;
      onLog: (cb: (line: string) => void) => void;
    };
  }
}

export {};

import { app, BrowserWindow, ipcMain } from "electron";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

let mainWindow: BrowserWindow | null = null;
let apiProcess: ChildProcessWithoutNullStreams | null = null;
let statusInterval: NodeJS.Timeout | null = null;

const isApiHealthy = (): Promise<boolean> =>
  new Promise((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: 4000,
        path: "/health",
        method: "GET",
        timeout: 1200
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += String(chunk);
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            resolve(false);
            return;
          }
          try {
            const parsed = JSON.parse(body) as { ok?: boolean; service?: string };
            resolve(parsed.ok === true && parsed.service === "anticheat-api");
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.end();
  });

const sendStatus = async (): Promise<void> => {
  const online = await isApiHealthy();
  mainWindow?.webContents.send("api:status-changed", online);
};

const appendLog = (line: string): void => {
  mainWindow?.webContents.send("api:log", line);
};

const startApi = async (): Promise<void> => {
  const alreadyHealthy = await isApiHealthy();
  if (alreadyHealthy) {
    appendLog("API already running and healthy on http://127.0.0.1:4000");
    await sendStatus();
    return;
  }
  if (apiProcess) {
    appendLog("API process is already started.");
    await sendStatus();
    return;
  }

  const repoRoot = path.resolve(__dirname, "../../..");
  const apiEntry = path.join(repoRoot, "apps/api/dist/apps/api/src/server.js");
  if (!fs.existsSync(apiEntry)) {
    appendLog(`API build not found: ${apiEntry}`);
    appendLog("Run build once before starting API desktop.");
    await sendStatus();
    return;
  }

  apiProcess = spawn(process.execPath, [apiEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: "4000",
      ELECTRON_RUN_AS_NODE: "1"
    },
    stdio: "pipe"
  });

  appendLog(`Starting API: ${apiEntry}`);

  apiProcess.stdout.on("data", (chunk) => appendLog(String(chunk).trimEnd()));
  apiProcess.stderr.on("data", (chunk) => appendLog(`[ERR] ${String(chunk).trimEnd()}`));
  apiProcess.on("exit", (code) => {
    appendLog(`API process exited with code ${code ?? -1}`);
    apiProcess = null;
    void sendStatus();
  });

  setTimeout(() => {
    void sendStatus();
  }, 700);
};

const stopApi = async (): Promise<void> => {
  if (!apiProcess) {
    appendLog("API process is not running.");
    await sendStatus();
    return;
  }
  apiProcess.kill();
  apiProcess = null;
  appendLog("Stop signal sent to API process.");
  await sendStatus();
};

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, "../src/index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

app.whenReady().then(() => {
  createWindow();
  void startApi();
  statusInterval = setInterval(() => {
    void sendStatus();
  }, 2000);

  ipcMain.handle("api:start", async () => {
    await startApi();
  });

  ipcMain.handle("api:stop", async () => {
    await stopApi();
  });

  ipcMain.handle("api:status", async () => {
    return isApiHealthy();
  });
});

app.on("window-all-closed", () => {
  if (statusInterval) {
    clearInterval(statusInterval);
    statusInterval = null;
  }
  if (apiProcess) {
    apiProcess.kill();
    apiProcess = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

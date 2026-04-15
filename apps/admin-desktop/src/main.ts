import { BrowserWindow, app } from "electron";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

let localAdminServer: http.Server | null = null;

const mimeType = (filePath: string): string => {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
};

const startAdminServer = (): Promise<number> =>
  new Promise((resolve, reject) => {
    if (localAdminServer) {
      const addr = localAdminServer.address();
      if (addr && typeof addr === "object") {
        resolve(addr.port);
        return;
      }
    }

    const adminDist = path.resolve(__dirname, "../../admin-web/dist");
    localAdminServer = http.createServer((req, res) => {
      const reqPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
      const normalizedPath = reqPath === "/" ? "/index.html" : reqPath;
      const resolved = path.resolve(adminDist, `.${normalizedPath}`);
      const fallbackIndex = path.resolve(adminDist, "index.html");
      const isSafePath = resolved.startsWith(adminDist);
      const looksLikeStaticFile = /\.[a-zA-Z0-9]+$/.test(normalizedPath);
      let safeTarget = fallbackIndex;
      if (isSafePath && fs.existsSync(resolved)) {
        safeTarget = resolved;
      } else if (looksLikeStaticFile) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`Missing static asset: ${normalizedPath}`);
        return;
      }

      try {
        const data = fs.readFileSync(safeTarget);
        res.writeHead(200, { "Content-Type": mimeType(safeTarget) });
        res.end(data);
      } catch {
        res.writeHead(500);
        res.end("Failed to load admin app");
      }
    });

    localAdminServer.once("error", reject);
    localAdminServer.listen(0, "127.0.0.1", () => {
      const addr = localAdminServer?.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to determine admin server port"));
        return;
      }
      resolve(addr.port);
    });
  });

const createWindow = (): void => {
  const win = new BrowserWindow({
    width: 1280,
    height: 820
  });
  void startAdminServer().then((port) => {
    void win.loadURL(`http://127.0.0.1:${port}/`);
  });
};

app.whenReady().then(() => {
  createWindow();
});

app.on("window-all-closed", () => {
  if (localAdminServer) {
    localAdminServer.close();
    localAdminServer = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

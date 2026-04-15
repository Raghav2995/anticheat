import { BrowserWindow, app, globalShortcut, session } from "electron";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

app.commandLine.appendSwitch("enable-experimental-web-platform-features");
app.commandLine.appendSwitch("enable-blink-features", "FaceDetector");

let localUiServer: http.Server | null = null;

const startLocalUiServer = (): Promise<number> =>
  new Promise((resolve, reject) => {
    if (localUiServer) {
      const addr = localUiServer.address();
      if (addr && typeof addr === "object") {
        resolve(addr.port);
        return;
      }
    }

    const srcDir = path.join(__dirname, "../src");
    const distDir = path.join(__dirname);
    localUiServer = http.createServer((req, res) => {
      const reqPath = req.url ?? "/";
      if (reqPath === "/" || reqPath === "/index.html") {
        const html = fs.readFileSync(path.join(srcDir, "index.html"), "utf8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
      if (reqPath === "/renderer.js") {
        const js = fs.readFileSync(path.join(distDir, "renderer.js"), "utf8");
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
        res.end(js);
        return;
      }
      res.writeHead(404);
      res.end("Not found");
    });
    localUiServer.once("error", reject);
    localUiServer.listen(0, "127.0.0.1", () => {
      const addr = localUiServer?.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to determine local UI port"));
        return;
      }
      resolve(addr.port);
    });
  });

const createWindow = (): void => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true
    }
  });

  win.setMenuBarVisibility(false);
  win.on("blur", () => {
    win.webContents.send("flag-event", "window_focus_lost");
  });
  void startLocalUiServer().then((port) => {
    void win.loadURL(`http://127.0.0.1:${port}/index.html`);
  });
};

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === "media" || permission === "display-capture") {
      callback(true);
      return;
    }
    callback(false);
  });

  createWindow();

  globalShortcut.register("Alt+Tab", () => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send("flag-event", "context_switch_attempt");
    });
  });
});

app.on("window-all-closed", () => {
  if (localUiServer) {
    localUiServer.close();
    localUiServer = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
const stopBtn = document.getElementById("stopBtn") as HTMLButtonElement;
const statusText = document.getElementById("statusText") as HTMLSpanElement;
const led = document.getElementById("led") as HTMLSpanElement;
const logs = document.getElementById("logs") as HTMLDivElement;

const appendLog = (line: string): void => {
  const p = document.createElement("p");
  p.className = "line";
  p.textContent = line;
  logs.prepend(p);
};

const setOnlineStatus = (online: boolean): void => {
  statusText.textContent = online ? "Online" : "Offline";
  led.classList.toggle("online", online);
};

startBtn.addEventListener("click", async () => {
  await window.apiDesktopBridge.startApi();
});

stopBtn.addEventListener("click", async () => {
  await window.apiDesktopBridge.stopApi();
});

window.apiDesktopBridge.onStatus((online) => {
  setOnlineStatus(online);
});

window.apiDesktopBridge.onLog((line) => {
  appendLog(line);
});

void window.apiDesktopBridge.getStatus().then((online) => {
  setOnlineStatus(online);
});

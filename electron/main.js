const { app, BrowserWindow } = require("electron");
const path = require("path");
const { startDesktopBridge } = require("./desktop-bridge");

const APP_NAME = "Ebitabo POS";
const APP_ID = "com.ebitabo.desktop";
const DEFAULT_DESKTOP_BRIDGE_PORT = 39200;
const isDev = process.env.NODE_ENV === "development";
const apiProxyTarget = (process.env.EBITABO_API_PROXY_TARGET || "").trim();
const desktopBridgePort = resolveDesktopBridgePort(
  process.env.EBITABO_DESKTOP_PORT,
);

let mainWindow;
let desktopBridge;
let isQuitting = false;

app.setName(APP_NAME);
if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
}

function getWindowIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "assets/icon.ico");
  }
  return path.join(__dirname, "../build/icon.ico");
}

function resolveDesktopBridgePort(rawValue) {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) {
    return parsed;
  }
  return DEFAULT_DESKTOP_BRIDGE_PORT;
}

async function createWindow() {
  const windowOptions = {
    width: 1200,
    height: 800,
    title: APP_NAME,
    icon: getWindowIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  mainWindow = new BrowserWindow(windowOptions);

  if (isDev) {
    await mainWindow.loadURL("http://localhost:3000");
  } else {
    const staticDir = path.join(__dirname, "../out");
    desktopBridge = await startDesktopBridge({
      staticDir,
      apiProxyTarget,
      port: desktopBridgePort,
    });
    await mainWindow.loadURL(desktopBridge.url);
  }
}

async function closeDesktopBridge() {
  if (!desktopBridge) return;

  try {
    await desktopBridge.close();
  } catch (error) {
    console.error("Failed to close desktop bridge cleanly", error);
  } finally {
    desktopBridge = undefined;
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (isQuitting || !desktopBridge) return;

  event.preventDefault();
  isQuitting = true;

  void closeDesktopBridge().finally(() => {
    app.quit();
  });
});

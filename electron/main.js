const { app, BrowserWindow } = require("electron");
const path = require("path");
const { startDesktopBridge } = require("./desktop-bridge");

const APP_NAME = "Ebitabo POS";
const APP_ID = "com.ebitabo.desktop";
const isDev = process.env.NODE_ENV === "development";
const apiProxyTarget = (process.env.EBITABO_API_PROXY_TARGET || "").trim();

let mainWindow;
let desktopBridge;

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
    desktopBridge = await startDesktopBridge({ staticDir, apiProxyTarget });
    await mainWindow.loadURL(desktopBridge.url);
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  if (desktopBridge) {
    await desktopBridge.close();
  }
});

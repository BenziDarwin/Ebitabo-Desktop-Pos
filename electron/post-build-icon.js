const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const exePath = path.resolve(__dirname, "../dist/win-unpacked/EbtaboPOS.exe");
const iconPath = path.resolve(__dirname, "../icon.ico");

if (!fs.existsSync(exePath) || !fs.existsSync(iconPath)) {
  process.exit(0);
}

const winCodeSignBase = path.join(
  process.env.LOCALAPPDATA || "",
  "electron-builder/Cache/winCodeSign",
);

let rceditPath = null;
if (fs.existsSync(winCodeSignBase)) {
  for (const entry of fs.readdirSync(winCodeSignBase)) {
    const candidate = path.join(winCodeSignBase, entry, "rcedit-x64.exe");
    if (fs.existsSync(candidate)) {
      rceditPath = candidate;
      break;
    }
  }
}

if (rceditPath) {
  try {
    console.log(`Setting executable icon on ${exePath}...`);
    execFileSync(rceditPath, [exePath, "--set-icon", iconPath]);
    console.log("Executable icon successfully set!");
  } catch (err) {
    console.warn("Failed to set icon via rcedit:", err.message);
  }
}

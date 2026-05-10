export function isElectronRenderer(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /Electron/i.test(navigator.userAgent);
}

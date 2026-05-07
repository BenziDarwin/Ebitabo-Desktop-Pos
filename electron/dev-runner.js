const { spawn } = require("child_process");

const env = { ...process.env, NODE_ENV: "development" };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(require("electron"), ["."], {
  stdio: "inherit",
  env,
  windowsHide: false,
});

child.on("error", (error) => {
  console.error("Failed to start Electron:", error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

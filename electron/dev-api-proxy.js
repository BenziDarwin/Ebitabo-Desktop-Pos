const http = require("node:http");
const { proxyToBackend } = require("./desktop-bridge");

const port = Number(process.env.EBITABO_DEV_PROXY_PORT || 3001);
const apiProxyTarget = process.env.EBITABO_API_PROXY_TARGET || "";

const server = http.createServer((req, res) => {
  proxyToBackend(req, res, apiProxyTarget);
});

server.on("error", (err) => {
  console.error("[dev-api-proxy] Server error:", err.message);
  process.exitCode = 1;
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[dev-api-proxy] Listening on http://127.0.0.1:${port}`);
});

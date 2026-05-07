const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function getContentType(filePath) {
  return (
    CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
    "application/octet-stream"
  );
}

function writeJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}

function safeJoin(rootDir, requestPath) {
  const relativePath = path
    .normalize(requestPath)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const joined = path.join(rootDir, relativePath);
  const rootPath = path.resolve(rootDir);
  const resolved = path.resolve(joined);
  if (resolved !== rootPath && !resolved.startsWith(`${rootPath}${path.sep}`)) {
    return null;
  }
  return resolved;
}

async function pathExists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function serveStatic(req, res, staticDir) {
  const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
  let pathname = decodeURIComponent(requestUrl.pathname || "/");
  if (pathname === "/") {
    pathname = "/index.html";
  } else if (pathname.endsWith("/")) {
    pathname = `${pathname}index.html`;
  }

  let filePath = safeJoin(staticDir, pathname);
  if (!filePath) {
    writeJson(res, 400, { error: "Invalid path" });
    return;
  }

  if (!(await pathExists(filePath))) {
    if (!path.extname(pathname)) {
      filePath = path.join(staticDir, "index.html");
    } else {
      writeJson(res, 404, { error: "Not found" });
      return;
    }
  }

  res.writeHead(200, { "Content-Type": getContentType(filePath) });
  const fileStream = fs.createReadStream(filePath);
  fileStream.on("error", () => {
    if (!res.headersSent) {
      writeJson(res, 500, { error: "Failed to read static file" });
      return;
    }
    res.destroy();
  });
  fileStream.pipe(res);
}

function proxyToBackend(req, res, apiProxyTarget) {
  if (!apiProxyTarget) {
    writeJson(res, 503, {
      error: "API proxy target is not configured",
      hint: "Set EBITABO_API_PROXY_TARGET to enable /api forwarding.",
    });
    return;
  }

  const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
  const upstreamUrl = new URL(
    `${requestUrl.pathname}${requestUrl.search}`,
    apiProxyTarget,
  );
  const transport = upstreamUrl.protocol === "https:" ? https : http;

  const headers = { ...req.headers };
  headers.host = upstreamUrl.host;
  headers["x-forwarded-host"] = req.headers.host || "";
  headers["x-forwarded-proto"] = "http";

  const upstreamReq = transport.request(
    {
      protocol: upstreamUrl.protocol,
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port || undefined,
      path: `${upstreamUrl.pathname}${upstreamUrl.search}`,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      const responseHeaders = { ...upstreamRes.headers };
      res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
      upstreamRes.pipe(res);
    },
  );

  upstreamReq.on("error", (error) => {
    writeJson(res, 502, {
      error: "Failed to reach API upstream",
      details: error.message,
      target: apiProxyTarget,
    });
  });

  req.pipe(upstreamReq);
}

function startDesktopBridge({ staticDir, apiProxyTarget, host = "127.0.0.1" }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = requestUrl.pathname || "/";
      const isApiRoute = pathname === "/api" || pathname.startsWith("/api/");

      if (isApiRoute) {
        proxyToBackend(req, res, apiProxyTarget);
        return;
      }

      void serveStatic(req, res, staticDir);
    });

    server.on("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve desktop bridge address"));
        return;
      }

      resolve({
        close: () =>
          new Promise((closeResolve) => {
            server.close(() => closeResolve());
          }),
        url: `http://${host}:${address.port}`,
      });
    });
  });
}

module.exports = {
  startDesktopBridge,
};

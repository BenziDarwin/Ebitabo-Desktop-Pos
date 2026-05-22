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

function tryWriteJson(res, statusCode, body) {
  if (res.destroyed || res.writableEnded) {
    return false;
  }
  if (res.headersSent) {
    return false;
  }

  writeJson(res, statusCode, body);
  return true;
}

function getHeaderValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function normalizeProxyTarget(target) {
  if (!target || typeof target !== "string") return "";
  const trimmed = target.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function normalizePathname(pathname) {
  const normalized = pathname || "/";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function trimTrailingSlash(pathname) {
  const normalized = normalizePathname(pathname);
  if (normalized === "/") return "";
  return normalized.replace(/\/+$/, "");
}

function resolveUpstreamUrl(resolvedTarget, forwardedPath, upstreamSearch) {
  const baseUrl = new URL(resolvedTarget);
  const normalizedForwardedPath = normalizePathname(forwardedPath);
  const basePath = trimTrailingSlash(baseUrl.pathname);

  let resolvedPath = normalizedForwardedPath;
  if (
    basePath &&
    normalizedForwardedPath !== "/" &&
    normalizedForwardedPath !== basePath &&
    !normalizedForwardedPath.startsWith(`${basePath}/`)
  ) {
    resolvedPath = `${basePath}${normalizedForwardedPath}`;
  }

  const requestUrl = new URL(baseUrl.origin);
  requestUrl.pathname = resolvedPath;
  requestUrl.search = upstreamSearch ? `?${upstreamSearch}` : "";
  return requestUrl;
}

function sanitizeForwardHeaders(rawHeaders, upstreamHost, originalHost) {
  const headers = { ...rawHeaders };

  const hopByHopHeaders = [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "proxy-connection",
  ];

  for (const header of hopByHopHeaders) {
    delete headers[header];
  }

  // These headers can trigger strict upstream policy checks for local desktop origins.
  delete headers.origin;
  delete headers.referer;

  // Client target hint is consumed by the bridge and should not be forwarded upstream.
  delete headers["x-ebitabo-client-url"];

  headers.host = upstreamHost;
  headers["x-forwarded-host"] = originalHost || "";
  headers["x-forwarded-proto"] = "http";

  return headers;
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
  const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
  const queryTarget = normalizeProxyTarget(
    requestUrl.searchParams.get("target"),
  );
  const headerTarget = normalizeProxyTarget(
    getHeaderValue(req.headers["x-ebitabo-client-url"]),
  );
  const resolvedTarget =
    headerTarget || queryTarget || normalizeProxyTarget(apiProxyTarget);

  if (!resolvedTarget) {
    tryWriteJson(res, 503, {
      error: "API proxy target is not configured",
      hint: "Set EBITABO_API_PROXY_TARGET to enable /api forwarding.",
    });
    return;
  }

  const upstreamQuery = new URLSearchParams(requestUrl.searchParams);
  upstreamQuery.delete("target");
  const upstreamSearch = upstreamQuery.toString();

  const forwardedPath =
    requestUrl.pathname === "/api"
      ? "/"
      : requestUrl.pathname.replace(/^\/api(?=\/)/, "");
  const normalizedForwardedPath =
    forwardedPath === "/ebtabo_api" ? "/ebtabo_api/" : forwardedPath;
  const upstreamUrl = resolveUpstreamUrl(
    resolvedTarget,
    normalizedForwardedPath,
    upstreamSearch,
  );
  const transport = upstreamUrl.protocol === "https:" ? https : http;

  const headers = sanitizeForwardHeaders(
    req.headers,
    upstreamUrl.host,
    req.headers.host,
  );

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
    console.error("Desktop bridge upstream request failed", {
      message: error.message,
      code: error.code,
      target: resolvedTarget,
      path: `${upstreamUrl.pathname}${upstreamUrl.search}`,
    });
    const wroteError = tryWriteJson(res, 502, {
      error: "Failed to reach API upstream",
      details: error.message,
      code: error.code || null,
      target: resolvedTarget,
    });

    if (!wroteError && !res.destroyed && !res.writableEnded) {
      res.destroy();
    }
  });

  req.pipe(upstreamReq);
}

function startDesktopBridge({
  staticDir,
  apiProxyTarget,
  host = "127.0.0.1",
  port = 0,
}) {
  const listenPort =
    Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 0;

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

    server.on("error", (error) => {
      if (listenPort > 0 && error && error.code === "EADDRINUSE") {
        reject(
          new Error(
            `Desktop bridge port ${listenPort} is already in use. ` +
              "Close the conflicting app or set EBITABO_DESKTOP_PORT to a free port.",
          ),
        );
        return;
      }
      reject(error);
    });

    server.listen(listenPort, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve desktop bridge address"));
        return;
      }

      resolve({
        close: (timeoutMs = 4000) =>
          new Promise((closeResolve) => {
            let settled = false;

            const finish = () => {
              if (settled) return;
              settled = true;
              closeResolve();
            };

            const timeout = setTimeout(() => {
              if (typeof server.closeIdleConnections === "function") {
                server.closeIdleConnections();
              }
              if (typeof server.closeAllConnections === "function") {
                server.closeAllConnections();
              }
              finish();
            }, timeoutMs);

            if (typeof timeout.unref === "function") {
              timeout.unref();
            }

            server.close(() => {
              clearTimeout(timeout);
              finish();
            });
          }),
        url: `http://${host}:${address.port}`,
      });
    });
  });
}

module.exports = {
  startDesktopBridge,
};

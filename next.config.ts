import path from "node:path";
import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

function normalizeProxyTarget(target?: string): string {
  const trimmed = target?.trim() ?? "";
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }
  return `https://${trimmed.replace(/\/+$/, "")}`;
}

const apiProxyTarget = normalizeProxyTarget(
  process.env.EBITABO_API_PROXY_TARGET,
);

const nextConfig: NextConfig = {
  // Keep static export for packaged Electron, but allow runtime proxy features in dev.
  output: isProduction ? "export" : undefined,
  assetPrefix: isProduction ? "./" : undefined,
  env: {
    NEXT_PUBLIC_EBITABO_API_PROXY_TARGET: apiProxyTarget,
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    unoptimized: true,
  },
};

function getHeaderBasedApiRewrites() {
  return [
    {
      source: "/api/ebtabo_api",
      has: [
        {
          type: "header" as const,
          key: "x-ebitabo-client-url",
          value: "https://(?<target>[^\\s]+)",
        },
      ],
      destination: "https://:target/ebtabo_api/",
    },
    {
      source: "/api/ebtabo_api",
      has: [
        {
          type: "header" as const,
          key: "x-ebitabo-client-url",
          value: "http://(?<target>[^\\s]+)",
        },
      ],
      destination: "http://:target/ebtabo_api/",
    },
    {
      source: "/api/:path*",
      has: [
        {
          type: "header" as const,
          key: "x-ebitabo-client-url",
          value: "https://(?<target>[^\\s]+)",
        },
      ],
      destination: "https://:target/:path*",
    },
    {
      source: "/api/:path*",
      has: [
        {
          type: "header" as const,
          key: "x-ebitabo-client-url",
          value: "http://(?<target>[^\\s]+)",
        },
      ],
      destination: "http://:target/:path*",
    },
    {
      source: "/api/:path*",
      has: [
        {
          type: "query" as const,
          key: "target",
          value: "https://(?<target>[^\\s&]+)",
        },
      ],
      destination: "https://:target/:path*",
    },
    {
      source: "/api/:path*",
      has: [
        {
          type: "query" as const,
          key: "target",
          value: "http://(?<target>[^\\s&]+)",
        },
      ],
      destination: "http://:target/:path*",
    },
  ];
}

const devApiProxyPort = Number(process.env.EBITABO_DEV_PROXY_PORT || 3001);

if (!isProduction) {
  nextConfig.rewrites = async () => [
    {
      source: "/api/:path*",
      destination: `http://127.0.0.1:${devApiProxyPort}/api/:path*`,
    },
  ];
}

export default nextConfig;

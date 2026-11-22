import { isElectronRenderer } from "@/lib/runtime";
import { toProxyPath } from "@/services/repositories/proxy-path";

function ensureLeadingSlash(path: string): string {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function normalizeClientUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

export function buildRemoteEndpointUrl(
  clientUrl: string,
  path: string,
  query?: string,
): string {
  const normalizedClientUrl = normalizeClientUrl(clientUrl);
  const normalizedPath = ensureLeadingSlash(path);
  const normalizedQuery = query
    ? query.startsWith("?")
      ? query.slice(1)
      : query
    : "";

  const isBrowserLocal =
    typeof window !== "undefined" &&
    (window.location.origin.includes("localhost") ||
      window.location.origin.includes("127.0.0.1"));

  if (isElectronRenderer() || isBrowserLocal) {
    const queryParts = new URLSearchParams(normalizedQuery);
    if (normalizedClientUrl) {
      queryParts.set("target", normalizedClientUrl);
    }
    return toProxyPath(normalizedPath, queryParts.toString() || undefined);
  }

  return `${normalizedClientUrl}${normalizedPath}${
    normalizedQuery ? `?${normalizedQuery}` : ""
  }`;
}

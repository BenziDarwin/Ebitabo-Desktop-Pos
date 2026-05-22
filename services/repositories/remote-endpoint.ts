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

  if (isElectronRenderer()) {
    const queryParts = new URLSearchParams(normalizedQuery);
    queryParts.set("target", normalizedClientUrl);
    return toProxyPath(normalizedPath, queryParts.toString() || undefined);
  }

  return `${normalizedClientUrl}${normalizedPath}${
    normalizedQuery ? `?${normalizedQuery}` : ""
  }`;
}

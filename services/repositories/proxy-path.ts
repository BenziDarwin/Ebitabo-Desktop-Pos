function ensureLeadingSlash(path: string): string {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function toProxyPath(path: string, query?: string): string {
  const normalizedPath = ensureLeadingSlash(path);
  if (!query) {
    return `/api${normalizedPath}`;
  }

  const normalizedQuery = query.startsWith("?") ? query : `?${query}`;
  return `/api${normalizedPath}${normalizedQuery}`;
}

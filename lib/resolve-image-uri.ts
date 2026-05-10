function inferMimeTypeFromBase64(value: string): string {
  if (value.startsWith("/9j/")) return "image/jpeg";
  if (value.startsWith("iVBORw0KGgo")) return "image/png";
  if (value.startsWith("R0lGOD")) return "image/gif";
  if (value.startsWith("UklGR")) return "image/webp";
  if (value.startsWith("PHN2Zy") || value.startsWith("PD94bWwg")) {
    return "image/svg+xml";
  }

  return "image/png";
}

function stripWrapperQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  if (trimmed.startsWith("b'") && trimmed.endsWith("'")) {
    return trimmed.slice(2, -1).trim();
  }
  if (trimmed.startsWith('b"') && trimmed.endsWith('"')) {
    return trimmed.slice(2, -1).trim();
  }
  return trimmed;
}

function normalizeBaseUrl(baseUrl?: string): string | null {
  const trimmed = baseUrl?.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function looksLikeRelativeImagePath(value: string): boolean {
  if (!value) return false;
  const lowered = value.toLowerCase();
  if (value.startsWith("/")) return !hasKnownBase64ImagePrefix(value);
  return (
    lowered.startsWith("web/") ||
    lowered.startsWith("images/") ||
    lowered.startsWith("image/") ||
    lowered.startsWith("api/") ||
    lowered.startsWith("static/")
  );
}

function hasKnownBase64ImagePrefix(value: string): boolean {
  return (
    value.startsWith("/9j/") ||
    value.startsWith("iVBORw0KGgo") ||
    value.startsWith("R0lGOD") ||
    value.startsWith("UklGR") ||
    value.startsWith("PHN2Zy") ||
    value.startsWith("PD94bWwg")
  );
}

function normalizeBase64Payload(value: string): string {
  return value
    .replace(/[\s\r\n\t]/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
}

function isLikelyBase64Image(value: string): boolean {
  if (value.includes("://")) return false;
  if (value.includes("?") || value.includes("&") || value.includes("%"))
    return false;
  if (looksLikeRelativeImagePath(value)) return false;

  const normalized = normalizeBase64Payload(value);
  if (normalized.length < 24) return false;
  if (hasKnownBase64ImagePrefix(normalized)) return true;
  if (!/^[A-Za-z0-9+/=]+$/.test(normalized)) return false;
  return true;
}

interface ResolveImageUriOptions {
  baseUrl?: string;
  fallbackUri?: string;
}

export function resolveImageUri(
  rawValue?: string,
  options: ResolveImageUriOptions = {},
): string | undefined {
  const value = rawValue ? stripWrapperQuotes(rawValue) : undefined;

  if (!value) {
    return options.fallbackUri;
  }

  const lowered = value.toLowerCase();
  if (lowered === "null" || lowered === "undefined" || lowered === "false") {
    return options.fallbackUri;
  }

  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("file://") ||
    value.startsWith("content://") ||
    value.startsWith("data:")
  ) {
    return value;
  }

  if (value.toLowerCase().startsWith("base64,")) {
    const base64Part = normalizeBase64Payload(value.slice("base64,".length));
    return `data:${inferMimeTypeFromBase64(base64Part)};base64,${base64Part}`;
  }

  if (isLikelyBase64Image(value)) {
    const compactValue = normalizeBase64Payload(value);
    return `data:${inferMimeTypeFromBase64(compactValue)};base64,${compactValue}`;
  }

  if (looksLikeRelativeImagePath(value)) {
    const normalizedBaseUrl = normalizeBaseUrl(options.baseUrl);
    if (!normalizedBaseUrl) {
      return value.startsWith("/") ? value : `/${value}`;
    }
    return value.startsWith("/")
      ? `${normalizedBaseUrl}${value}`
      : `${normalizedBaseUrl}/${value}`;
  }

  return options.fallbackUri;
}

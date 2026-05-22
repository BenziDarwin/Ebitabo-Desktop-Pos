import type { AuthSession, LoginCredentials, User } from "@/core/entities";
import type { AuthRepository } from "@/core/repositories";
import {
  buildRemoteEndpointUrl,
  normalizeClientUrl,
} from "@/services/repositories/remote-endpoint";

function isHtmlResponse(text: string): boolean {
  return /^<!doctype html>|^<html/i.test(text.trim());
}

export class RemoteAuthRepository implements AuthRepository {
  async authenticate(
    credentials: LoginCredentials,
  ): Promise<AuthSession | null> {
    const clientUrl = normalizeClientUrl(credentials.url);
    if (!clientUrl) return null;

    let response: Response;
    const endpointUrl = buildRemoteEndpointUrl(clientUrl, "/ebtabo_api/");
    try {
      response = await fetch(endpointUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          usr: credentials.username.trim(),
          pss: credentials.password,
          "x-ebitabo-client-url": clientUrl,
        },
      });
    } catch {
      return null;
    }

    const raw = await response.text();
    const trimmed = raw.trim();

    if (!response.ok || !trimmed || isHtmlResponse(trimmed)) {
      return null;
    }

    const looksInvalid = /wrong login/i.test(trimmed);
    if (looksInvalid) {
      return null;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return null;
    }

    const status = String(parsed.Status ?? "");
    const apiKey = String(parsed["api-key"] ?? parsed.api_key ?? "");
    if (status.toLowerCase() !== "auth successful" || !apiKey) {
      return null;
    }

    const userIdValue =
      parsed.User_ID ??
      parsed.userID ??
      parsed.userId ??
      parsed.user_id ??
      parsed.id;
    const userId = String(
      userIdValue === undefined || userIdValue === null
        ? credentials.username.trim()
        : userIdValue,
    );

    const user: User = {
      id: userId,
      username: credentials.username.trim(),
      name:
        typeof parsed.name === "string"
          ? parsed.name
          : credentials.username.trim(),
      url: clientUrl,
      email: typeof parsed.email === "string" ? parsed.email : undefined,
      role: typeof parsed.role === "string" ? parsed.role : undefined,
    };

    return {
      apiKey,
      userId,
      clientUrl,
      user,
      cookies:
        typeof parsed.cookies === "string"
          ? parsed.cookies
          : typeof parsed.auth_cookies === "string"
            ? parsed.auth_cookies
            : undefined,
    };
  }
}

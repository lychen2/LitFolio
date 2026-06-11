export type WebDavUrlSecurityKind =
  | "empty"
  | "https"
  | "localHttp"
  | "remoteHttp"
  | "invalid";

export interface WebDavUrlSecurity {
  kind: WebDavUrlSecurityKind;
  blocking: boolean;
}

export function webDavUrlSecurity(value: string): WebDavUrlSecurity {
  const trimmed = value.trim();
  if (!trimmed) return { kind: "empty", blocking: false };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { kind: "invalid", blocking: true };
  }

  if (url.protocol === "https:") return { kind: "https", blocking: false };
  if (url.protocol !== "http:") return { kind: "invalid", blocking: true };
  if (isLocalDebugHost(url.hostname)) return { kind: "localHttp", blocking: false };
  return { kind: "remoteHttp", blocking: true };
}

function isLocalDebugHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]" || normalized === "::1";
}

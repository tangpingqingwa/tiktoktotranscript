/** TikTok video snowflake ids are 19 decimal digits. */
export const VIDEO_ID_PATTERN = /^\d{19}$/;

export type ParseUrlResult =
  | { type: "id"; videoId: string }
  | { type: "short_link"; url: string }
  | { type: "empty" }
  | { type: "invalid" }
  | { type: "unsupported" };

const BLOCKED_SCHEME = /^(javascript|data|vbscript|file):/i;
const SCHEMELESS_TIKTOK_HOST = /^(?:www\.|m\.|vm\.|vt\.)?tiktok\.com$/i;

export function isVideoId(value: string): boolean {
  return VIDEO_ID_PATTERN.test(value);
}

export function resultPath(videoId: string): `/t/${string}` {
  return `/t/${videoId}`;
}

export function parseUrl(raw: string): ParseUrlResult {
  const input = raw.trim();
  if (input === "") {
    return { type: "empty" };
  }

  const bare = input.replace(/\/+$/, "");
  if (isVideoId(bare)) {
    return { type: "id", videoId: bare };
  }

  if (BLOCKED_SCHEME.test(input)) {
    return { type: "invalid" };
  }

  const url = coerceHttpUrl(input);
  if (!url) {
    return { type: "invalid" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { type: "invalid" };
  }

  if (!isTikTokHost(url.hostname)) {
    return { type: "unsupported" };
  }

  const videoId = extractVideoId(url);
  if (videoId) {
    return { type: "id", videoId };
  }

  if (isShortLink(url)) {
    return { type: "short_link", url: url.href };
  }

  return { type: "invalid" };
}

function isTikTokHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "tiktok.com" || host.endsWith(".tiktok.com");
}

function coerceHttpUrl(input: string): URL | null {
  if (input.startsWith("//")) {
    const host = hostPrefix(input.slice(2));
    if (SCHEMELESS_TIKTOK_HOST.test(host)) {
      return parseAbsoluteUrl(`https:${input}`);
    }
    return null;
  }

  const direct = parseAbsoluteUrl(input);
  if (direct) {
    return direct;
  }

  // Paste without a scheme: www.tiktok.com/@user/video/…
  if (SCHEMELESS_TIKTOK_HOST.test(hostPrefix(input))) {
    return parseAbsoluteUrl(`https://${input}`);
  }

  return null;
}

function parseAbsoluteUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function hostPrefix(input: string): string {
  const slash = input.indexOf("/");
  return slash === -1 ? input : input.slice(0, slash);
}

function extractVideoId(url: URL): string | null {
  const segments = url.pathname.split("/").filter(Boolean);

  for (let i = 0; i < segments.length - 1; i++) {
    const part = segments[i];
    const next = segments[i + 1];
    if (
      part !== undefined &&
      next !== undefined &&
      part.toLowerCase() === "video" &&
      isVideoId(next)
    ) {
      return next;
    }
  }

  return null;
}

function isShortLink(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 1) {
    return false;
  }
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
    return true;
  }
  return segments[0]?.toLowerCase() === "t";
}

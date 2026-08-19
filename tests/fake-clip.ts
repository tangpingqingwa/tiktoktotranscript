import http from "node:http";
import type { AddressInfo } from "node:net";
import type { ClipCue, ClipTranscript } from "../src/clipClient.js";

/** 19-digit fixtures used by pages.test.ts against this server only. */
export const SUCCESS_ID = "1234567890123456789";
export const SLIDESHOW_ID = "2234567890123456789";
export const NO_TRANSCRIPT_ID = "3234567890123456789";
export const NOT_FOUND_ID = "4234567890123456789";
export const CLIP_DOWN_ID = "5234567890123456789";
export const FLAKY_ID = "6234567890123456789";

export const SUCCESS_SHORT = "https://vm.tiktok.com/ZMxxxx/";
export const SUCCESS_SHORT_WWW = "https://www.tiktok.com/t/ZTxxxx/";

export const SUCCESS_CUES: ClipCue[] = [
  {
    text: "Welcome to today's lecture on photosynthesis.",
    start: 0,
    duration: 3.5,
  },
  {
    text: "Chlorophyll absorbs red and blue light.",
    start: 3.5,
    duration: 4,
  },
];

export const SLIDESHOW_CUES: ClipCue[] = [
  { text: "Boil water and salt it well.", start: 0, duration: 2 },
  { text: "Add pasta and cook until al dente.", start: 2, duration: 2 },
];

export const SUCCESS_DESCRIPTION =
  "Lecture notes on photosynthesis and why leaves look green";
export const SLIDESHOW_DESCRIPTION = "Recipe cards for weeknight pasta";

export const SUCCESS_CUES_ES: ClipCue[] = [
  {
    text: "Bienvenidos a la lección de fotosíntesis de hoy.",
    start: 0,
    duration: 3.5,
  },
  {
    text: "La clorofila absorbe luz roja y azul.",
    start: 3.5,
    duration: 4,
  },
];

function transcriptForLang(lang: string): Partial<ClipTranscript> {
  const normalized = lang.trim().toLowerCase() || "en";
  if (normalized === "es") {
    return { language: "es", transcript: SUCCESS_CUES_ES };
  }
  return { language: normalized };
}

export function successTranscript(
  videoId = SUCCESS_ID,
  overrides: Partial<ClipTranscript> = {},
): ClipTranscript {
  return {
    platform: "tiktok",
    videoId,
    canonicalUrl: `https://www.tiktok.com/@bioteacher/video/${videoId}`,
    kind: "video",
    language: "en",
    durationMs: 12_000,
    author: { handle: "bioteacher", id: "user_bio" },
    metadata: {
      description: SUCCESS_DESCRIPTION,
      createTime: "2024-01-15T12:00:00.000Z",
      musicTitle: null,
    },
    source: "platform_caption",
    transcript: SUCCESS_CUES,
    ...overrides,
  };
}

export function slideshowTranscript(
  videoId = SLIDESHOW_ID,
): ClipTranscript {
  return successTranscript(videoId, {
    canonicalUrl: `https://www.tiktok.com/@slidesuser/video/${videoId}`,
    kind: "slideshow",
    durationMs: 8_000,
    author: { handle: "slidesuser", id: "user_slides" },
    metadata: {
      description: SLIDESHOW_DESCRIPTION,
      createTime: "2024-02-01T08:00:00.000Z",
      musicTitle: null,
    },
    source: "on_screen",
    transcript: SLIDESHOW_CUES,
  });
}

export type FakeClipServer = {
  base: string;
  close: () => Promise<void>;
};

export function createFakeClipServer(): http.Server {
  const flakyAttempts = new Map<string, number>();
  return http.createServer((req, res) => {
    const host = req.headers.host ?? "127.0.0.1";
    const url = new URL(req.url ?? "/", `http://${host}`);

    if (req.method !== "GET" || url.pathname !== "/v1/transcript") {
      sendJson(res, 404, errorBody("not_found", "Unknown route."));
      return;
    }

    const videoId = url.searchParams.get("video_id") ?? "";
    const rawUrl = url.searchParams.get("url") ?? "";
    const lang = url.searchParams.get("lang") ?? "en";
    const resolved = resolveFixture(videoId, rawUrl);

    if (resolved === "down") {
      sendJson(
        res,
        503,
        errorBody("upstream_blocked", "Upstream temporarily unavailable.", true),
      );
      return;
    }
    if (resolved === "missing") {
      sendJson(res, 404, errorBody("not_found", "Video deleted or private."));
      return;
    }
    if (resolved === "empty") {
      sendJson(
        res,
        422,
        errorBody("no_transcript", "This video has no public caption track."),
      );
      return;
    }
    if (resolved === "flaky") {
      const n = (flakyAttempts.get(FLAKY_ID) ?? 0) + 1;
      flakyAttempts.set(FLAKY_ID, n);
      if (n === 1) {
        sendJson(
          res,
          503,
          errorBody("upstream_blocked", "Upstream temporarily unavailable.", true),
        );
        return;
      }
      sendJson(res, 200, okBody(successTranscript(FLAKY_ID)));
      return;
    }
    if (resolved === "slideshow") {
      sendJson(res, 200, okBody(slideshowTranscript()));
      return;
    }
    if (resolved === "success") {
      const id = videoId && /^\d{19}$/.test(videoId) ? videoId : SUCCESS_ID;
      sendJson(res, 200, okBody(successTranscript(id, transcriptForLang(lang))));
      return;
    }

    sendJson(res, 404, errorBody("not_found", "Video deleted or private."));
  });
}

export async function startFakeClip(): Promise<FakeClipServer> {
  const server = createFakeClipServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const addr = server.address() as AddressInfo | null;
  if (!addr) {
    throw new Error("fake ClipAPI failed to listen");
  }
  return {
    base: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function resolveFixture(
  videoId: string,
  rawUrl: string,
): "success" | "slideshow" | "empty" | "missing" | "down" | "flaky" | "unknown" {
  if (videoId === SUCCESS_ID || isSuccessShort(rawUrl)) {
    return "success";
  }
  if (videoId === SLIDESHOW_ID) {
    return "slideshow";
  }
  if (videoId === NO_TRANSCRIPT_ID) {
    return "empty";
  }
  if (videoId === NOT_FOUND_ID) {
    return "missing";
  }
  if (videoId === CLIP_DOWN_ID) {
    return "down";
  }
  if (videoId === FLAKY_ID) {
    return "flaky";
  }

  const fromUrl = extractVideoId(rawUrl);
  if (fromUrl) {
    return resolveFixture(fromUrl, "");
  }
  if (rawUrl) {
    return "unknown";
  }
  return "unknown";
}

function isSuccessShort(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  const parts = parsed.pathname.split("/").filter(Boolean);
  const code = parts[0]?.toLowerCase() === "t" ? parts[1] : parts[0];
  if (!code) {
    return false;
  }
  const token = code.toLowerCase();
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
    return token === "zmxxxx";
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    return parts[0]?.toLowerCase() === "t" && token === "ztxxxx";
  }
  return false;
}

function extractVideoId(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  const parts = parsed.pathname.split("/").filter(Boolean);
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i]?.toLowerCase() === "video" && /^\d{19}$/.test(parts[i + 1] ?? "")) {
      return parts[i + 1] ?? null;
    }
  }
  return null;
}

function okBody(data: ClipTranscript) {
  return {
    data,
    meta: {
      cached: false,
      creditsCharged: 1,
      requestId: "req_fake",
      upstreamMs: 1,
    },
  };
}

function errorBody(code: string, message: string, retryable = false) {
  return {
    error: { code, message, retryable },
    meta: { creditsCharged: 0, requestId: "req_fake" },
  };
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

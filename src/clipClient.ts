export type ClipCue = {
  text: string;
  start: number;
  duration: number | null;
};

export type ClipTranscript = {
  platform: "tiktok" | "reels" | "shorts";
  videoId: string;
  canonicalUrl: string;
  kind: "video" | "slideshow" | "unknown";
  language: string;
  durationMs: number | null;
  author: { handle: string | null; id: string | null };
  metadata: {
    description: string | null;
    createTime: string | null;
    musicTitle: string | null;
  };
  source: "platform_caption" | "platform_asr" | "on_screen";
  transcript: ClipCue[];
};

export type GetTranscriptOpts = {
  url?: string;
  videoId?: string;
  lang?: string;
};

export type GetTranscriptOk = {
  ok: true;
  data: ClipTranscript;
  cached: boolean;
};

export type GetTranscriptErr = {
  ok: false;
  code: string;
  http: number;
};

export type GetTranscriptResult = GetTranscriptOk | GetTranscriptErr;

export type ClipClient = {
  getTranscript: (opts: GetTranscriptOpts) => Promise<GetTranscriptResult>;
};

export type ClipClientConfig = {
  base?: string;
  key?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export const DEFAULT_CLIPAPI_BASE = "https://api.clipapi.dev";
export const CLIP_TIMEOUT_MS = 8_000;

const RETRYABLE_HTTP = new Set([502, 503]);

export function createClipClient(config: ClipClientConfig = {}): ClipClient {
  const base = stripSlash(config.base ?? process.env.CLIPAPI_BASE ?? DEFAULT_CLIPAPI_BASE);
  const key = config.key ?? process.env.CLIPAPI_KEY ?? "";
  const fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = config.timeoutMs ?? CLIP_TIMEOUT_MS;
  // Live ClipAPI only with a key or an explicit test override (base/fetch).
  const allowNetwork =
    Boolean(config.fetch) || config.base !== undefined || key !== "";

  return {
    async getTranscript(opts: GetTranscriptOpts): Promise<GetTranscriptResult> {
      if (!opts.url && !opts.videoId) {
        return { ok: false, code: "invalid_request", http: 400 };
      }
      if (!allowNetwork) {
        return { ok: false, code: "clip_down", http: 503 };
      }

      let last: GetTranscriptResult = { ok: false, code: "clip_down", http: 503 };
      for (let attempt = 0; attempt < 2; attempt++) {
        last = await requestTranscript(fetchImpl, {
          base,
          key,
          timeoutMs,
          opts,
        });
        if (last.ok) {
          return last;
        }
        const retry =
          RETRYABLE_HTTP.has(last.http) || last.code === "upstream_blocked";
        if (!retry) {
          return last;
        }
      }
      return last;
    },
  };
}

async function requestTranscript(
  fetchImpl: typeof fetch,
  args: {
    base: string;
    key: string;
    timeoutMs: number;
    opts: GetTranscriptOpts;
  },
): Promise<GetTranscriptResult> {
  const query = new URLSearchParams();
  if (args.opts.url) {
    query.set("url", args.opts.url);
  }
  if (args.opts.videoId) {
    query.set("video_id", args.opts.videoId);
  }
  if (args.opts.lang) {
    query.set("lang", args.opts.lang);
  }

  const headers: Record<string, string> = { accept: "application/json" };
  if (args.key) {
    headers.authorization = `Bearer ${args.key}`;
  }

  let response: Response;
  try {
    response = await fetchImpl(`${args.base}/v1/transcript?${query}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(args.timeoutMs),
    });
  } catch {
    return { ok: false, code: "clip_down", http: 503 };
  }

  let body: unknown = null;
  const raw = await response.text();
  if (raw !== "") {
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      return {
        ok: false,
        code: response.status >= 500 ? "clip_down" : "internal",
        http: response.status || 503,
      };
    }
  }

  return parseClipResponse(response.status, body);
}

export function parseClipResponse(
  http: number,
  body: unknown,
): GetTranscriptResult {
  if (http === 200) {
    const data = record(body)?.data;
    const transcript = parseTranscript(data);
    if (!transcript) {
      return { ok: false, code: "internal", http: 502 };
    }
    if (transcript.transcript.length === 0) {
      return { ok: false, code: "no_transcript", http: 422 };
    }
    const cached = Boolean(record(record(body)?.meta)?.cached);
    return { ok: true, data: transcript, cached };
  }

  const err = record(record(body)?.error);
  const code =
    typeof err?.code === "string" && err.code !== ""
      ? err.code
      : http >= 500
        ? "clip_down"
        : "internal";
  return { ok: false, code, http };
}

function parseTranscript(value: unknown): ClipTranscript | null {
  const data = record(value);
  if (!data) {
    return null;
  }
  if (typeof data.videoId !== "string" || data.videoId === "") {
    return null;
  }
  if (!Array.isArray(data.transcript)) {
    return null;
  }

  const cues: ClipCue[] = [];
  for (const item of data.transcript) {
    const cue = record(item);
    if (!cue || typeof cue.text !== "string" || typeof cue.start !== "number") {
      return null;
    }
    cues.push({
      text: cue.text,
      start: cue.start,
      duration: typeof cue.duration === "number" ? cue.duration : null,
    });
  }

  const author = record(data.author);
  const metadata = record(data.metadata);
  const kind = data.kind;
  const source = data.source;
  const platform = data.platform;

  return {
    platform:
      platform === "reels" || platform === "shorts" || platform === "tiktok"
        ? platform
        : "tiktok",
    videoId: data.videoId,
    canonicalUrl:
      typeof data.canonicalUrl === "string" ? data.canonicalUrl : "",
    kind:
      kind === "slideshow" || kind === "video" || kind === "unknown"
        ? kind
        : "unknown",
    language: typeof data.language === "string" ? data.language : "en",
    durationMs: typeof data.durationMs === "number" ? data.durationMs : null,
    author: {
      handle: stringOrNull(author?.handle),
      id: stringOrNull(author?.id),
    },
    metadata: {
      description: stringOrNull(metadata?.description),
      createTime: stringOrNull(metadata?.createTime),
      musicTitle: stringOrNull(metadata?.musicTitle),
    },
    source:
      source === "platform_caption" ||
      source === "platform_asr" ||
      source === "on_screen"
        ? source
        : "platform_caption",
    transcript: cues,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function stripSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

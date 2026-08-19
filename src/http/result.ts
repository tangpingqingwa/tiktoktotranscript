import type { FastifyInstance, FastifyReply } from "fastify";
import type { ClipClient, ClipTranscript, GetTranscriptResult } from "../clipClient.js";
import { isVideoId } from "../parseUrl.js";
import {
  renderResult,
  type ResultLine,
  type ResultPage,
  type ResultViewModel,
} from "../views/result.js";
import type { SuccessIndex } from "./sitemap.js";

export type ResultRouteDeps = {
  clipClient: ClipClient;
  publicOrigin?: string;
  clipPublicOrigin?: string;
  successIndex?: SuccessIndex;
};

export function registerResultRoutes(
  app: FastifyInstance,
  deps: ResultRouteDeps,
): void {
  const handle = async (
    request: { params: { id: string; lang?: string }; headers: Record<string, unknown> },
    reply: FastifyReply,
    rawId: string,
    rawLang?: string,
  ): Promise<FastifyReply> => {
    const origin = requestHostOrigin(request, deps);
    const parsed =
      rawLang === undefined
        ? parseResultIdParam(rawId)
        : parseResultIdAndLang(rawId, rawLang);
    if (!parsed.ok) {
      return sendResult(reply, 400, { state: "invalid" }, deps, origin);
    }

    // Canonical default language lives at /t/:id (SPEC §9).
    if (parsed.fromLangSuffix && parsed.lang === "en") {
      return reply.redirect(`/t/${parsed.videoId}`, 302);
    }

    let result: GetTranscriptResult;
    try {
      result = await deps.clipClient.getTranscript({
        videoId: parsed.videoId,
        lang: parsed.lang,
      });
    } catch {
      return sendResult(reply, 503, { state: "clip_down" }, deps, origin);
    }

    return sendClipResult(reply, result, deps, origin, parsed.videoId, parsed.lang);
  };

  app.get<{ Params: { id: string; lang: string } }>(
    "/t/:id.:lang",
    async (request, reply) =>
      handle(request, reply, request.params.id, request.params.lang),
  );
  app.get<{ Params: { id: string } }>("/t/:id", async (request, reply) =>
    handle(request, reply, request.params.id),
  );
}

/** SPEC: GET /t/:video_id and GET /t/:video_id.:lang (BCP 47). */
export function parseResultIdParam(
  raw: string,
):
  | { ok: true; videoId: string; lang: string; fromLangSuffix: boolean }
  | { ok: false } {
  const dot = raw.indexOf(".");
  if (dot === -1) {
    return parseResultIdAndLang(raw, "en", false);
  }
  return parseResultIdAndLang(raw.slice(0, dot), raw.slice(dot + 1), true);
}

export function parseResultIdAndLang(
  videoId: string,
  langRaw: string,
  fromLangSuffix = true,
):
  | { ok: true; videoId: string; lang: string; fromLangSuffix: boolean }
  | { ok: false } {
  if (!isVideoId(videoId) || !isBcp47(langRaw)) {
    return { ok: false };
  }
  return {
    ok: true,
    videoId,
    lang: normalizeLang(langRaw),
    fromLangSuffix,
  };
}

export function isBcp47(value: string): boolean {
  return (
    value.length >= 2 &&
    value.length <= 35 &&
    /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value)
  );
}

export function normalizeLang(value: string): string {
  return value
    .split("-")
    .map((part, index) => {
      if (index === 0 || (part.length !== 2 && part.length !== 4)) {
        return part.toLowerCase();
      }
      if (part.length === 2) {
        return part.toUpperCase();
      }
      return `${part[0]!.toUpperCase()}${part.slice(1).toLowerCase()}`;
    })
    .join("-");
}

export async function resolveShortLink(
  reply: FastifyReply,
  url: string,
  deps: ResultRouteDeps,
  publicOrigin: string,
): Promise<FastifyReply> {
  let result: GetTranscriptResult;
  try {
    result = await deps.clipClient.getTranscript({ url, lang: "en" });
  } catch {
    return sendResult(reply, 503, { state: "clip_down" }, deps, publicOrigin);
  }

  if (result.ok && isVideoId(result.data.videoId)) {
    return reply.redirect(`/t/${result.data.videoId}`, 302);
  }

  return sendClipResult(reply, result, deps, publicOrigin);
}

export function sendClipResult(
  reply: FastifyReply,
  result: GetTranscriptResult,
  deps: ResultRouteDeps,
  publicOrigin: string,
  knownVideoId?: string,
  requestedLang = "en",
): FastifyReply {
  const model = viewModelFor(result, requestedLang);
  if (deps.successIndex) {
    if (model.state === "success") {
      deps.successIndex.remember(model.page.videoId);
    } else if (result.ok === false && result.code === "not_found" && knownVideoId) {
      deps.successIndex.forget(knownVideoId);
    }
  }
  return sendResult(reply, statusFor(model.state), model, deps, publicOrigin);
}

export function viewModelFor(
  result: GetTranscriptResult,
  requestedLang = "en",
): ResultViewModel {
  if (result.ok) {
    const page = toResultPage(result.data);
    page.language = requestedLang || page.language;
    return { state: "success", page };
  }
  switch (result.code) {
    case "no_transcript":
      return { state: "no_transcript" };
    case "not_found":
      return { state: "not_found" };
    case "invalid_request":
      return { state: "invalid" };
    default:
      return { state: "clip_down" };
  }
}

export function toResultPage(
  data: ClipTranscript,
  fetchedAt = new Date().toISOString(),
): ResultPage {
  const handle = data.author.handle;
  const clean = handle ? handle.replace(/^@+/, "") : null;
  return {
    videoId: data.videoId,
    canonicalUrl: data.canonicalUrl,
    authorHandle: clean,
    authorUrl: clean ? `https://www.tiktok.com/@${clean}` : null,
    description: data.metadata.description,
    durationMs: data.durationMs,
    createTime: data.metadata.createTime,
    coverUrl: null,
    language: data.language,
    kind: data.kind,
    lines: data.transcript.map(cueToLine),
    source: data.source,
    fetchedAt,
  };
}

function cueToLine(cue: ClipTranscript["transcript"][number]): ResultLine {
  const startMs = Math.round(cue.start * 1000);
  const endMs =
    cue.duration == null ? null : Math.round((cue.start + cue.duration) * 1000);
  return { startMs, endMs, text: cue.text };
}

function statusFor(state: ResultViewModel["state"]): number {
  switch (state) {
    case "success":
    case "no_transcript":
      return 200;
    case "not_found":
      return 404;
    case "invalid":
      return 400;
    case "clip_down":
      return 503;
  }
}

function sendResult(
  reply: FastifyReply,
  status: number,
  model: ResultViewModel,
  deps: ResultRouteDeps,
  publicOrigin: string,
): FastifyReply {
  const noindex = model.state !== "success";
  if (noindex) {
    reply.header("x-robots-tag", "noindex");
  }
  return reply
    .code(status)
    .type("text/html; charset=utf-8")
    .send(
      renderResult(model, {
        publicOrigin,
        clipPublicOrigin: deps.clipPublicOrigin,
      }),
    );
}

function requestHostOrigin(
  request: { headers: Record<string, unknown> },
  deps: ResultRouteDeps,
): string {
  if (deps.publicOrigin) {
    return deps.publicOrigin.replace(/\/$/, "");
  }
  const hostHeader = request.headers.host;
  const host = typeof hostHeader === "string" && hostHeader !== "" ? hostHeader : "localhost";
  const protoHeader = request.headers["x-forwarded-proto"];
  const proto = typeof protoHeader === "string" && protoHeader !== "" ? protoHeader : "http";
  return `${proto}://${host}`;
}

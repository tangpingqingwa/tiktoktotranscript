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
  app.get<{ Params: { id: string } }>("/t/:id", async (request, reply) => {
    const videoId = request.params.id;
    if (!isVideoId(videoId)) {
      return sendResult(reply, 400, { state: "invalid" }, deps, requestHostOrigin(request, deps));
    }

    let result: GetTranscriptResult;
    try {
      result = await deps.clipClient.getTranscript({ videoId, lang: "en" });
    } catch {
      return sendResult(
        reply,
        503,
        { state: "clip_down" },
        deps,
        requestHostOrigin(request, deps),
      );
    }

    return sendClipResult(
      reply,
      result,
      deps,
      requestHostOrigin(request, deps),
      videoId,
    );
  });
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
): FastifyReply {
  const model = viewModelFor(result);
  if (deps.successIndex) {
    if (model.state === "success") {
      deps.successIndex.remember(model.page.videoId);
    } else if (result.ok === false && result.code === "not_found" && knownVideoId) {
      deps.successIndex.forget(knownVideoId);
    }
  }
  return sendResult(reply, statusFor(model.state), model, deps, publicOrigin);
}

export function viewModelFor(result: GetTranscriptResult): ResultViewModel {
  if (result.ok) {
    return { state: "success", page: toResultPage(result.data) };
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

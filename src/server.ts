import path from "node:path";
import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { parseUrl, resultPath } from "./parseUrl.js";
import { renderHome } from "./views/home.js";

const DEFAULT_PORT = 3000;
export const HEALTHZ_PATH = "/healthz" as const;

const EMPTY_URL_COPY =
  "The url field was empty. Paste a TikTok link or a 19-digit video id.";
const INVALID_URL_COPY = "Use an http(s) TikTok URL or a 19-digit video id.";
const UNSUPPORTED_URL_COPY =
  "This site only accepts TikTok links and 19-digit video ids.";
const SHORT_LINK_COPY =
  "This TikTok short link is valid, but this site does not invent a video id. Paste a /@user/video/{id} URL or a 19-digit id.";

export type HealthzOk = {
  ok: true;
};

export type BuildAppOptions = {
  logger?: boolean;
};

export function parseListenPort(value = process.env.PORT): number {
  if (value === undefined || value === "") {
    return DEFAULT_PORT;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer 1-65535, got ${JSON.stringify(value)}`);
  }
  return port;
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  app.get(HEALTHZ_PATH, async (): Promise<HealthzOk> => ({ ok: true }));

  app.get<{ Querystring: { url?: string | string[] } }>("/", async (request, reply) => {
    const rawUrl = firstQueryValue(request.query.url);
    if (rawUrl === undefined) {
      return reply.type("text/html; charset=utf-8").send(renderHome());
    }

    const parsed = parseUrl(rawUrl);
    switch (parsed.type) {
      case "id":
        return reply.redirect(resultPath(parsed.videoId), 302);
      case "short_link":
        // BUILD §3: do not invent an id. ClipAPI resolution is PR 3.
        return reply
          .code(200)
          .header("x-robots-tag", "noindex")
          .type("text/html; charset=utf-8")
          .send(renderUrlNotice("Short link needs a video id", SHORT_LINK_COPY));
      case "empty":
        return reply
          .code(400)
          .header("x-robots-tag", "noindex")
          .type("text/html; charset=utf-8")
          .send(renderUrlNotice("Paste a TikTok URL", EMPTY_URL_COPY));
      case "unsupported":
        return reply
          .code(200)
          .header("x-robots-tag", "noindex")
          .type("text/html; charset=utf-8")
          .send(renderUrlNotice("Not a TikTok URL", UNSUPPORTED_URL_COPY));
      case "invalid":
        return reply
          .code(400)
          .header("x-robots-tag", "noindex")
          .type("text/html; charset=utf-8")
          .send(renderUrlNotice("Invalid URL", INVALID_URL_COPY));
    }
  });

  return app;
}

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}

function renderUrlNotice(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${title} | TikTokToTranscript</title>
</head>
<body>
  <h1>${title}</h1>
  <p>${message}</p>
  <p><a href="/">Paste another TikTok URL</a></p>
</body>
</html>
`;
}

export function isExecutedAsMain(
  metaUrl = import.meta.url,
  entry = process.argv[1],
): boolean {
  if (!entry) {
    return false;
  }
  return metaUrl === pathToFileURL(path.resolve(entry)).href;
}

if (isExecutedAsMain()) {
  const app = await buildApp({ logger: true });
  await app.listen({ host: "0.0.0.0", port: parseListenPort() });
}

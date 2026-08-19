import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { createClipClient, type ClipClient } from "./clipClient.js";
import { registerResultRoutes, resolveShortLink } from "./http/result.js";
import {
  HOMEPAGE_RECENT_LIMIT,
  createSuccessIndex,
  registerSitemapRoute,
  type SuccessIndex,
} from "./http/sitemap.js";
import { parseUrl, resultPath } from "./parseUrl.js";
import { DEFAULT_CLIPAPI_PUBLIC_ORIGIN } from "./views/result.js";
import { renderHome } from "./views/home.js";
import {
  renderLegalFooter,
  renderLegalPage,
  type LegalPage,
} from "./views/legal.js";

const DEFAULT_PORT = 3000;
export const HEALTHZ_PATH = "/healthz" as const;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public");

const EMPTY_URL_COPY =
  "The url field was empty. Paste a TikTok link or a 19-digit video id.";
const INVALID_URL_COPY = "Use an http(s) TikTok URL or a 19-digit video id.";
const UNSUPPORTED_URL_COPY =
  "This site only accepts TikTok links and 19-digit video ids.";

export type HealthzOk = {
  ok: true;
};

export type BuildAppOptions = {
  logger?: boolean;
  clipClient?: ClipClient;
  publicOrigin?: string;
  clipPublicOrigin?: string;
  successIndex?: SuccessIndex;
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
  const clipClient = options.clipClient ?? createClipClient();
  const successIndex = options.successIndex ?? createSuccessIndex();
  const clipPublicOrigin =
    options.clipPublicOrigin ?? process.env.CLIPAPI_PUBLIC_ORIGIN;
  const resultDeps = {
    clipClient,
    publicOrigin: options.publicOrigin ?? process.env.PUBLIC_ORIGIN,
    clipPublicOrigin,
    successIndex,
  };

  app.get(HEALTHZ_PATH, async (): Promise<HealthzOk> => ({ ok: true }));

  registerPublicFile(app, "/app.js", "text/javascript; charset=utf-8");
  registerPublicFile(app, "/robots.txt", "text/plain; charset=utf-8");
  registerPublicFile(app, "/ads.txt", "text/plain; charset=utf-8");

  registerResultRoutes(app, resultDeps);
  registerSitemapRoute(app, {
    successIndex,
    publicOrigin: resultDeps.publicOrigin,
  });
  registerLegalRoutes(app, resultDeps);

  app.get<{ Querystring: { url?: string | string[] } }>("/", async (request, reply) => {
    const rawUrl = firstQueryValue(request.query.url);
    if (rawUrl === undefined) {
      return reply.type("text/html; charset=utf-8").send(
        renderHome({
          clipPublicOrigin,
          recent: successIndex.list(HOMEPAGE_RECENT_LIMIT),
        }),
      );
    }

    const parsed = parseUrl(rawUrl);
    switch (parsed.type) {
      case "id":
        return reply.redirect(resultPath(parsed.videoId), 302);
      case "short_link": {
        // BUILD §3: call ClipAPI with the original URL, then 302 to /t/{videoId}.
        const origin =
          resultDeps.publicOrigin ?? requestOrigin(request.headers);
        return resolveShortLink(reply, parsed.url, resultDeps, origin);
      }
      case "empty":
        return reply
          .code(400)
          .header("x-robots-tag", "noindex")
          .type("text/html; charset=utf-8")
          .send(renderUrlNotice("Paste a TikTok URL", EMPTY_URL_COPY, clipPublicOrigin));
      case "unsupported":
        return reply
          .code(200)
          .header("x-robots-tag", "noindex")
          .type("text/html; charset=utf-8")
          .send(renderUrlNotice("Not a TikTok URL", UNSUPPORTED_URL_COPY, clipPublicOrigin));
      case "invalid":
        return reply
          .code(400)
          .header("x-robots-tag", "noindex")
          .type("text/html; charset=utf-8")
          .send(renderUrlNotice("Invalid URL", INVALID_URL_COPY, clipPublicOrigin));
    }
  });

  return app;
}

function requestOrigin(headers: Record<string, unknown>): string {
  const hostHeader = headers.host;
  const host = typeof hostHeader === "string" && hostHeader !== "" ? hostHeader : "localhost";
  const protoHeader = headers["x-forwarded-proto"];
  const proto = typeof protoHeader === "string" && protoHeader !== "" ? protoHeader : "http";
  return `${proto}://${host}`;
}

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}

function registerLegalRoutes(
  app: FastifyInstance,
  deps: { publicOrigin?: string; clipPublicOrigin?: string },
): void {
  for (const page of ["about", "privacy", "terms"] as const) {
    app.get(`/${page}`, async (request, reply) => {
      const origin = deps.publicOrigin ?? requestOrigin(request.headers);
      return reply.type("text/html; charset=utf-8").send(
        renderLegalPage(page satisfies LegalPage, {
          clipPublicOrigin: deps.clipPublicOrigin,
          publicOrigin: origin,
        }),
      );
    });
  }
}

function registerPublicFile(
  app: FastifyInstance,
  urlPath: string,
  contentType: string,
): void {
  const filePath = path.join(PUBLIC_DIR, urlPath.slice(1));
  let cached: string | undefined;
  app.get(urlPath, async (_request, reply) => {
    cached ??= await readFile(filePath, "utf8");
    return reply.type(contentType).send(cached);
  });
}

function renderUrlNotice(
  title: string,
  message: string,
  clipPublicOrigin?: string,
): string {
  const clipOrigin = clipPublicOrigin ?? DEFAULT_CLIPAPI_PUBLIC_ORIGIN;
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
  ${renderLegalFooter(clipOrigin)}
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

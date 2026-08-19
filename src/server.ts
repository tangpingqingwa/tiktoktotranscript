import path from "node:path";
import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { renderHome } from "./views/home.js";

const DEFAULT_PORT = 3000;
export const HEALTHZ_PATH = "/healthz" as const;

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

  app.get("/", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(renderHome());
  });

  return app;
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

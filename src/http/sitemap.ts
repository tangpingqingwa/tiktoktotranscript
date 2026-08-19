import type { FastifyInstance } from "fastify";

export const SITEMAP_CAPACITY = 1000;
export const HOMEPAGE_RECENT_LIMIT = 20;

export type SuccessEntry = {
  videoId: string;
  lastmod: string;
};

export type SuccessIndex = {
  remember(videoId: string, at?: Date): void;
  forget(videoId: string): void;
  list(limit?: number): SuccessEntry[];
};

export type SitemapRouteDeps = {
  successIndex: SuccessIndex;
  publicOrigin?: string;
};

export function createSuccessIndex(
  capacity = SITEMAP_CAPACITY,
): SuccessIndex {
  const order: string[] = [];
  const lastmodById = new Map<string, string>();

  return {
    remember(videoId: string, at = new Date()): void {
      if (videoId === "") {
        return;
      }
      const lastmod = at.toISOString().slice(0, 10);
      if (lastmodById.has(videoId)) {
        const i = order.indexOf(videoId);
        if (i >= 0) {
          order.splice(i, 1);
        }
      }
      order.push(videoId);
      lastmodById.set(videoId, lastmod);
      while (order.length > capacity) {
        const old = order.shift();
        if (old !== undefined) {
          lastmodById.delete(old);
        }
      }
    },
    forget(videoId: string): void {
      if (!lastmodById.delete(videoId)) {
        return;
      }
      const i = order.indexOf(videoId);
      if (i >= 0) {
        order.splice(i, 1);
      }
    },
    list(limit = order.length): SuccessEntry[] {
      const slice = order.slice(-Math.max(0, limit));
      slice.reverse();
      return slice.map((videoId) => ({
        videoId,
        lastmod: lastmodById.get(videoId) ?? "",
      }));
    },
  };
}

export function registerSitemapRoute(
  app: FastifyInstance,
  deps: SitemapRouteDeps,
): void {
  app.get("/sitemap.xml", async (request, reply) => {
    const origin = stripSlash(
      deps.publicOrigin ?? requestOrigin(request.headers),
    );
    return reply
      .type("application/xml; charset=utf-8")
      .send(renderSitemapXml(deps.successIndex.list(), origin));
  });
}

export function renderSitemapXml(
  entries: SuccessEntry[],
  origin: string,
): string {
  const base = stripSlash(origin);
  const urls = entries.map((entry) => {
    const loc = `${base}/t/${entry.videoId}`;
    const lastmod =
      entry.lastmod === ""
        ? ""
        : `\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`;
    return `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmod}\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

function requestOrigin(headers: Record<string, unknown>): string {
  const hostHeader = headers.host;
  const host =
    typeof hostHeader === "string" && hostHeader !== ""
      ? hostHeader
      : "localhost";
  const protoHeader = headers["x-forwarded-proto"];
  const proto =
    typeof protoHeader === "string" && protoHeader !== ""
      ? protoHeader
      : "http";
  return `${proto}://${host}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function stripSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

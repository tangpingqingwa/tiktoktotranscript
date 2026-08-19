import {
  DEFAULT_CLIPAPI_PUBLIC_ORIGIN,
  LEGAL_FOOTER,
  escapeHtml,
} from "./result.js";

export const DMCA_EMAIL = "dmca@tiktoktotranscript.com";

export type LegalPage = "about" | "privacy" | "terms";

const SHARED_CSS = `
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0 auto; max-width: 40rem; padding: 1.25rem; line-height: 1.5; }
    h1 { font-size: 1.75rem; line-height: 1.2; }
    h2 { font-size: 1.15rem; }
    footer { margin-top: 2.5rem; font-size: 0.875rem; }
    footer nav { display: flex; flex-wrap: wrap; gap: 0.75rem; }
`;

export type RenderLegalOptions = {
  clipPublicOrigin?: string;
  publicOrigin?: string;
};

const COPY: Record<
  LegalPage,
  { title: string; description: string; heading: string }
> = {
  about: {
    title: "About",
    description:
      "TikTokToTranscript is an independent service. Paste a TikTok URL and read the public transcript. Free, no signup.",
    heading: "About TikTokToTranscript",
  },
  privacy: {
    title: "Privacy",
    description:
      "No accounts. Server logs keep IP and user-agent for 14 days. Ads are served by third parties.",
    heading: "Privacy",
  },
  terms: {
    title: "Terms",
    description:
      "No bulk scraping of this site. Use ClipAPI for programmatic access. We may rate-limit IPs.",
    heading: "Terms",
  },
};

export function renderLegalPage(
  page: LegalPage,
  options: RenderLegalOptions = {},
): string {
  const copy = COPY[page];
  const clipOrigin = stripSlash(
    options.clipPublicOrigin ?? DEFAULT_CLIPAPI_PUBLIC_ORIGIN,
  );
  const origin = options.publicOrigin
    ? stripSlash(options.publicOrigin)
    : "";
  const canonical = origin === "" ? `/${page}` : `${origin}/${page}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(copy.title)} | TikTokToTranscript</title>
  <meta name="description" content="${escapeAttr(copy.description)}">
  <link rel="canonical" href="${escapeAttr(canonical)}">
  <style>${SHARED_CSS}</style>
</head>
<body>
  <main>
    <h1>${escapeHtml(copy.heading)}</h1>
    ${legalBody(page, clipOrigin)}
    <p><a href="/">Back to TikTok to text</a></p>
  </main>
  ${renderLegalFooter(clipOrigin)}
</body>
</html>
`;
}

function legalBody(page: LegalPage, clipOrigin: string): string {
  switch (page) {
    case "about":
      return `<p>TikTokToTranscript is an <strong>independent</strong> service. We are <strong>not affiliated</strong> with, endorsed by, or sponsored by TikTok or ByteDance.</p>
<p>Paste a TikTok URL or video id. We fetch the public caption of the video you ask for and show it as real text you can copy. We do not host video files.</p>
<p>Need bulk or programmatic access? Use the ClipAPI instead of scraping this site.</p>`;
    case "privacy":
      return `<p>We do not offer user accounts and we do not require signup.</p>
<p>Server logs retain IP address and user-agent (UA) for 14 days, then they are deleted.</p>
<p>Advertising is provided by third parties (see <a href="/ads.txt">ads.txt</a>). A cookie or consent failure must not block reading a transcript.</p>
<p>We do not write transcript bodies to info logs.</p>`;
    case "terms":
      return `<p>Do not bulk-scrape this site. For programmatic access, use <a href="${escapeAttr(`${clipOrigin}/#pricing`)}">ClipAPI</a>.</p>
<p>We may rate-limit IPs.</p>
<p>DMCA / takedown: email <a href="mailto:${DMCA_EMAIL}">${escapeHtml(DMCA_EMAIL)}</a>. If a video is deleted or ClipAPI reports <code>not_found</code>, we drop it from cache and sitemap within 24 hours.</p>
<p>This service is independent and is not affiliated with TikTok or ByteDance. We only fetch the public caption of the video you ask for.</p>`;
  }
}

export function renderLegalFooter(clipOrigin: string): string {
  const href = `${stripSlash(clipOrigin)}/#pricing`;
  return `<footer>
    <p><a href="${escapeAttr(href)}">Need a TikTok Transcript API?</a></p>
    <nav aria-label="Legal">
      <a href="/about">About</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
    </nav>
    <p>${LEGAL_FOOTER}</p>
  </footer>`;
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function stripSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

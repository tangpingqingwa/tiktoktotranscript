export const LEGAL_FOOTER =
  "TikTokToTranscript is an independent service and is not affiliated with, endorsed by, or sponsored by TikTok or ByteDance. “TikTok” is a trademark of its owner. We only fetch the public caption of the video you ask for. We do not host video files.";

export const NO_TRANSCRIPT_COPY = "This video has no public transcript.";
export const NOT_FOUND_COPY = "This TikTok was deleted or is not public.";
export const CLIP_DOWN_COPY =
  "Transcript service is temporarily unavailable. Please retry later.";
export const INVALID_ID_COPY = "Use a 19-digit TikTok video id.";

export const DEFAULT_CLIPAPI_PUBLIC_ORIGIN = "https://api.clipapi.dev";

export const RESULT_LANGS = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "id", label: "Indonesian" },
  { code: "vi", label: "Vietnamese" },
] as const;

export function resultPathForLang(videoId: string, lang: string): string {
  return lang === "en" ? `/t/${videoId}` : `/t/${videoId}.${lang}`;
}

export type ResultLine = {
  startMs: number;
  endMs: number | null;
  text: string;
};

export type ResultPage = {
  videoId: string;
  canonicalUrl: string;
  authorHandle: string | null;
  authorUrl: string | null;
  description: string | null;
  durationMs: number | null;
  createTime: string | null;
  coverUrl: string | null;
  language: string;
  kind: "video" | "slideshow" | "unknown";
  lines: ResultLine[];
  source: "platform_caption" | "platform_asr" | "on_screen";
  fetchedAt: string;
};

export type ResultViewModel =
  | { state: "success"; page: ResultPage }
  | { state: "no_transcript"; videoId?: string }
  | { state: "not_found"; videoId?: string }
  | { state: "invalid" }
  | { state: "clip_down" };

export type RenderResultOptions = {
  publicOrigin: string;
  clipPublicOrigin?: string;
};

const SHARED_CSS = `
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0 auto; max-width: 40rem; padding: 1.25rem; line-height: 1.5; }
    h1 { font-size: 1.5rem; line-height: 1.2; }
    .meta { color: CanvasText; opacity: 0.8; }
    .copy-actions, .lang-switch { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin: 1rem 0; }
    button, select { font-size: 1rem; padding: 0.6rem 0.9rem; }
    ol.lines { padding-left: 1.25rem; }
    .cue { cursor: pointer; }
    .cue-seek { font-variant-numeric: tabular-nums; margin-right: 0.5rem; }
    .embed { margin-top: 2rem; }
    #last-five { margin-top: 2rem; }
    footer { margin-top: 2.5rem; font-size: 0.875rem; }
`;

export function renderResult(
  model: ResultViewModel,
  options: RenderResultOptions,
): string {
  const clipOrigin = stripSlash(
    options.clipPublicOrigin ?? DEFAULT_CLIPAPI_PUBLIC_ORIGIN,
  );
  switch (model.state) {
    case "success":
      return renderSuccess(model.page, options.publicOrigin, clipOrigin);
    case "no_transcript":
      return renderNotice({
        httpHint: "no_transcript",
        title: "No public transcript",
        message: NO_TRANSCRIPT_COPY,
        noindex: true,
        clipOrigin,
      });
    case "not_found":
      return renderNotice({
        httpHint: "not_found",
        title: "TikTok not found",
        message: NOT_FOUND_COPY,
        noindex: true,
        clipOrigin,
      });
    case "invalid":
      return renderNotice({
        httpHint: "invalid",
        title: "Invalid video id",
        message: INVALID_ID_COPY,
        noindex: true,
        clipOrigin,
      });
    case "clip_down":
      return renderNotice({
        httpHint: "clip_down",
        title: "Please retry later",
        message: CLIP_DOWN_COPY,
        noindex: true,
        clipOrigin,
      });
  }
}

function renderSuccess(
  page: ResultPage,
  publicOrigin: string,
  clipOrigin: string,
): string {
  const origin = stripSlash(publicOrigin);
  const canonical = `${origin}/t/${page.videoId}`;
  const titleCore = titleFromDescription(page.description);
  const handle = normalizeHandle(page.authorHandle);
  const metaDescription = handle
    ? `Read the transcript of this TikTok by @${handle}. Free, no signup.`
    : "Read the transcript of this TikTok. Free, no signup.";
  const authorHtml = handle
    ? `<p class="meta">By <a href="${escapeAttr(page.authorUrl ?? `https://www.tiktok.com/@${handle}`)}">@${escapeHtml(handle)}</a></p>`
    : "";
  const kindLabel = page.kind === "slideshow" ? "Slideshow" : "Video";
  const lines = page.lines
    .map((line) => {
      const ts = formatTimestamp(line.startMs);
      return `<li><button type="button" class="cue-seek" data-start-ms="${line.startMs}" aria-label="Jump to ${ts}">${ts}</button><span class="cue" data-start-ms="${line.startMs}">${escapeHtml(line.text)}</span></li>`;
    })
    .join("");
  const embedCite = `https://www.tiktok.com/@${handle ?? "video"}/video/${page.videoId}`;
  const currentLang = page.language || "en";
  const hreflang = RESULT_LANGS.map((item) => {
    const href = `${origin}${resultPathForLang(page.videoId, item.code)}`;
    return `  <link rel="alternate" hreflang="${escapeAttr(item.code)}" href="${escapeAttr(href)}">`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(titleCore)} | TikTokToTranscript</title>
  <meta name="description" content="${escapeAttr(metaDescription)}">
  <link rel="canonical" href="${escapeAttr(canonical)}">
  <link rel="alternate" hreflang="x-default" href="${escapeAttr(canonical)}">
${hreflang}
  <style>${SHARED_CSS}</style>
  <script src="/app.js" defer></script>
</head>
<body>
  <main>
    <article class="result" data-state="success" data-kind="${escapeAttr(page.kind)}" data-video-id="${escapeAttr(page.videoId)}" data-lang="${escapeAttr(currentLang)}">
      <h1>${escapeHtml(titleCore)}</h1>
      ${authorHtml}
      <p class="meta">${escapeHtml(kindLabel)}</p>
      ${renderLangSwitch(page.videoId, currentLang)}
      <div class="copy-actions">
        <button type="button" id="copy">Copy text</button>
        <button type="button" id="copy-ts">Copy with timestamps</button>
      </div>
      <ol class="lines">${lines}</ol>
      <div class="embed">
        <blockquote class="tiktok-embed" cite="${escapeAttr(embedCite)}" data-video-id="${escapeAttr(page.videoId)}">
          <a href="${escapeAttr(embedCite)}">Watch on TikTok</a>
        </blockquote>
        <script async src="https://www.tiktok.com/embed.js"></script>
      </div>
    </article>
    ${renderLastFive()}
  </main>
  ${renderFooter(clipOrigin)}
</body>
</html>
`;
}

function renderLangSwitch(videoId: string, currentLang: string): string {
  const known = new Set<string>(RESULT_LANGS.map((item) => item.code));
  const extra =
    currentLang !== "" && !known.has(currentLang)
      ? `<option value="${escapeAttr(currentLang)}" selected>${escapeHtml(currentLang)}</option>`
      : "";
  const options = RESULT_LANGS.map((item) => {
    const selected = item.code === currentLang ? " selected" : "";
    return `<option value="${escapeAttr(item.code)}"${selected}>${escapeHtml(item.label)}</option>`;
  }).join("");
  return `<div class="lang-switch">
        <label for="lang">Language</label>
        <select id="lang" name="lang" data-video-id="${escapeAttr(videoId)}" data-current-lang="${escapeAttr(currentLang)}">${extra}${options}</select>
      </div>`;
}

function renderLastFive(): string {
  return `<section id="last-five" hidden>
      <h2>Last on this device</h2>
      <ol></ol>
    </section>`;
}

function renderNotice(opts: {
  httpHint: string;
  title: string;
  message: string;
  noindex: boolean;
  clipOrigin: string;
}): string {
  const robots = opts.noindex
    ? `  <meta name="robots" content="noindex">\n`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
${robots}  <title>${escapeHtml(opts.title)} | TikTokToTranscript</title>
  <style>${SHARED_CSS}</style>
</head>
<body>
  <main>
    <article class="result" data-state="${escapeAttr(opts.httpHint)}">
      <h1>${escapeHtml(opts.title)}</h1>
      <p>${escapeHtml(opts.message)}</p>
      <p><a href="/">Paste another TikTok URL</a></p>
    </article>
  </main>
  ${renderFooter(opts.clipOrigin)}
</body>
</html>
`;
}

function renderFooter(clipOrigin: string): string {
  const href = `${clipOrigin}/#pricing`;
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

export function titleFromDescription(description: string | null): string {
  const collapsed = (description ?? "").replace(/\s+/g, " ").trim();
  if (collapsed === "") {
    return "TikTok transcript";
  }
  return collapsed.slice(0, 50);
}

export function formatTimestamp(startMs: number): string {
  const total = Math.max(0, Math.floor(startMs / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function normalizeHandle(handle: string | null | undefined): string | null {
  if (!handle) {
    return null;
  }
  const trimmed = handle.replace(/^@+/, "").trim();
  return trimmed === "" ? null : trimmed;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function stripSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

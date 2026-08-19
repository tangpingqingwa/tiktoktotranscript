import { DEFAULT_CLIPAPI_PUBLIC_ORIGIN } from "./result.js";
import { renderLegalFooter } from "./legal.js";

export type HomeRecentLink = {
  videoId: string;
};

export type RenderHomeOptions = {
  clipPublicOrigin?: string;
  recent?: HomeRecentLink[];
};

export function renderHome(options: RenderHomeOptions = {}): string {
  const clipOrigin = stripSlash(
    options.clipPublicOrigin ?? DEFAULT_CLIPAPI_PUBLIC_ORIGIN,
  );
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TikTok to text | TikTokToTranscript</title>
  <meta name="description" content="Paste a TikTok URL. Get the caption, on-screen text, and spoken transcript when available. Free, no signup.">
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0 auto; max-width: 40rem; padding: 1.25rem; line-height: 1.5; }
    h1 { font-size: 1.75rem; line-height: 1.2; }
    form { display: grid; gap: 0.75rem; margin: 1.5rem 0; }
    label { font-weight: 600; }
    input[name="url"] { width: 100%; box-sizing: border-box; font-size: 1rem; padding: 0.75rem; }
    button { font-size: 1rem; padding: 0.75rem 1rem; }
    footer { margin-top: 2.5rem; font-size: 0.875rem; }
    footer nav { display: flex; flex-wrap: wrap; gap: 0.75rem; }
  </style>
</head>
<body>
  <main>
    <h1>TikTok to text in under 10 seconds</h1>
    <p>Free. No signup. Paste a TikTok link or video id.</p>
    <form method="get" action="/">
      <label for="url">TikTok URL or video id</label>
      <input id="url" name="url" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://www.tiktok.com/@user/video/1234567890123456789">
      <button type="submit">Get transcript</button>
    </form>
    ${renderRecent(options.recent ?? [])}
  </main>
  ${renderLegalFooter(clipOrigin)}
</body>
</html>
`;
}

function renderRecent(recent: HomeRecentLink[]): string {
  if (recent.length === 0) {
    return "";
  }
  const items = recent
    .map((item) => {
      const href = `/t/${item.videoId}`;
      return `<li><a href="${href}">TikTok transcript ${item.videoId}</a></li>`;
    })
    .join("");
  return `<section aria-label="Recent transcripts">
      <h2>Recent transcripts</h2>
      <ul>${items}</ul>
    </section>`;
}

function stripSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

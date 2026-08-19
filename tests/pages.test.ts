import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createClipClient } from "../src/clipClient.js";
import { createSuccessIndex } from "../src/http/sitemap.js";
import { buildApp } from "../src/server.js";
import {
  CLIP_DOWN_COPY,
  LEGAL_FOOTER,
  NO_TRANSCRIPT_COPY,
  NOT_FOUND_COPY,
  escapeHtml,
} from "../src/views/result.js";
import { DMCA_EMAIL } from "../src/views/legal.js";
import {
  CLIP_DOWN_ID,
  FLAKY_ID,
  NO_TRANSCRIPT_ID,
  NOT_FOUND_ID,
  SLIDESHOW_DESCRIPTION,
  SLIDESHOW_ID,
  SUCCESS_CUES,
  SUCCESS_DESCRIPTION,
  SUCCESS_ID,
  SUCCESS_SHORT,
  slideshowTranscript,
  startFakeClip,
  type FakeClipServer,
} from "./fake-clip.js";

const PUBLIC_ORIGIN = "https://tiktoktotranscript.test";
const CLIP_PUBLIC = "https://api.clipapi.dev";

let fake: FakeClipServer;
let app: Awaited<ReturnType<typeof buildApp>>;

before(async () => {
  fake = await startFakeClip();
  app = await buildApp({
    clipClient: createClipClient({ base: fake.base, key: "ck_test" }),
    publicOrigin: PUBLIC_ORIGIN,
    clipPublicOrigin: CLIP_PUBLIC,
  });
});

after(async () => {
  await app.close();
  await fake.close();
});

function robots(headers: Record<string, unknown>): string {
  return String(headers["x-robots-tag"] ?? "");
}

describe("SPEC acceptance 1–7 against fake ClipAPI", () => {
  it("1: standard captioned @video URL lands on /t/:id with ≥1 line and copy", async () => {
    const url = `https://www.tiktok.com/@bioteacher/video/${SUCCESS_ID}`;
    const redirected = await app.inject({
      method: "GET",
      url: `/?url=${encodeURIComponent(url)}`,
    });
    assert.equal(redirected.statusCode, 302);
    assert.equal(redirected.headers.location, `/t/${SUCCESS_ID}`);

    const res = await app.inject({ method: "GET", url: `/t/${SUCCESS_ID}` });
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers["content-type"] ?? ""), /text\/html/i);
    assert.equal(robots(res.headers), "");
    assert.doesNotMatch(res.body, /name=["']robots["'][^>]*noindex/i);

    assert.match(res.body, /<ol class="lines">/);
    for (const cue of SUCCESS_CUES) {
      const html = escapeHtml(cue.text);
      assert.match(res.body, new RegExp(`<li>.*${escapeRe(html)}`, "s"));
      assert.match(res.body, new RegExp(`class="cue"[^>]*>${escapeRe(html)}`));
    }
    assert.match(res.body, /id="copy"/);
    assert.match(res.body, /id="copy-ts"/);
    assert.match(res.body, /Copy text/);
    assert.match(res.body, /Copy with timestamps/);

    const titleCore = SUCCESS_DESCRIPTION.slice(0, 50);
    assert.match(
      res.body,
      new RegExp(`<title>${escapeRe(titleCore)} \\| TikTokToTranscript</title>`),
    );
    assert.match(
      res.body,
      /Read the transcript of this TikTok by @bioteacher\. Free, no signup\./,
    );
    assert.match(
      res.body,
      new RegExp(
        `<link rel="canonical" href="${escapeRe(`${PUBLIC_ORIGIN}/t/${SUCCESS_ID}`)}"`,
      ),
    );
    assert.match(res.body, /data-kind="video"/);

    const cueAt = res.body.indexOf(escapeHtml(SUCCESS_CUES[0]!.text));
    const embedAt = res.body.indexOf('class="tiktok-embed"');
    assert.ok(cueAt >= 0 && embedAt > cueAt, "embed must come after transcript text");

    assert.match(res.body, new RegExp(escapeRe(LEGAL_FOOTER)));
    assert.match(
      res.body,
      new RegExp(
        `<a href="${escapeRe(`${CLIP_PUBLIC}/#pricing`)}">Need a TikTok Transcript API\\?</a>`,
      ),
    );
  });

  it("2: vm.tiktok.com short link resolves via ClipAPI then same as 1", async () => {
    const redirected = await app.inject({
      method: "GET",
      url: `/?url=${encodeURIComponent(SUCCESS_SHORT)}`,
    });
    assert.equal(redirected.statusCode, 302);
    assert.equal(redirected.headers.location, `/t/${SUCCESS_ID}`);

    const res = await app.inject({
      method: "GET",
      url: redirected.headers.location as string,
    });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, new RegExp(escapeRe(escapeHtml(SUCCESS_CUES[0]!.text))));
    assert.match(res.body, /id="copy"/);
  });

  it("3: slideshow with text shows kind=slideshow and on-screen lines", async () => {
    const res = await app.inject({ method: "GET", url: `/t/${SLIDESHOW_ID}` });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /data-kind="slideshow"/);
    assert.match(res.body, />Slideshow</);
    for (const cue of slideshowTranscript().transcript) {
      assert.match(res.body, new RegExp(escapeRe(escapeHtml(cue.text))));
    }
    assert.match(res.body, new RegExp(escapeRe(SLIDESHOW_DESCRIPTION.slice(0, 50))));
  });

  it("4: no captions → error state, noindex, no invented lines", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/${NO_TRANSCRIPT_ID}`,
    });
    assert.equal(res.statusCode, 200);
    assert.match(robots(res.headers), /noindex/i);
    assert.match(res.body, /name=["']robots["'][^>]*content=["']noindex["']/i);
    assert.match(res.body, new RegExp(escapeRe(NO_TRANSCRIPT_COPY)));
    assert.match(res.body, /data-state="no_transcript"/);
    assert.doesNotMatch(res.body, /class="cue"/);
    assert.doesNotMatch(res.body, /<ol class="lines">/);
    for (const cue of SUCCESS_CUES) {
      assert.doesNotMatch(res.body, new RegExp(escapeRe(escapeHtml(cue.text))));
    }
    assert.match(res.body, new RegExp(escapeRe(LEGAL_FOOTER)));
  });

  it("5: deleted id is not_found 404 and not treated as success", async () => {
    const res = await app.inject({ method: "GET", url: `/t/${NOT_FOUND_ID}` });
    assert.equal(res.statusCode, 404);
    assert.match(robots(res.headers), /noindex/i);
    assert.match(res.body, /name=["']robots["'][^>]*content=["']noindex["']/i);
    assert.match(res.body, new RegExp(escapeRe(NOT_FOUND_COPY)));
    assert.match(res.body, /data-state="not_found"/);
    assert.doesNotMatch(res.body, /class="cue"/);
    assert.doesNotMatch(res.body, /<link rel="canonical"/);
  });

  it("6: empty submit is 400 validation on /", async () => {
    const res = await app.inject({ method: "GET", url: "/?url=" });
    assert.equal(res.statusCode, 400);
    assert.match(robots(res.headers), /noindex/i);
    assert.match(res.body, /name=["']robots["'][^>]*content=["']noindex["']/i);
    assert.match(res.body, /Paste a TikTok URL/);
    assert.doesNotMatch(res.body, /class="cue"/);
  });

  it("7: ClipAPI 503 is a friendly retry page, not a 500 dump", async () => {
    const res = await app.inject({ method: "GET", url: `/t/${CLIP_DOWN_ID}` });
    assert.equal(res.statusCode, 503);
    assert.match(robots(res.headers), /noindex/i);
    assert.match(res.body, /name=["']robots["'][^>]*content=["']noindex["']/i);
    assert.match(res.body, new RegExp(escapeRe(CLIP_DOWN_COPY)));
    assert.match(res.body, /data-state="clip_down"/);
    assert.doesNotMatch(res.body, /<pre\b/i);
    assert.doesNotMatch(res.body, /at \S+\s+\(/);
    assert.doesNotMatch(res.body, /stack/i);
    assert.doesNotMatch(res.body, /TypeError|ECONNREFUSED|fetch failed/i);
    assert.doesNotMatch(res.body, /class="cue"/);
  });
});

describe("clipClient stays offline without a base or key", () => {
  it("returns clip_down without fetching", async () => {
    const result = await createClipClient().getTranscript({ videoId: SUCCESS_ID });
    assert.deepEqual(result, { ok: false, code: "clip_down", http: 503 });
  });
});

describe("result page extras", () => {
  it("invalid /t/:id is 400 noindex", async () => {
    const res = await app.inject({ method: "GET", url: "/t/not-a-video-id" });
    assert.equal(res.statusCode, 400);
    assert.match(robots(res.headers), /noindex/i);
    assert.match(res.body, /data-state="invalid"/);
  });

  it("retries once on ClipAPI 503 then succeeds", async () => {
    const res = await app.inject({ method: "GET", url: `/t/${FLAKY_ID}` });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, new RegExp(escapeRe(escapeHtml(SUCCESS_CUES[0]!.text))));
  });

  it("serves public/app.js with copy and seek handlers", async () => {
    const res = await app.inject({ method: "GET", url: "/app.js" });
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers["content-type"] ?? ""), /javascript/);
    assert.match(res.body, /#copy/);
    assert.match(res.body, /#copy-ts/);
    assert.match(res.body, /clipboard/);
    assert.match(res.body, /postMessage/);
    assert.match(res.body, /\.cue/);
  });
});

describe("SPEC 9–10 SEO, legal pages, ads.txt", () => {
  it("GET /privacy is 200 with no-account and 14-day log copy", async () => {
    const res = await app.inject({ method: "GET", url: "/privacy" });
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers["content-type"] ?? ""), /text\/html/i);
    assert.match(res.body, /<title>Privacy \| TikTokToTranscript<\/title>/);
    assert.match(res.body, /do not offer user accounts/i);
    assert.match(res.body, /IP address and user-agent \(UA\) for 14 days/i);
    assert.match(res.body, /third part/i);
    assert.match(res.body, new RegExp(escapeRe(LEGAL_FOOTER)));
    assert.match(
      res.body,
      new RegExp(
        `<a href="${escapeRe(`${CLIP_PUBLIC}/#pricing`)}">Need a TikTok Transcript API\\?</a>`,
      ),
    );
  });

  it("GET /about is independent / not affiliated", async () => {
    const res = await app.inject({ method: "GET", url: "/about" });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /independent/i);
    assert.match(res.body, /not affiliated/i);
    assert.match(res.body, new RegExp(escapeRe(LEGAL_FOOTER)));
  });

  it("GET /terms has no-bulk, rate-limit, and DMCA email", async () => {
    const res = await app.inject({ method: "GET", url: "/terms" });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /bulk-scrape/i);
    assert.match(res.body, /ClipAPI/);
    assert.match(res.body, /rate-limit IPs/);
    assert.match(res.body, new RegExp(escapeRe(DMCA_EMAIL)));
    assert.match(res.body, new RegExp(`mailto:${escapeRe(DMCA_EMAIL)}`));
    assert.match(res.body, new RegExp(escapeRe(LEGAL_FOOTER)));
  });

  it("GET /ads.txt is 200 with a publisher line", async () => {
    const res = await app.inject({ method: "GET", url: "/ads.txt" });
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers["content-type"] ?? ""), /text\/plain/i);
    assert.match(res.body, /google\.com,\s*pub-/);
  });

  it("GET /robots.txt disallows ?url= query pages", async () => {
    const res = await app.inject({ method: "GET", url: "/robots.txt" });
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers["content-type"] ?? ""), /text\/plain/i);
    assert.match(res.body, /User-agent:\s*\*/);
    assert.match(res.body, /Disallow:\s*\/\?url=/);
    assert.match(res.body, /sitemap\.xml/);
  });

  it("success pages enter sitemap and homepage recents; failed ids do not", async () => {
    const ok = await app.inject({ method: "GET", url: `/t/${SUCCESS_ID}` });
    assert.equal(ok.statusCode, 200);

    const listed = await app.inject({ method: "GET", url: "/sitemap.xml" });
    assert.equal(listed.statusCode, 200);
    assert.match(String(listed.headers["content-type"] ?? ""), /xml/i);
    assert.match(
      listed.body,
      new RegExp(
        `<loc>${escapeRe(`${PUBLIC_ORIGIN}/t/${SUCCESS_ID}`)}</loc>`,
      ),
    );
    assert.doesNotMatch(listed.body, /<loc>[^<]*\?url=/);
    assert.doesNotMatch(listed.body, new RegExp(`/t/${NOT_FOUND_ID}`));

    const home = await app.inject({ method: "GET", url: "/" });
    assert.equal(home.statusCode, 200);
    assert.match(home.body, new RegExp(`href="/t/${SUCCESS_ID}"`));
  });

  it("failed result pages stay out of the sitemap", async () => {
    await app.inject({ method: "GET", url: `/t/${NO_TRANSCRIPT_ID}` });
    await app.inject({ method: "GET", url: `/t/${CLIP_DOWN_ID}` });
    const res = await app.inject({ method: "GET", url: "/sitemap.xml" });
    assert.doesNotMatch(res.body, new RegExp(`/t/${NO_TRANSCRIPT_ID}`));
    assert.doesNotMatch(res.body, new RegExp(`/t/${CLIP_DOWN_ID}`));
  });

  it("not_found drops a previously successful id from sitemap", async () => {
    const index = createSuccessIndex();
    const isolated = await buildApp({
      clipClient: createClipClient({ base: fake.base, key: "ck_test" }),
      publicOrigin: PUBLIC_ORIGIN,
      clipPublicOrigin: CLIP_PUBLIC,
      successIndex: index,
    });
    try {
      index.remember(NOT_FOUND_ID);
      const before = await isolated.inject({ method: "GET", url: "/sitemap.xml" });
      assert.match(
        before.body,
        new RegExp(
          `<loc>${escapeRe(`${PUBLIC_ORIGIN}/t/${NOT_FOUND_ID}`)}</loc>`,
        ),
      );

      const missing = await isolated.inject({
        method: "GET",
        url: `/t/${NOT_FOUND_ID}`,
      });
      assert.equal(missing.statusCode, 404);

      const after = await isolated.inject({ method: "GET", url: "/sitemap.xml" });
      assert.doesNotMatch(after.body, new RegExp(`/t/${NOT_FOUND_ID}`));
    } finally {
      await isolated.close();
    }
  });

  it("footer legal string is verbatim SPEC §10 on home and result", async () => {
    const home = await app.inject({ method: "GET", url: "/" });
    assert.match(home.body, new RegExp(escapeRe(LEGAL_FOOTER)));
    const result = await app.inject({ method: "GET", url: `/t/${SUCCESS_ID}` });
    assert.match(result.body, new RegExp(escapeRe(LEGAL_FOOTER)));
  });
});

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

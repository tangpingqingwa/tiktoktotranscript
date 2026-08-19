# TikTokToTranscript — Product Development Spec

**Version:** 1.0  
**Status:** Ready to build  
**Repo:** https://github.com/tangpingqingwa/tiktoktotranscript  
**Depends on:** ClipAPI (`/v1/transcript`)  
**Does not depend on:** user accounts, ASR, video CDN

This document is the build contract. If README and SPEC disagree, SPEC wins until README is updated.

---

## 1. Product statement

A public, no-login English website. User pastes a TikTok URL (or video id). Page returns caption, on-screen text, and spoken transcript **when TikTok already has one**. User can copy, jump by timestamp, and optionally translate in the browser.

This is the traffic layer. It is not the profit center. Ads pay the box. Bulk / programmatic users are sent to ClipAPI.

One-line pitch: **TikTok to text in under 10 seconds. Free. No signup.**

---

## 2. Goals and non-goals

### Goals (v1)

- Rank for `tiktok transcript`, `tiktok to text`, `tiktok video to text`, `download tiktok captions`.
- Time-to-text p95 < 10s on a cold public video that has captions.
- Cache hit p95 < 400ms HTML TTFB.
- Zero first-party accounts.
- One footer CTA: “Need a TikTok Transcript API?” → ClipAPI.
- Host cost ≤ $50 / mo at 100k monthly visits.

### Non-goals

- Watermark-free video / audio download.
- On-site ASR when TikTok has no captions.
- Editor, scheduler, studio, For You, login, follows.
- Native app.
- User-generated comments or social graph.
- Multi-platform paste box in v1 (Reels / Shorts wait until ClipAPI advertises them).

### Kill / change rules

- If ads + ClipAPI signups cannot cover host after 90 days of ≥ 1k organic sessions / day, freeze features; keep the page as ClipAPI load.
- If ClipAPI is down, show a hard error. Do not scrape TikTok from this repo.

---

## 3. Users

| Persona | Job | Success |
|---|---|---|
| Student | Dump a lecture-style TikTok into notes / ChatGPT | Full text + timestamps, copy in one click |
| Newsletter writer | Quote a clip without scrubbing | Clean text, author handle, canonical URL |
| Researcher | Read many clips | Speed; then they hit the API CTA |
| Agent user (indirect) | Not this site | Sent to ClipAPI |

No logged-in state. No personalization. No history except optional `localStorage` of last 5 URLs on this device.

---

## 4. Information architecture

```
GET  /                         marketing + paste form
GET  /t/:video_id              canonical result page (indexable)
GET  /t/:video_id.:lang        language variant
GET  /about                    independent, not affiliated
GET  /privacy
GET  /terms
GET  /robots.txt
GET  /sitemap.xml              only successful public result pages
GET  /ads.txt
GET  /healthz                  200 if process up
```

Form `GET /?url=` **302** to `/t/:video_id` after parse. Never keep the long share URL as the result URL.

Invalid / deleted / no-caption pages:

- HTTP 200 with an error state (so ads still render) **or** 404 for permanently deleted.
- `noindex` on error pages.
- Do not put failed ids in sitemap.

---

## 5. User flows

### 5.1 Happy path

1. Land from Google on `/` or a previous `/t/:id`.
2. Paste `https://www.tiktok.com/@user/video/123` or `https://vm.tiktok.com/xxxx`.
3. Submit. Server resolves short links, extracts `video_id`.
4. Server calls ClipAPI `GET /v1/transcript?url=...&lang=en` with the site’s service key.
5. Render title, author, duration, timed lines, copy button, optional translate dropdown.
6. Click a line → seek the official TikTok embed to that time (embed only, no MP4 host).

### 5.2 No captions

Render: “This video has no public transcript.”  
Do **not** offer “transcribe with AI” on this property.  
Secondary: “Monitor this creator” → DailyBrief (if live) or hide.

### 5.3 Slideshow / photo mode

If ClipAPI returns `kind: slideshow` and on-screen OCR/caption text exists, show that. If empty, same as no captions.

### 5.4 Region / deleted

Show ClipAPI `error.code` in human words. No stack traces.

---

## 6. ClipAPI client contract (this app)

Service key in env `CLIPAPI_KEY`. Base `CLIPAPI_BASE` default `https://api.clipapi.dev` (placeholder until ClipAPI ships).

```
GET {CLIPAPI_BASE}/v1/transcript
  ?url={canonical_or_raw}
  &lang={bcp47, optional}
Authorization: Bearer {CLIPAPI_KEY}
```

This site must send the **original user URL** plus the resolved id when known. It must not invent transcript lines.

Timeout: 8s. Retry: once on `502/503/upstream_blocked`. No retry on `not_found` / `no_transcript`.

If ClipAPI charges credits, this site is an internal customer. Use a dedicated key with a high ceiling and alert at 80% daily spend.

---

## 7. Page data model (server-rendered)

```ts
type ResultPage = {
  videoId: string
  canonicalUrl: string
  authorHandle: string | null
  authorUrl: string | null
  description: string | null
  durationMs: number | null
  createTime: string | null  // ISO
  coverUrl: string | null    // remote URL, hotlink with referrer policy, do not store
  language: string           // requested or detected
  kind: "video" | "slideshow" | "unknown"
  lines: Array<{
    startMs: number
    endMs: number | null
    text: string
  }>
  source: "platform_caption" | "platform_asr" | "on_screen"
  fetchedAt: string
}
```

Never persist media bytes. Persist JSON of the above in the same cache ClipAPI already has **or** a local 24h HTML cache keyed by `(videoId, lang)`.

---

## 8. Frontend requirements

- Server-rendered HTML first. JS only for copy, seek, language switch.
- Mobile-first. Input is the whole above-the-fold on phone.
- Copy: copies plain text with optional `mm:ss` prefixes. Two buttons: “Copy text” / “Copy with timestamps”.
- Translate: client-side via browser `Translator` API if present; otherwise a `<select>` that reloads `/t/:id.:lang` and asks ClipAPI for that lang. No Google Translate iframe.
- Embed: official TikTok blockquote/embed script. If embed fails, show link-out only.
- Ads: one slot above result, one below. Never cover copy button.
- No cookie wall beyond AdSense / CMP minimum for EEA. CMP failure must not block the transcript (see Recapio/YTT lesson: adblock should not kill the product).

Accessibility: lines are a list; timestamps are buttons; contrast AA.

---

## 9. SEO

**Title pattern:** `{first 50 chars of description or 'TikTok transcript'} | TikTokToTranscript`  
**Meta description:** `Read the transcript of this TikTok by @{handle}. Free, no signup.`

Indexable body must include the full transcript as real text (not canvas, not only JS).

`rel=canonical` on `/t/:id` (default lang). Hreflang if we have ≥2 langs.

Internal links: from homepage, last 20 successful public pages (no PII). Sitemap regenerated hourly.

Do not index `?url=` query pages.

---

## 10. Legal / compliance copy (required strings)

Footer on every page:

> TikTokToTranscript is an independent service and is not affiliated with, endorsed by, or sponsored by TikTok or ByteDance. “TikTok” is a trademark of its owner. We only fetch the public caption of the video you ask for. We do not host video files.

Terms: no bulk scraping of *this* site; use ClipAPI. We may rate-limit IPs.

Privacy: no accounts; server logs IP / UA 14 days; ads third parties.

DMCA / takedown email on `/terms`. Honor video deletion: if ClipAPI says `not_found`, drop from cache and sitemap within 24h.

---

## 11. Rate limits and abuse

| Layer | Limit |
|---|---|
| Per IP | 30 submissions / 10 min |
| Per video | coalesce in-flight requests |
| Bots without UA | challenge or 429 |
| Known scraper UAs hitting `/t/*` HTML | allow (SEO) but no JSON API on this host |

There is **no public JSON API** on this domain. That is ClipAPI’s job.

---

## 12. Infrastructure

- Single VPS (Hetzner-class), Caddy or nginx, one Node/Go/Python process.
- No AWS requirement for v1. If we use AWS later: one small instance + optional CloudFront for HTML only.
- Env: `CLIPAPI_KEY`, `CLIPAPI_BASE`, `ADSENSE_CLIENT`, `PORT`.
- Metrics: requests, ClipAPI latency, cache hit ratio, error codes, ad-eligible pageviews.
- Logs: no transcript bodies in info logs (size + privacy).

Budget: $20–40 / mo until 100k visits.

---

## 13. Analytics

- GA4 or equivalent, page_view + `transcript_success` / `transcript_fail` + `copy_click` + `api_cta_click`.
- Do not send full pasted URLs with query junk to analytics if they contain usernames we do not need; `video_id` is enough.

---

## 14. Acceptance tests

Fixtures live in `/fixtures/urls.txt` (public videos we have the right to fetch as users).

| # | Case | Expected |
|---|---|---|
| 1 | Standard captioned @video URL | `/t/:id`, ≥1 line, copy works |
| 2 | `vm.tiktok.com` short link | resolves, same as 1 |
| 3 | Slideshow with text | `kind=slideshow`, text shown |
| 4 | Video with no captions | error state, noindex, no fake lines |
| 5 | Deleted id | not_found, removed from sitemap |
| 6 | Empty submit | 400 validation on `/` |
| 7 | ClipAPI 503 | friendly retry message, no 500 HTML dump |
| 8 | Lighthouse mobile perf | LCP < 2.5s on cached result |
| 9 | Ads.txt present | 200 |
| 10 | CTA | footer link to ClipAPI pricing |

---

## 15. Milestones

**M0 (2 days):** parse URL → video id; static homepage; healthz.  
**M1 (1 week):** ClipAPI integration; `/t/:id`; copy; embed; four error states.  
**M2:** SEO meta, sitemap, ads, privacy/terms.  
**M3:** language switch; local last-5; CTA experiment.  
**M4:** load test 20 rps cached; document cost.

Definition of done for public launch: M2 + acceptance 1–7, 9–10.

---

## 16. Open questions

- Domain: prefer `tiktoktotranscript.com` if available; otherwise `tiktoktotext.com` / `gettiktoktranscript.com`.
- Whether DailyBrief CTA ships in M2 or waits for DailyBrief production.

---

## 17. File layout (suggested)

```
/
  SPEC.md
  README.md
  src/
    server.ts
    parseUrl.ts
    clipClient.ts
    views/
  fixtures/
  public/robots.txt
```

Do not add a scraper package to this repo.

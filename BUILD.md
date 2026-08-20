# TikTokToTranscript — Detailed Specification and Build Plan

**Product contract:** [SPEC.md](./SPEC.md)  
**This file:** stack, modules, page states, PR sequence  
**Git:** [CONTRIBUTING.md](./CONTRIBUTING.md)

This site has **no scraper**. If ClipAPI is down, the page errors. That is correct.

---

## 0. Outcome

Public English site: paste TikTok URL → server-rendered transcript page → copy. Ads pay the box. Footer CTA to ClipAPI.

---

## 1. Stack

| Layer | Choice |
|---|---|
| Runtime | Node 22 + TypeScript strict |
| HTTP | Fastify |
| HTML | Server-rendered templates (`src/views/*.ts` string templates or `eta`). No React SSR in v1 |
| Client JS | Progressive: `public/app.js` copy + seek only |
| ClipAPI | `src/clipClient.ts` — only client |
| Cache | Optional in-process LRU of rendered HTML 60s; ClipAPI owns transcript cache |
| Tests | `node:test` + fixture ClipAPI server |
| Host | One VPS behind Caddy |

No auth, no database in M0–M2. Sitemap can be a static file regenerated later.

---

## 2. Architecture

```
Browser
   │ GET /  GET /t/:id
   ▼
Fastify
   ├─ parseUrl.ts        TikTok URL → videoId
   ├─ clipClient.ts      GET /v1/transcript
   └─ views/result.ts    HTML, indexable text
```

---

## 3. URL parser (normative)

Accept and resolve to `{ videoId: string }`:

- `https://www.tiktok.com/@user/video/1234567890123456789`
- `https://tiktok.com/@user/video/123…`
- `https://www.tiktok.com/t/ZTxxxx/` (short; **requires ClipAPI or a HEAD follow** — in v1 send the **original URL** to ClipAPI `?url=` and do not invent an id)
- `https://vm.tiktok.com/ZMxxxx/`
- Bare 19-digit id

Reject: empty, non-http(s), youtube, instagram, javascript: URLs.

If we have a numeric id, redirect `GET /?url=` → `302 /t/{id}`.  
If we only have a short link, `302 /t/u/{urlencoded}` or call ClipAPI first then redirect to `/t/{id}` from the response `videoId`. Prefer: **call ClipAPI with url, then 302 to `/t/{data.videoId}`** so all result URLs are canonical ids.

---

## 4. Page states

| State | HTTP | index | Body |
|---|---|---|---|
| home | 200 | yes | form |
| success | 200 | yes | lines as `<ol><li>` real text |
| no_transcript | 200 | **noindex** | SPEC copy |
| not_found | 404 | noindex | deleted |
| invalid | 400 on `/` | noindex | validation |
| clip_down | 503 | noindex | retry later |
| unsupported | 200 | noindex | not a TikTok URL |

Never render adapter stack traces.

---

## 5. clipClient

```ts
getTranscript(opts: { url?: string; videoId?: string; lang?: string }): Promise<
  | { ok: true; data: Transcript; cached: boolean }
  | { ok: false; code: string; http: number }
>
```

- Timeout 8s, one retry on 502/503.
- `CLIPAPI_KEY`, `CLIPAPI_BASE`.
- In tests, `CLIPAPI_BASE` points at `tests/fake-clip.ts`.

---

## 6. HTML contract (SEO)

Success page **must** include:

- `<title>` per SPEC pattern
- `<meta name="description">`
- `<link rel="canonical" href="https://{host}/t/{id}">`
- Full transcript in HTML (not only JSON-in-script)
- Official embed **after** the text (so crawlers get text first)
- Footer legal string from SPEC §10 verbatim
- CTA: `Need a TikTok Transcript API?` → `{CLIPAPI_PUBLIC_ORIGIN}/#pricing`

`public/robots.txt`, `public/ads.txt` (placeholder publisher id until AdSense).

---

## 7. Client JS

- `#copy` copies plain text of all `.cue` 
- `#copy-ts` prefixes `mm:ss`
- click `.cue` → `postMessage` into TikTok embed if possible; else ignore
- no framework

---

## 8. Tests

| Test | Assert |
|---|---|
| `parse-url.test.ts` | all accepted shapes; rejects youtube |
| `pages.test.ts` | inject fake ClipAPI; success HTML contains cue text; no_transcript noindex; 404 |
| `health.test.ts` | `/healthz` 200 |
| `scripts/test.sh` | contract + `tsc` + `node:test` once app exists |

---

## 9. PR plan

### PR 1: App skeleton

- **Description:** package.json, Fastify, `/` form, `/healthz`, gitignore, extend test.sh.
- **Files:** `package.json`, `tsconfig.json`, `src/server.ts`, `src/views/home.ts`, `scripts/test.sh`, `.gitignore`
- **Dependencies:** None
- **Acceptance:** `GET /` contains a form; tests green.

### PR 2: URL parser + redirect

- **Description:** parseUrl + `GET /?url=` 302 to `/t/:id` when id known.
- **Files:** `src/parseUrl.ts`, `tests/parse-url.test.ts`, route wiring
- **Dependencies:** PR 1

### PR 3: Fake ClipAPI + result page

- **Description:** clipClient, `/t/:id` states, copy buttons, legal footer, noindex rules.
- **Files:** `src/clipClient.ts`, `src/views/result.ts`, `src/http/result.ts`, `tests/pages.test.ts`, `tests/fake-clip.ts`, `public/app.js`
- **Dependencies:** PR 2
- **Acceptance:** SPEC acceptance 1–7 against fake server.

### PR 4: SEO + legal pages + ads.txt

- **Description:** about/privacy/terms, robots, ads.txt, sitemap of last N success ids (in-memory ring buffer OK).
- **Files:** `src/views/legal.ts`, `public/robots.txt`, `public/ads.txt`, sitemap route
- **Dependencies:** PR 3
- **Acceptance:** SPEC 9–10; `/privacy` 200.

### PR 5: Language switch + last-5 localStorage

- **Description:** `/t/:id.:lang` and last 5 in `localStorage` only.
- **Files:** result view, `public/app.js`
- **Dependencies:** PR 3

Do not add a scraper package in any PR.

---

## 10. Cutover

Point `CLIPAPI_BASE` at real ClipAPI only after ClipAPI BUILD PR 5 is on its `main` and a smoke video works from staging.

One-box host: [deploy/runbook.md](./deploy/runbook.md). Image is `Dockerfile` (Node 22, `USER node`, `$PORT`). Do not bake `CLIPAPI_BASE` / `CLIPAPI_KEY`. If ClipAPI is down, the page errors. Do not add a scraper.

### PR 6: Dockerfile + CLIPAPI_BASE runbook

- **Description:** one-VPS image and operator cutover. No scraper. CI stays on fixture ClipAPI.
- **Files:** `Dockerfile`, `.dockerignore`, `.env.example`, `deploy/runbook.md`, `scripts/test.sh`
- **Dependencies:** PR 5 (app on `main`)
- **Acceptance:** `bash scripts/test.sh` green offline; Dockerfile does not set `CLIPAPI_BASE`.

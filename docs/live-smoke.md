# Live ClipAPI paste smoke

Optional soak. **Not** part of `scripts/test.sh` or GitHub Actions `ci`.

`100%` for this unit means a **local process** pointed at a **live** ClipAPI (`CLIPAPI_BASE` + `CLIPAPI_KEY`) walked a real TikTok paste URL to a result page. Do not invent cue text. ClipAPI live smoke must already PASS for this to be 100%.

## Flags

| Variable | Live smoke | CI / `test.sh` |
|---|---|---|
| `CLIPAPI_BASE` | live ClipAPI origin | **unset** |
| `CLIPAPI_KEY` | dedicated service key | **unset** |

Missing `CLIPAPI_BASE` or `CLIPAPI_KEY` is `BLOCKED-SECRET`. The script prints the exact env var and exits 2. It does not invent a transcript.

## How to run

```bash
export CLIPAPI_BASE=https://api.clipapi.dev   # live ClipAPI origin
export CLIPAPI_KEY=                           # real ck_live_… ; never commit
bash scripts/live-smoke.sh
```

The script:

1. Refuses `CI=true` / `GITHUB_ACTIONS=true`.
2. Exits `BLOCKED-SECRET` if `CLIPAPI_BASE` or `CLIPAPI_KEY` is unset.
3. Starts `node --import tsx src/server.ts` on a free loopback port (or attaches via `LIVE_SMOKE_BASE_URL`).
4. Waits for `GET /healthz`.
5. Pastes `GET /?url=<TikTok URL>` and follows to `/t/:id`.
6. Scores the result page. Kills the process it started.

Default paste URL is a public `@video` link (`https://www.tiktok.com/@scout2015/video/6718335390845095173`). Override with `LIVE_SMOKE_TIKTOK_URL`. This session used ClipAPI’s captioned PASS URL (`https://www.tiktok.com/@rosssmith/video/6989607394561035525`).

Exit codes:

| Code | Meaning |
|---|---|
| 0 | every required flow is `PASS` or `PASS-ERROR` |
| 1 | `FAIL` — invented text, stack dump, or unexpected status |
| 2 | `BLOCKED-SECRET` — no `CLIPAPI_BASE` and/or `CLIPAPI_KEY` |

## Required flows

| Flow | Request | Honest pass |
|---|---|---|
| Paste URL | `GET /?url=<real TikTok URL>` | `302 /t/:19-digit-id`, or ClipAPI-resolved HTML without inventing an id |
| Result page | `GET /t/:id` | `200` + `data-state="success"` + ≥1 `.cue` from live ClipAPI, **or** SPEC error (`no_transcript` 200 / `not_found` 404 / `clip_down` 503) with **no invented lines** |

Verdicts printed per flow: `PASS`, `PASS-ERROR` (SPEC error, nothing invented), `FAIL`, `BLOCKED-SECRET`.

Fixture cue strings from `tests/fake-clip.ts` (`Welcome to today's lecture…`, pasta slideshow lines) fail the run — that means live ClipAPI was not on.

## This session

Re-ran `bash scripts/live-smoke.sh` on 2026-08-20 from `feat/live-smoke-captioned` (branched from `origin/main`) against a **local live ClipAPI** on ClipAPI `origin/main` (`be9ac13`, regional TikTok CDN caption fix). ClipAPI: `CLIPAPI_LIVE=1`, `CLIPAPI_FIXTURE_ONLY` unset, `http://127.0.0.1:3041`, bootstrap `ck_live_…` (not committed). This site started `node --import tsx src/server.ts` on loopback (`CLIPAPI_BASE=http://127.0.0.1:3041` + `CLIPAPI_KEY` set) and pasted ClipAPI’s captioned PASS URL. No fixture cue text. No scraper. Cues were not invented.

Confirmed ClipAPI **before** the site paste:

```text
GET /v1/transcript?url=https://www.tiktok.com/@rosssmith/video/6989607394561035525
HTTP 200  videoId=6989607394561035525  cues=6  creditsCharged=1
requestId=req_dfcffbb7-97ff-4c2d-bc22-5ac112f09cc0
sample: "what the heck" / "hey what is your deal man" / "come on man you've been riding me all day"
```

Then `LIVE_SMOKE_TIKTOK_URL=https://www.tiktok.com/@rosssmith/video/6989607394561035525 bash scripts/live-smoke.sh`:

```text
paste: PASS — HTTP 302 Location=/t/6989607394561035525
result: PASS — HTTP 200 data-state=success cues=6
paste=PASS result=PASS verdict=PASS
```

| Flow | Result | Proof |
|---|---|---|
| `GET /?url=` real TikTok URL → `/t/:id` | **PASS** | HTTP 302 `Location=/t/6989607394561035525` for `https://www.tiktok.com/@rosssmith/video/6989607394561035525` |
| `GET /t/:id` result page with live cue text | **PASS** | HTTP 200 `data-state="success"`; 6 `.cue` from live ClipAPI (`what the heck`, …); not fixture lecture/pasta strings |

Previous session on this branch (ClipAPI before the CDN caption fix) was honest **PASS-ERROR** `no_transcript` / 0 `.cue` on `@scout2015/video/6718335390845095173`. That is superseded: ClipAPI now returns captioned 200, and this page shows those live cues.

Missing-secret path (this session, no live ClipAPI required): unset `CLIPAPI_BASE` + `CLIPAPI_KEY` → `BLOCKED-SECRET: CLIPAPI_BASE CLIPAPI_KEY are unset or empty.` exit 2. Unset `CLIPAPI_KEY` only → `BLOCKED-SECRET: CLIPAPI_KEY`. Unset `CLIPAPI_BASE` only → `BLOCKED-SECRET: CLIPAPI_BASE`. `CI=true` → exit 1, does not paste.

`bash scripts/test.sh` stays the offline gate and must stay green without `CLIPAPI_BASE` / `CLIPAPI_KEY`. Live-smoke is not in CI.

## What this does not do

- Does not call TikTok or ClipAPI from `scripts/test.sh`.
- Does not set `CLIPAPI_BASE` / `CLIPAPI_KEY` in Docker or CI.
- Does not add a scraper fallback when ClipAPI is down.
- Does not invent caption lines.

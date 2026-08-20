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

Default paste URL is a public `@video` link (`https://www.tiktok.com/@scout2015/video/6718335390845095173`). Override with `LIVE_SMOKE_TIKTOK_URL`.

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

Re-ran `bash scripts/live-smoke.sh` on 2026-08-20 from `feat/live-smoke-captioned` against a **local live ClipAPI** (`CLIPAPI_LIVE=1`, `CLIPAPI_FIXTURE_ONLY` unset) on `http://127.0.0.1:3041`. This site started `node --import tsx src/server.ts` on loopback (`CLIPAPI_BASE` + `CLIPAPI_KEY` set) and pasted a real TikTok URL. No fixture cue text. No scraper.

ClipAPI still has **no captioned-transcript PASS** from this egress (live SSR returns empty `captionInfos` / `subtitleInfos` → `no_transcript`). `GET /t/:id` is therefore still `no_transcript`. This unit is **not 100%** until ClipAPI returns ≥1 live cue and this page shows that text.

| Flow | Result | Proof |
|---|---|---|
| `GET /?url=` real TikTok URL → `/t/:id` | **PASS** | HTTP 302 `Location=/t/6718335390845095173` for `https://www.tiktok.com/@scout2015/video/6718335390845095173` |
| `GET /t/:id` result page with live cue text | **PASS-ERROR** | HTTP 200 `data-state="no_transcript"`; 0 `.cue`; no invented lines |

Script printed `paste=PASS result=PASS-ERROR verdict=PASS` and exited 0.

Same ClipAPI box, same dedicated `ck_live_…` key (not committed):

| ClipAPI `GET /v1/transcript` | HTTP | code |
|---|---|---|
| `https://www.tiktok.com/@scout2015/video/6718335390845095173` | 422 | `no_transcript` (`req_10cec78a-e2c7-41d0-8598-5aba50b207d4`) |
| `https://www.tiktok.com/@rosssmith/video/7011618699945856262` | 422 | `no_transcript` (`req_9694635e-3bd6-4238-96af-876e4d98f79e`) |
| `https://www.tiktok.com/@dearmebeauty/video/6893431881816149250` | 422 | `no_transcript` (`req_92d0e70f-e14d-4cd1-8d1a-557c9c88335e`) |
| `https://www.tiktok.com/@tiktok_australia/video/6927466633946598658` | 422 | `no_transcript` (`req_b918c2d4-3524-41d2-bda2-1eeb27974e70`) |
| `https://www.tiktok.com/@nasa/video/7123456789012345678` | 404 | `not_found` |
| `https://www.tiktok.com/@khaby.lame/video/7132125479092292870` | 404 | `not_found` |

No captioned 200. Do not invent cues to force PASS.

Missing-secret path (this session, no live ClipAPI required): unset `CLIPAPI_BASE` + `CLIPAPI_KEY` → `BLOCKED-SECRET: CLIPAPI_BASE CLIPAPI_KEY are unset or empty.` exit 2. Unset `CLIPAPI_KEY` only → `BLOCKED-SECRET: CLIPAPI_KEY`. Unset `CLIPAPI_BASE` only → `BLOCKED-SECRET: CLIPAPI_BASE`. `CI=true` → exit 1, does not paste.

`bash scripts/test.sh` stays the offline gate and must stay green without `CLIPAPI_BASE` / `CLIPAPI_KEY`. ClipAPI’s own live smoke must PASS a captioned transcript before this unit can be 100%.

## What this does not do

- Does not call TikTok or ClipAPI from `scripts/test.sh`.
- Does not set `CLIPAPI_BASE` / `CLIPAPI_KEY` in Docker or CI.
- Does not add a scraper fallback when ClipAPI is down.
- Does not invent caption lines.

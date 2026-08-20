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

Ran `bash scripts/live-smoke.sh` on 2026-08-20 from `feat/live-smoke`. `CLIPAPI_BASE` and `CLIPAPI_KEY` were unset in the implementer environment. Required live flows were not run. No key was invented. No transcript was invented.

| Flow | Result |
|---|---|
| `GET /?url=` real TikTok URL → `/t/:id` | BLOCKED-SECRET |
| `GET /t/:id` result page with live cue text | BLOCKED-SECRET |

Script printed `BLOCKED-SECRET: CLIPAPI_BASE CLIPAPI_KEY are unset or empty.` and exited 2.

`bash scripts/test.sh` stays the offline gate and must stay green without these secrets. ClipAPI’s own live smoke must already PASS before this unit can be 100%.

## What this does not do

- Does not call TikTok or ClipAPI from `scripts/test.sh`.
- Does not set `CLIPAPI_BASE` / `CLIPAPI_KEY` in Docker or CI.
- Does not add a scraper fallback when ClipAPI is down.
- Does not invent caption lines.

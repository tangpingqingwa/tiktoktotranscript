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

Ran `bash scripts/live-smoke.sh` on 2026-08-20 from `feat/live-smoke-clipapi` against a **local live ClipAPI** (`CLIPAPI_LIVE=1`, `CLIPAPI_FIXTURE_ONLY` unset) on `http://127.0.0.1:3041`. This site started `node --import tsx src/server.ts` on loopback and pasted a real TikTok URL. No fixture cue text. No scraper.

ClipAPI itself still has no captioned-transcript PASS (live SSR returns empty `captionInfos` / `subtitleInfos` → `no_transcript`). This paste soak therefore cannot be 100% until ClipAPI returns ≥1 live cue.

| Flow | Result | Proof |
|---|---|---|
| `GET /?url=` real TikTok URL → `/t/:id` | **PASS** | HTTP 302 `Location=/t/6718335390845095173` for `https://www.tiktok.com/@scout2015/video/6718335390845095173` |
| `GET /t/:id` result page with live cue text | **PASS-ERROR** | HTTP 200 `data-state="no_transcript"`; 0 `.cue`; no invented lines |

Script printed `paste=PASS result=PASS-ERROR verdict=PASS` and exited 0.

Same ClipAPI box, same key, five public `@video` URLs all returned ClipAPI `422 no_transcript` (creditsCharged=0). No captioned 200. Do not invent cues to force PASS.

`bash scripts/test.sh` stays the offline gate and must stay green without `CLIPAPI_BASE` / `CLIPAPI_KEY`. ClipAPI’s own live smoke must PASS a captioned transcript before this unit can be 100%.

## What this does not do

- Does not call TikTok or ClipAPI from `scripts/test.sh`.
- Does not set `CLIPAPI_BASE` / `CLIPAPI_KEY` in Docker or CI.
- Does not add a scraper fallback when ClipAPI is down.
- Does not invent caption lines.

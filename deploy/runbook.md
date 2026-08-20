# TikTokToTranscript — CLIPAPI_BASE cutover runbook

Single Docker host. Caddy or nginx in front. This site has **no scraper**. It only calls ClipAPI `GET /v1/transcript`. If ClipAPI is down, the page shows the hard error (`clip_down`, HTTP 503). That is correct.

Do not point `CLIPAPI_BASE` at live ClipAPI until ClipAPI BUILD PR 5 is on its `main` and a smoke video works from staging (BUILD §10).

## Env

Copy [`.env.example`](../.env.example) to `/etc/tiktoktotranscript.env` (mode `600`). Set:

| Variable | Production |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | listen port (default `3000`) |
| `CLIPAPI_BASE` | live ClipAPI origin, e.g. `https://api.clipapi.dev` or `http://clipapi:3000` on the same box. No trailing slash needed. |
| `CLIPAPI_KEY` | dedicated ClipAPI service key for this site. High ceiling; alert at 80% daily spend. |
| `CLIPAPI_PUBLIC_ORIGIN` | footer CTA origin (`Need a TikTok Transcript API?` → `{origin}/#pricing`) |
| `PUBLIC_ORIGIN` | this site’s public https origin (canonical + sitemap) |
| `ADSENSE_CLIENT` | optional; leave unset until AdSense |

Do not bake secrets into the image. Do not commit `.env`. Leave `CLIPAPI_BASE` and `CLIPAPI_KEY` unset in CI. `scripts/test.sh` unsets them and talks only to `tests/fake-clip.ts`.

## Build and run

```bash
docker build -t tiktoktotranscript:local .
docker run -d --name tiktoktotranscript --restart unless-stopped --init \
  --env-file /etc/tiktoktotranscript.env \
  -p 127.0.0.1:3000:3000 \
  tiktoktotranscript:local
```

The process listens on `0.0.0.0:$PORT` as the non-root `node` user (uid 1000). Keep the published port on loopback and terminate TLS on Caddy or nginx.

No volume. No database. Transcript cache lives in ClipAPI.

## Health

`GET /healthz` → `200 {"ok":true}`. Process up only — it does **not** probe ClipAPI.

```bash
curl -fsS "http://127.0.0.1:${PORT:-3000}/healthz"
```

Homepage form:

```bash
curl -fsS "http://127.0.0.1:${PORT:-3000}/" | grep -F '<form'
```

## Point the site at a live ClipAPI box

1. Confirm ClipAPI `/healthz` is green on the target box and `CLIPAPI_LIVE=1` is already its operator problem, not this repo’s.
2. Confirm a smoke video against that ClipAPI box:

   ```bash
   curl -fsS -H "Authorization: Bearer $CLIPAPI_KEY" \
     "$CLIPAPI_BASE/v1/transcript?url=https://www.tiktok.com/@user/video/1234567890123456789"
   ```

   Expect `data.transcript` with ≥1 cue. Empty cues / `no_transcript` / `not_found` are valid ClipAPI answers, not a reason to scrape.
3. Set `CLIPAPI_BASE` to that origin and `CLIPAPI_KEY` to this site’s dedicated key.
4. Recreate the container. Submit the same URL on `/`. Expect `302` to `/t/:id` and indexable cue text.
5. If ClipAPI is unreachable, 502, or 503: the page is `clip_down` (friendly retry, noindex, no stack dump). Do **not** add a scraper. Do **not** invent lines.

Same-box layout (optional): run ClipAPI on another container and set `CLIPAPI_BASE=http://<clipapi-container>:3000`. Still send `Authorization: Bearer`.

## Roll back cutover

Unset `CLIPAPI_BASE` / `CLIPAPI_KEY` (or point `CLIPAPI_BASE` back at staging) and recreate. Without a key the client refuses network and the page stays `clip_down`. That is safer than a scraper.

Do not set `CLIPAPI_BASE` in the Dockerfile. Do not run live ClipAPI from CI.

#!/usr/bin/env bash
# Opt-in live ClipAPI paste smoke. Not called from scripts/test.sh or CI.
# Starts (or attaches to) a local process pointed at a live ClipAPI
# (CLIPAPI_BASE + CLIPAPI_KEY), then pastes a real TikTok URL and expects
# a result page. Never invents cue text. Missing secrets → BLOCKED-SECRET.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

blocked_secret() {
  echo "BLOCKED-SECRET: $*"
  echo "Required flows not run:"
  echo "  - GET /?url=<real TikTok URL> → 302 /t/:id"
  echo "  - GET /t/:id result page with live cue text"
  echo "Export CLIPAPI_BASE and CLIPAPI_KEY for a live ClipAPI box and re-run."
  echo "Do not invent a transcript. Do not scrape TikTok from this repo."
  exit 2
}

usage() {
  cat <<'EOF'
Usage: bash scripts/live-smoke.sh

Starts src/server.ts pointed at a live ClipAPI (CLIPAPI_BASE + CLIPAPI_KEY)
and pastes a real TikTok URL:

  GET /?url=<TikTok URL>   → 302 /t/:id when the id is known
  GET /t/:id               → result page with live cue text

Missing CLIPAPI_BASE or CLIPAPI_KEY prints BLOCKED-SECRET and exits 2.
Honest ClipAPI errors (no_transcript / not_found / clip_down) are PASS-ERROR.
Never invents lines. Not part of CI.

Env:
  CLIPAPI_BASE             live ClipAPI origin (required)
  CLIPAPI_KEY              dedicated ClipAPI service key (required)
  LIVE_SMOKE_TIKTOK_URL    paste URL (default a public @video URL)
  LIVE_SMOKE_BASE_URL      attach to an already-running local process
  LIVE_SMOKE_PORT          bind port when this script starts the server
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "${CI:-}" == "true" || "${GITHUB_ACTIONS:-}" == "true" ]]; then
  fail "live-smoke is opt-in and must not run in CI"
fi

missing=()
if [[ -z "${CLIPAPI_BASE:-}" ]]; then
  missing+=("CLIPAPI_BASE")
fi
if [[ -z "${CLIPAPI_KEY:-}" ]]; then
  missing+=("CLIPAPI_KEY")
fi
if [[ ${#missing[@]} -gt 0 ]]; then
  if [[ ${#missing[@]} -eq 1 ]]; then
    blocked_secret "${missing[0]} is unset or empty."
  else
    blocked_secret "${missing[*]} are unset or empty."
  fi
fi

if [[ ! -d node_modules ]]; then
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
fi

command -v curl >/dev/null || fail "curl is required"
command -v node >/dev/null || fail "node is required"

TIKTOK_URL="${LIVE_SMOKE_TIKTOK_URL:-https://www.tiktok.com/@scout2015/video/6718335390845095173}"
BASE_URL="${LIVE_SMOKE_BASE_URL:-}"
LIVE_SMOKE_BASE_URL="${LIVE_SMOKE_BASE_URL:-}"
started_server=0
pid=""
log=""
workdir="$(mktemp -d "${TMPDIR:-/tmp}/tiktoktotranscript-live-smoke.XXXXXX")"

cleanup() {
  if [[ "$started_server" -eq 1 && -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  rm -rf "$workdir"
}
trap cleanup EXIT

if [[ -n "$BASE_URL" ]]; then
  BASE_URL="${BASE_URL%/}"
  PORT="$(
    LIVE_SMOKE_PARSE_BASE="$BASE_URL" node --input-type=module -e '
      const raw = process.env.LIVE_SMOKE_PARSE_BASE ?? "";
      try {
        const url = new URL(raw);
        process.stdout.write(url.port || (url.protocol === "https:" ? "443" : "80"));
      } catch {
        process.exit(1);
      }
    '
  )" || fail "LIVE_SMOKE_BASE_URL is not a valid URL"
else
  if [[ -n "${LIVE_SMOKE_PORT:-}" ]]; then
    PORT="$LIVE_SMOKE_PORT"
  else
    PORT="$(node --input-type=module -e '
      import net from "node:net";
      const server = net.createServer();
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr === null || typeof addr === "string") process.exit(1);
        process.stdout.write(String(addr.port));
        server.close();
      });
    ')"
  fi
  BASE_URL="http://127.0.0.1:${PORT}"
fi

export CLIPAPI_BASE
export CLIPAPI_KEY
export PORT
export NODE_ENV="${NODE_ENV:-development}"

echo "== live-smoke (CLIPAPI_BASE paste) =="
echo "clipapi_base=${CLIPAPI_BASE} port=${PORT} url=${TIKTOK_URL}"

if [[ -z "${LIVE_SMOKE_BASE_URL:-}" ]]; then
  log="$workdir/server.log"
  echo "== start local process CLIPAPI_BASE set port=${PORT} =="
  node --import tsx src/server.ts >"$log" 2>&1 &
  pid=$!
  started_server=1

  ready=0
  for _ in $(seq 1 80); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "---- server log ----" >&2
      cat "$log" >&2 || true
      fail "server exited before /healthz"
    fi
    if curl -fsS --max-time 1 "${BASE_URL}/healthz" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 0.1
  done
  [[ "$ready" -eq 1 ]] || fail "server did not become ready on port ${PORT}"
fi

health="$(curl -sS -o "$workdir/health.json" -w "%{http_code}" --max-time 5 \
  "${BASE_URL}/healthz")"
[[ "$health" == "200" ]] || fail "/healthz returned HTTP ${health}"

encode_query() {
  LIVE_SMOKE_Q="$1" node --input-type=module -e '
    process.stdout.write(encodeURIComponent(process.env.LIVE_SMOKE_Q ?? ""));
  '
}

paste_http="$(
  curl -sS -D "$workdir/paste.headers" -o "$workdir/paste.html" -w "%{http_code}" \
    --connect-timeout 10 \
    --max-time 30 \
    "${BASE_URL}/?url=$(encode_query "$TIKTOK_URL")"
)" || fail "curl failed for GET /?url="

paste_location="$(
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const file = process.argv[1];
    const raw = readFileSync(file, "utf8");
    const match = raw.match(/^location:\s*(.+)\s*$/im);
    if (match) process.stdout.write(match[1].trim());
  ' "$workdir/paste.headers"
)" || true

note() {
  echo "$*"
}

paste_status="FAIL"
result_status="FAIL"
verdict="PASS"

if [[ "$paste_http" == "302" ]]; then
  if [[ "$paste_location" =~ ^/t/[0-9]{19}$ ]]; then
    paste_status="PASS"
    note "paste: PASS — HTTP 302 Location=${paste_location}"
    result_path="$paste_location"
  else
    note "paste: FAIL — HTTP 302 Location=${paste_location:-<missing>} (expected /t/:19-digit-id)"
    verdict="FAIL"
    result_path=""
  fi
elif [[ "$paste_http" == "200" || "$paste_http" == "404" || "$paste_http" == "503" ]]; then
  # Short links call ClipAPI first and may render the result without a 302.
  cp "$workdir/paste.html" "$workdir/result.html"
  result_path=""
  paste_status="PASS"
  note "paste: PASS — HTTP ${paste_http} (ClipAPI resolved without a numeric-id 302)"
else
  note "paste: FAIL — unexpected HTTP ${paste_http}"
  verdict="FAIL"
  result_path=""
fi

if [[ -n "$result_path" ]]; then
  result_http="$(
    curl -sS -o "$workdir/result.html" -w "%{http_code}" \
      --connect-timeout 10 \
      --max-time 30 \
      "${BASE_URL}${result_path}"
  )" || fail "curl failed for GET ${result_path}"
else
  result_http="$paste_http"
fi

analyze="$(
  LIVE_SMOKE_HTML="$workdir/result.html" LIVE_SMOKE_HTTP="$result_http" \
    node --input-type=module -e '
      import { readFileSync } from "node:fs";
      const file = process.env.LIVE_SMOKE_HTML;
      const http = process.env.LIVE_SMOKE_HTTP ?? "";
      if (!file) process.exit(2);
      const html = readFileSync(file, "utf8");
      const stateMatch = html.match(/data-state="([^"]+)"/);
      const state = stateMatch ? stateMatch[1] : "";
      const cues = [...html.matchAll(/class="cue"[^>]*>([\s\S]*?)<\/span>/g)].map((m) =>
        m[1].replace(/<[^>]+>/g, "").trim(),
      );
      const fixture = [
        "Welcome to today",
        "Chlorophyll absorbs",
        "Bienvenidos a la lección",
        "Boil water and salt it well",
        "Add pasta and cook until al dente",
      ];
      const leaked = cues.some((text) => fixture.some((bit) => text.includes(bit)));
      const stack = /at\s+\S+\s+\(.*:\d+:\d+\)|TypeError:|stack trace/i.test(html);
      const out = { http, state, cues: cues.length, leaked, stack };
      process.stdout.write(JSON.stringify(out));
    '
)" || fail "could not parse result HTML"

result_state="$(
  LIVE_SMOKE_ANALYZE="$analyze" node --input-type=module -e '
    const body = JSON.parse(process.env.LIVE_SMOKE_ANALYZE ?? "{}");
    process.stdout.write(String(body.state ?? ""));
  '
)"
result_cues="$(
  LIVE_SMOKE_ANALYZE="$analyze" node --input-type=module -e '
    const body = JSON.parse(process.env.LIVE_SMOKE_ANALYZE ?? "{}");
    process.stdout.write(String(body.cues ?? ""));
  '
)"
result_leaked="$(
  LIVE_SMOKE_ANALYZE="$analyze" node --input-type=module -e '
    const body = JSON.parse(process.env.LIVE_SMOKE_ANALYZE ?? "{}");
    process.stdout.write(body.leaked ? "1" : "0");
  '
)"
result_stack="$(
  LIVE_SMOKE_ANALYZE="$analyze" node --input-type=module -e '
    const body = JSON.parse(process.env.LIVE_SMOKE_ANALYZE ?? "{}");
    process.stdout.write(body.stack ? "1" : "0");
  '
)"

if [[ "$result_leaked" == "1" ]]; then
  note "result: FAIL — fixture cue text leaked; live ClipAPI is not on"
  verdict="FAIL"
elif [[ "$result_stack" == "1" ]]; then
  note "result: FAIL — stack trace rendered"
  verdict="FAIL"
elif [[ "$result_state" == "success" && "$result_http" == "200" ]]; then
  if [[ "$result_cues" == "0" || -z "$result_cues" ]]; then
    note "result: FAIL — success page has 0 cues (would be invented if we filled them)"
    verdict="FAIL"
  else
    result_status="PASS"
    note "result: PASS — HTTP 200 data-state=success cues=${result_cues}"
  fi
elif [[ "$result_state" == "no_transcript" && "$result_http" == "200" ]]; then
  result_status="PASS-ERROR"
  note "result: PASS-ERROR — HTTP 200 no_transcript (no lines invented)"
elif [[ "$result_state" == "not_found" && "$result_http" == "404" ]]; then
  result_status="PASS-ERROR"
  note "result: PASS-ERROR — HTTP 404 not_found (no lines invented)"
elif [[ "$result_state" == "clip_down" && "$result_http" == "503" ]]; then
  result_status="PASS-ERROR"
  note "result: PASS-ERROR — HTTP 503 clip_down (ClipAPI error; no lines invented)"
elif [[ "$result_state" == "invalid" && "$result_http" == "400" ]]; then
  result_status="PASS-ERROR"
  note "result: PASS-ERROR — HTTP 400 invalid (no lines invented)"
else
  note "result: FAIL — HTTP ${result_http} state=${result_state:-?} cues=${result_cues:-?}"
  verdict="FAIL"
fi

if [[ "$result_status" == "FAIL" && "$verdict" == "PASS" ]]; then
  verdict="FAIL"
fi
if [[ "$paste_status" == "FAIL" ]]; then
  verdict="FAIL"
fi

echo "== summary =="
echo "paste=${paste_status} result=${result_status} verdict=${verdict}"

if [[ "$verdict" != "PASS" ]]; then
  echo "---- paste body (head) ----" >&2
  head -c 2000 "$workdir/paste.html" >&2 || true
  echo >&2
  echo "---- result body (head) ----" >&2
  head -c 2000 "$workdir/result.html" >&2 || true
  echo >&2
  fail "live-smoke verdict=${verdict}"
fi

echo "OK: live CLIPAPI_BASE on; paste URL walked to a result page (no invented text)"

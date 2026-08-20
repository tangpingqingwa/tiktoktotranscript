#!/usr/bin/env bash
# Offline gate for main. Must exit 0 on a clean clone with no secrets.
# When application code lands, add unit/contract tests here. Do not delete the
# contract checks. Do not require live third-party networks.
# Live ClipAPI paste smoke is env-gated (CLIPAPI_BASE + CLIPAPI_KEY) and must
# not run here. scripts/live-smoke.sh is operator-only.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

echo "== contract files =="
for f in README.md SPEC.md BUILD.md CONTRIBUTING.md scripts/test.sh; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done

echo "== contributing rules are documented =="
grep -q 'main must always be buildable' CONTRIBUTING.md \
  || grep -q 'main` must always be buildable' CONTRIBUTING.md \
  || fail "CONTRIBUTING.md does not state the main-branch rule"

echo "== SPEC mentions git collaboration =="
grep -q 'Git collaboration' SPEC.md || fail "SPEC.md missing Git collaboration section"

echo "== no committed secrets =="
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git ls-files | grep -E '(^|/)\.env$|(^|/)id_rsa$|\.pem$|credentials\.json$' >/dev/null; then
    fail "secret-like path is tracked"
  fi
fi

echo "== markdown is UTF-8 text =="
file -b --mime-encoding README.md SPEC.md CONTRIBUTING.md | grep -qiE 'utf-8|us-ascii' \
  || fail "docs are not UTF-8/ASCII"

echo "== deploy artifacts (Dockerfile + CLIPAPI_BASE cutover) =="
[[ -f Dockerfile ]] || fail "missing Dockerfile"
[[ -f .env.example ]] || fail "missing .env.example"
[[ -f deploy/runbook.md ]] || fail "missing deploy/runbook.md"
grep -q 'node:22' Dockerfile || fail "Dockerfile must use Node 22"
grep -qE '^USER[[:space:]]+node$' Dockerfile || fail "Dockerfile must run as non-root USER node"
grep -q 'PORT' Dockerfile || fail "Dockerfile must honor PORT"
grep -q 'src/server.ts' Dockerfile || fail "Dockerfile must start src/server.ts"
if grep -E 'CLIPAPI_BASE[[:space:]]*=' Dockerfile >/dev/null; then
  fail "Dockerfile must not bake CLIPAPI_BASE (cutover is operator env)"
fi
if grep -E 'CLIPAPI_KEY[[:space:]]*=' Dockerfile >/dev/null; then
  fail "Dockerfile must not bake CLIPAPI_KEY"
fi
if [[ -f docker-compose.yml ]]; then
  fail "one-box deploy is Dockerfile only; do not add docker-compose"
fi
grep -q 'CLIPAPI_BASE' .env.example || fail ".env.example missing CLIPAPI_BASE"
grep -q 'CLIPAPI_KEY' .env.example || fail ".env.example missing CLIPAPI_KEY"
if grep -E '^[[:space:]]*CLIPAPI_BASE=' .env.example >/dev/null; then
  fail ".env.example must not default CLIPAPI_BASE on (leave commented until cutover)"
fi
if grep -E '^[[:space:]]*CLIPAPI_KEY=' .env.example >/dev/null; then
  fail ".env.example must not ship a CLIPAPI_KEY value"
fi
if grep -E 'ck_(live|test)_' .env.example >/dev/null; then
  fail ".env.example must not ship a real ClipAPI key"
fi
grep -q '/healthz' deploy/runbook.md || fail "runbook missing /healthz"
grep -q 'CLIPAPI_BASE' deploy/runbook.md || fail "runbook missing CLIPAPI_BASE cutover"
grep -q 'docker build' deploy/runbook.md || fail "runbook missing docker build"
grep -q 'docker run' deploy/runbook.md || fail "runbook missing docker run"
grep -q 'no scraper' deploy/runbook.md || fail "runbook must state there is no scraper"
if grep -qiE 'puppeteer|playwright|yt-dlp|tiktok-scraper|scrapy' \
  Dockerfile .env.example deploy/runbook.md; then
  fail "deploy artifacts must not mention a scraper"
fi
if [[ -f .github/workflows/ci.yml ]] && grep -E 'CLIPAPI_BASE' .github/workflows/ci.yml >/dev/null; then
  fail "CI must not set CLIPAPI_BASE; tests use tests/fake-clip.ts only"
fi
if grep -RInE 'live-smoke' .github >/dev/null 2>&1; then
  fail "CI must not run scripts/live-smoke.sh"
fi
if awk '
  /^[[:space:]]*(bash[[:space:]]+)?(\.\/)?scripts\/live-smoke\.sh([[:space:]]|$)/ { found=1 }
  END { exit found ? 0 : 1 }
' scripts/test.sh; then
  fail "scripts/test.sh must not invoke scripts/live-smoke.sh"
fi

echo "== live-smoke stays operator-only =="
[[ -f scripts/live-smoke.sh ]] || fail "missing scripts/live-smoke.sh"
[[ -x scripts/live-smoke.sh ]] || fail "scripts/live-smoke.sh must be executable"
[[ -f docs/live-smoke.md ]] || fail "missing docs/live-smoke.md"
grep -q 'BLOCKED-SECRET' scripts/live-smoke.sh || fail "live-smoke must print BLOCKED-SECRET when secrets are missing"
grep -q 'CLIPAPI_BASE' scripts/live-smoke.sh || fail "live-smoke must require CLIPAPI_BASE"
grep -q 'CLIPAPI_KEY' scripts/live-smoke.sh || fail "live-smoke must require CLIPAPI_KEY"
grep -q '/?url=' scripts/live-smoke.sh || fail "live-smoke must paste GET /?url="
grep -q 'CI' scripts/live-smoke.sh || fail "live-smoke must refuse CI"
# Attach URL is optional; an unbound LIVE_SMOKE_BASE_URL under set -u aborts before paste.
grep -q 'LIVE_SMOKE_BASE_URL:-' scripts/live-smoke.sh \
  || fail "live-smoke must default LIVE_SMOKE_BASE_URL under set -u"
grep -q 'This session' docs/live-smoke.md || fail "docs/live-smoke.md must record this session"
# Session table must be a real run (PASS / PASS-ERROR / BLOCKED-SECRET), not a template.
if ! grep -Eq 'PASS-ERROR|BLOCKED-SECRET|\*\*PASS\*\*' docs/live-smoke.md; then
  fail "docs/live-smoke.md must record this session's live verdict"
fi
if grep -qiE 'puppeteer|playwright|yt-dlp|tiktok-scraper|scrapy' scripts/live-smoke.sh docs/live-smoke.md; then
  fail "live-smoke must not add a scraper"
fi

if [[ -f package.json ]]; then
  echo "== install =="
  if [[ ! -d node_modules ]]; then
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi
  fi

  # Never inherit a live ClipAPI target. Tests use tests/fake-clip.ts only.
  # Live adapters stay env-gated and must not run in this script.
  unset CLIPAPI_BASE CLIPAPI_KEY CLIPAPI_PUBLIC_ORIGIN LIVE_SMOKE_BASE_URL LIVE_SMOKE_TIKTOK_URL

  echo "== tsc --noEmit =="
  npx tsc --noEmit

  echo "== SEO static files =="
  for f in public/robots.txt public/ads.txt src/views/legal.ts src/http/sitemap.ts; do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done
  grep -q 'Disallow: /?url=' public/robots.txt || fail "robots.txt must not index ?url= pages"
  grep -q 'google.com' public/ads.txt || fail "ads.txt missing placeholder publisher line"

  echo "== homepage form and healthz =="
  # Inject only — no listen, no TikTok / Reddit / Amazon / ClipAPI network.
  node --import tsx --input-type=module <<'TS'
import assert from "node:assert/strict";
import { buildApp } from "./src/server.ts";

const app = await buildApp();
try {
  const health = await app.inject({ method: "GET", url: "/healthz" });
  assert.equal(health.statusCode, 200, "GET /healthz status");
  assert.deepEqual(health.json(), { ok: true });

  const home = await app.inject({ method: "GET", url: "/" });
  assert.equal(home.statusCode, 200, "GET / status");
  assert.match(String(home.headers["content-type"] ?? ""), /text\/html/i);
  assert.match(home.body, /<form\b/i, "GET / must contain a form");
  assert.match(home.body, /name=["']url["']/i, "form must include url field");
  assert.match(home.body, /method=["']get["']/i, "form must GET");

  const id = "1234567890123456789";
  const redirected = await app.inject({
    method: "GET",
    url: `/?url=${encodeURIComponent(`https://www.tiktok.com/@user/video/${id}`)}`,
  });
  assert.equal(redirected.statusCode, 302, "GET /?url= known id status");
  assert.equal(redirected.headers.location, `/t/${id}`);

  const short = await app.inject({
    method: "GET",
    url: "/?url=" + encodeURIComponent("https://vm.tiktok.com/ZMxxxx/"),
  });
  assert.notEqual(short.statusCode, 302, "short link must not 302 to an invented id");
  assert.equal(short.headers.location, undefined);

  const privacy = await app.inject({ method: "GET", url: "/privacy" });
  assert.equal(privacy.statusCode, 200, "GET /privacy status");
  assert.match(String(privacy.headers["content-type"] ?? ""), /text\/html/i);
  assert.match(privacy.body, /no accounts/i);
  assert.match(privacy.body, /14 days/i);

  for (const path of ["/about", "/terms"]) {
    const page = await app.inject({ method: "GET", url: path });
    assert.equal(page.statusCode, 200, `GET ${path} status`);
  }

  const ads = await app.inject({ method: "GET", url: "/ads.txt" });
  assert.equal(ads.statusCode, 200, "GET /ads.txt status");
  assert.match(String(ads.headers["content-type"] ?? ""), /text\/plain/i);
  assert.match(ads.body, /google\.com/);

  const robotsTxt = await app.inject({ method: "GET", url: "/robots.txt" });
  assert.equal(robotsTxt.statusCode, 200, "GET /robots.txt status");
  assert.match(robotsTxt.body, /Disallow: \/\?url=/);

  const sitemap = await app.inject({ method: "GET", url: "/sitemap.xml" });
  assert.equal(sitemap.statusCode, 200, "GET /sitemap.xml status");
  assert.match(String(sitemap.headers["content-type"] ?? ""), /xml/i);
  assert.match(sitemap.body, /<urlset\b/);

  const appJs = await app.inject({ method: "GET", url: "/app.js" });
  assert.equal(appJs.statusCode, 200, "GET /app.js status");
  assert.match(appJs.body, /localStorage/);
  assert.match(appJs.body, /tiktoktotranscript:last5/);
} finally {
  await app.close();
}
TS

  echo "== language switch + last-5 (offline) =="
  [[ -f public/app.js ]] || fail "missing public/app.js"
  grep -q 'localStorage' public/app.js || fail "app.js must persist last 5 in localStorage"
  grep -q 'tiktoktotranscript:last5' public/app.js || fail "app.js missing last-5 storage key"
  grep -q 'Translator' public/app.js || fail "app.js must try the browser Translator API"
  grep -Eq '/t/.*\.' public/app.js || fail "app.js must navigate to /t/:id.:lang"
  grep -qi scrape public/app.js && fail "app.js must not mention a scraper"
  grep -q 'id="lang"' src/views/result.ts || fail "result view must include a language select"
  grep -q 'hreflang' src/views/result.ts || fail "result view must emit hreflang when ≥2 langs"
  grep -q 'id="last-five"' src/views/result.ts || fail "result view must host last-5 markup"
  grep -q '/t/:id.:lang' src/http/result.ts || fail "missing /t/:id.:lang route"

  echo "== node:test (offline) =="
  for f in tests/parse-url.test.ts tests/pages.test.ts tests/fake-clip.ts tests/sitemap.test.ts; do
    [[ -f "$f" ]] || fail "missing $f"
  done
  npx tsx --test --test-reporter=spec tests/parse-url.test.ts tests/pages.test.ts tests/sitemap.test.ts
fi

echo "OK: buildable and testable"

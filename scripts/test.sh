#!/usr/bin/env bash
# Offline gate for main. Must exit 0 on a clean clone with no secrets.
# When application code lands, add unit/contract tests here. Do not delete the
# contract checks. Do not require live third-party networks.
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
  unset CLIPAPI_BASE CLIPAPI_KEY CLIPAPI_PUBLIC_ORIGIN

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

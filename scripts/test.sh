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

  echo "== tsc --noEmit =="
  npx tsc --noEmit

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
} finally {
  await app.close();
}
TS

  echo "== node:test (offline) =="
  [[ -f tests/parse-url.test.ts ]] || fail "missing tests/parse-url.test.ts"
  npx tsx --test --test-reporter=spec tests/parse-url.test.ts
fi

echo "OK: buildable and testable"

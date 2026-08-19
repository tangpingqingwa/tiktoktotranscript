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
import { buildApp, HEALTHZ_PATH } from "./src/server.ts";

const app = await buildApp();
try {
  const health = await app.inject({ method: "GET", url: HEALTHZ_PATH });
  assert.equal(health.statusCode, 200, "GET /healthz status");
  assert.deepEqual(health.json(), { ok: true });

  const home = await app.inject({ method: "GET", url: "/" });
  assert.equal(home.statusCode, 200, "GET / status");
  assert.match(String(home.headers["content-type"] ?? ""), /text\/html/i);
  assert.match(home.body, /<form\b/i, "GET / must contain a form");
  assert.match(home.body, /name=["']url["']/i, "form must include url field");
  assert.match(home.body, /method=["']get["']/i, "form must GET");
} finally {
  await app.close();
}
TS
fi

echo "OK: buildable and testable"

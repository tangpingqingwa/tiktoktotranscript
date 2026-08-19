import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseUrl, resultPath } from "../src/parseUrl.js";
import { buildApp } from "../src/server.js";

const VIDEO_ID = "1234567890123456789";
const CANONICAL = `/t/${VIDEO_ID}`;

const ACCEPTED: Array<{ name: string; input: string }> = [
  {
    name: "www.tiktok.com/@user/video/{id}",
    input: `https://www.tiktok.com/@user/video/${VIDEO_ID}`,
  },
  {
    name: "tiktok.com/@user/video/{id}",
    input: `https://tiktok.com/@user/video/${VIDEO_ID}`,
  },
  {
    name: "http www host",
    input: `http://www.tiktok.com/@user/video/${VIDEO_ID}`,
  },
  {
    name: "schemeless www.tiktok.com",
    input: `www.tiktok.com/@user/video/${VIDEO_ID}`,
  },
  {
    name: "schemeless tiktok.com",
    input: `tiktok.com/@user/video/${VIDEO_ID}`,
  },
  {
    name: "trailing slash and query junk",
    input: `https://www.tiktok.com/@user.name/video/${VIDEO_ID}/?is_from_webapp=1&sender_device=pc`,
  },
  {
    name: "bare 19-digit id",
    input: VIDEO_ID,
  },
  {
    name: "bare id with surrounding whitespace",
    input: `  ${VIDEO_ID}  `,
  },
];

const SHORT_LINKS = [
  "https://www.tiktok.com/t/ZTxxxx/",
  "https://tiktok.com/t/ZTxxxx",
  "https://vm.tiktok.com/ZMxxxx/",
  "https://vm.tiktok.com/ZMxxxx",
  "www.tiktok.com/t/ZTxxxx/",
  "vm.tiktok.com/ZMxxxx/",
];

const REJECTED: Array<{ name: string; input: string; type: "empty" | "invalid" | "unsupported" }> =
  [
    { name: "empty", input: "", type: "empty" },
    { name: "whitespace only", input: "   ", type: "empty" },
    { name: "ftp", input: `ftp://www.tiktok.com/@user/video/${VIDEO_ID}`, type: "invalid" },
    { name: "javascript:", input: "javascript:alert(1)", type: "invalid" },
    {
      name: "javascript with tiktok path",
      input: `javascript:https://www.tiktok.com/@user/video/${VIDEO_ID}`,
      type: "invalid",
    },
    { name: "data:", input: "data:text/html,hi", type: "invalid" },
    { name: "not a url", input: "hello world", type: "invalid" },
    { name: "18-digit id", input: "123456789012345678", type: "invalid" },
    { name: "20-digit id", input: "12345678901234567890", type: "invalid" },
    {
      name: "youtube",
      input: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      type: "unsupported",
    },
    {
      name: "instagram",
      input: "https://www.instagram.com/p/abc123/",
      type: "unsupported",
    },
    {
      name: "lookalike host",
      input: `https://www.tiktok.com.evil.com/@user/video/${VIDEO_ID}`,
      type: "unsupported",
    },
    {
      name: "prefix host",
      input: `https://nottiktok.com/@user/video/${VIDEO_ID}`,
      type: "unsupported",
    },
    {
      name: "hyphenated lookalike",
      input: `https://evil-tiktok.com/@user/video/${VIDEO_ID}`,
      type: "unsupported",
    },
  ];

describe("parseUrl", () => {
  for (const { name, input } of ACCEPTED) {
    it(`accepts ${name}`, () => {
      assert.deepEqual(parseUrl(input), { type: "id", videoId: VIDEO_ID });
    });
  }

  for (const input of SHORT_LINKS) {
    it(`treats short link as unresolved: ${input}`, () => {
      const parsed = parseUrl(input);
      assert.equal(parsed.type, "short_link");
      if (parsed.type === "short_link") {
        assert.equal("videoId" in parsed, false);
        assert.match(parsed.url, /^https?:\/\//i);
        assert.doesNotMatch(parsed.url, /\/t\/\d{19}\b/);
      }
    });
  }

  for (const { name, input, type } of REJECTED) {
    it(`rejects ${name}`, () => {
      assert.equal(parseUrl(input).type, type);
    });
  }

  it("does not take a numeric id from a /t/ short path", () => {
    const parsed = parseUrl(`https://www.tiktok.com/t/${VIDEO_ID}/`);
    assert.equal(parsed.type, "short_link");
  });

  it("does not take a numeric id from vm.tiktok.com", () => {
    const parsed = parseUrl(`https://vm.tiktok.com/${VIDEO_ID}/`);
    assert.equal(parsed.type, "short_link");
  });

  it("resultPath is /t/:id", () => {
    assert.equal(resultPath(VIDEO_ID), CANONICAL);
  });
});

describe("GET /?url=", () => {
  it("302 to /t/:id when a numeric id is known", async () => {
    const app = await buildApp();
    try {
      for (const { name, input } of ACCEPTED) {
        const res = await app.inject({
          method: "GET",
          url: `/?url=${encodeURIComponent(input)}`,
        });
        assert.equal(res.statusCode, 302, name);
        assert.equal(res.headers.location, CANONICAL, name);
      }
    } finally {
      await app.close();
    }
  });

  it("does not invent an id for short links", async () => {
    const app = await buildApp();
    try {
      for (const input of SHORT_LINKS) {
        const res = await app.inject({
          method: "GET",
          url: `/?url=${encodeURIComponent(input)}`,
        });
        assert.notEqual(res.statusCode, 302, input);
        assert.equal(res.headers.location, undefined, input);
        assert.doesNotMatch(String(res.headers.location ?? ""), /^\/t\/\d+$/);
        assert.doesNotMatch(res.body, /\/t\/\d{19}/);
      }
    } finally {
      await app.close();
    }
  });

  it("400 on empty submit", async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({ method: "GET", url: "/?url=" });
      assert.equal(res.statusCode, 400);
      assert.match(String(res.headers["x-robots-tag"] ?? ""), /noindex/i);
    } finally {
      await app.close();
    }
  });

  it("400 on javascript: and non-http(s)", async () => {
    const app = await buildApp();
    try {
      for (const input of ["javascript:alert(1)", `ftp://www.tiktok.com/@user/video/${VIDEO_ID}`]) {
        const res = await app.inject({
          method: "GET",
          url: `/?url=${encodeURIComponent(input)}`,
        });
        assert.equal(res.statusCode, 400, input);
        assert.notEqual(res.headers.location, CANONICAL, input);
      }
    } finally {
      await app.close();
    }
  });

  it("does not redirect youtube or instagram", async () => {
    const app = await buildApp();
    try {
      for (const input of [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://www.instagram.com/p/abc123/",
      ]) {
        const res = await app.inject({
          method: "GET",
          url: `/?url=${encodeURIComponent(input)}`,
        });
        assert.equal(res.statusCode, 200, input);
        assert.equal(res.headers.location, undefined, input);
        assert.match(res.body, /Not a TikTok URL/);
      }
    } finally {
      await app.close();
    }
  });

  it("bare / still renders the form", async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({ method: "GET", url: "/" });
      assert.equal(res.statusCode, 200);
      assert.match(res.body, /<form\b/i);
    } finally {
      await app.close();
    }
  });
});

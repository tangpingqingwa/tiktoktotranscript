import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSuccessIndex,
  renderSitemapXml,
} from "../src/http/sitemap.js";

describe("in-memory success sitemap ring", () => {
  it("lists newest first and evicts past capacity", () => {
    const index = createSuccessIndex(2);
    index.remember("1111111111111111111", new Date("2026-01-01T00:00:00Z"));
    index.remember("2222222222222222222", new Date("2026-01-02T00:00:00Z"));
    index.remember("3333333333333333333", new Date("2026-01-03T00:00:00Z"));
    assert.deepEqual(index.list(), [
      { videoId: "3333333333333333333", lastmod: "2026-01-03" },
      { videoId: "2222222222222222222", lastmod: "2026-01-02" },
    ]);
  });

  it("forget removes an id so it is not serialized", () => {
    const index = createSuccessIndex();
    index.remember("1234567890123456789");
    index.forget("1234567890123456789");
    const xml = renderSitemapXml(index.list(), "https://tiktoktotranscript.test");
    assert.doesNotMatch(xml, /1234567890123456789/);
    assert.match(xml, /<urlset\b/);
  });
});

// gallery.test — DSL カタログ（build-gallery.mjs）の決定性・メタ判定・構造の軽量ガード
//
// レンダラー本体は snapshot.test 等で守られているので、ここでは「ギャラリーが render() を忠実に
// ラップし、コミット済み gallery/ と一致するか」「メタ（title/desc/tags/version）の導出」
// 「index.html の構造不変条件」を確認する。index 全体のバイト比較は UI 改変で壊れやすいので採らない。

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseStoryMeta, buildStory, renderIndexHtml } from "../scripts/build-gallery.mjs";
import { render } from "../scripts/render_repo_map.mjs";
import { readExample, readGallery } from "./_helpers.mjs";

const REL_A = "skills/notation-render/examples/example-a.dsl";

test("gallery: example-a regenerates byte-identical to live render and committed snapshot", () => {
  const dsl = readExample("example-a.dsl");
  const story = buildStory("example-a", dsl, REL_A);

  assert.equal(story.valid, true);
  // 忠実なラッパ: ライブ render と完全一致（emitter 変更があっても追従するので堅牢）。
  assert.equal(story.svg, render(dsl, "svg").output);
  assert.equal(story.html, render(dsl, "html", REL_A).output);
  // コミット済みギャラリースナップショットと一致（再生成で差分が出たら気づける）。
  assert.equal(story.svg, readGallery("example-a.svg"), "gallery/example-a.svg mismatch (rebuild if intended)");
  assert.equal(story.html, readGallery("example-a.html"), "gallery/example-a.html mismatch (rebuild if intended)");
});

test("parseStoryMeta: # story:/# desc: comments override; version & focus tag auto-derived", () => {
  const m = parseStoryMeta("example-b", readExample("example-b.dsl"));
  assert.equal(m.version, "repo-map v1");
  assert.equal(m.title, "1 サービスの深掘り（depth 2・9 ノード）");
  assert.ok(m.desc.length > 0);
  assert.ok(m.tags.includes("focus"));
  assert.ok(!m.tags.includes("invalid"));
});

test("parseStoryMeta: auto-fallback title/desc and layout tag (layout-demo)", () => {
  const m = parseStoryMeta("layout-demo", readExample("layout-demo.dsl"));
  assert.equal(m.title, "layout-demo"); // # story: なし → id フォールバック
  assert.ok(m.tags.includes("layout"));
  assert.ok(m.tags.includes("focus"));
  assert.match(m.desc, /\d+ nodes \/ \d+ edges/); // @meta からの自動要約
});

test("buildStory: invalid file -> invalid tag, no render, diagnostics text", () => {
  const story = buildStory("invalid", readExample("invalid.dsl"), "skills/notation-render/examples/invalid.dsl");
  assert.equal(story.valid, false);
  assert.ok(story.tags.includes("invalid"));
  assert.equal(story.svg, null);
  assert.equal(story.html, null);
  assert.match(story.diagnostics, /^error E-/m);
});

test("renderIndexHtml: deterministic, version-grouped, parseable data, invalid diagnostics", () => {
  const stories = [
    buildStory("example-a", readExample("example-a.dsl"), REL_A),
    buildStory("invalid", readExample("invalid.dsl"), "skills/notation-render/examples/invalid.dsl"),
  ];
  const html = renderIndexHtml(stories);

  assert.ok(html.includes("repo-map v1"), "version group heading present");
  assert.equal(renderIndexHtml(stories), html, "renderIndexHtml is deterministic");

  // 埋め込み JSON が取り出せて JSON.parse 可能（< は JSON のエスケープなのでそのまま parse 可）。
  const m = html.match(/<script type="application\/json" id="stories-data">([\s\S]*?)<\/script>/);
  assert.ok(m, "stories-data JSON blob present");
  const data = JSON.parse(m[1]);
  assert.equal(data["example-a"].valid, true);
  assert.equal(data["example-a"].svg, "example-a.svg");
  assert.equal(data["example-a"].html, "example-a.html");
  assert.equal(data["invalid"].valid, false);
  assert.equal(data["invalid"].svg, null);
  assert.ok(data["invalid"].diagnostics.includes("error E-"));
});

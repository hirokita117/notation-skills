// html_emitter.test — インタラクティブ Viewer ＋ ドラッグ（output-formats.md §2 / html-viewer-contract.md）

import { test } from "node:test";
import assert from "node:assert/strict";

import { parse } from "../scripts/parser.mjs";
import { computeLayout } from "../scripts/layout.mjs";
import { emitSvg } from "../scripts/svg_emitter.mjs";
import { emitHtml } from "../scripts/html_emitter.mjs";
import { readExample } from "./_helpers.mjs";

function htmlOf(name) {
  const rm = parse(readExample(name)).repoMap;
  return emitHtml(rm, computeLayout(rm));
}

test("same DSL -> same HTML (byte-equal); no NUL bytes", () => {
  const rm = parse(readExample("example-a.dsl")).repoMap;
  const L = computeLayout(rm);
  const h = emitHtml(rm, L);
  assert.equal(h, emitHtml(rm, L));
  assert.ok(!h.includes(String.fromCharCode(0)));
});

test("contract: fixed DOM ids, legend, buildPrompt, renderMarkdown, mode switch", () => {
  const h = htmlOf("example-a.dsl");
  for (const id of ['id="panel"', 'id="f-id"', 'id="f-edges"', 'id="f-excerpt"', 'id="btn-ask"',
    'id="btn-copy"', 'id="btn-reset"', 'id="btn-stop"', 'id="sel-model"', 'id="sel-effort"', 'id="stopped-overlay"']) {
    assert.ok(h.includes(id), `missing ${id}`);
  }
  assert.ok(h.includes(">datastore")); // 凡例
  assert.ok(h.includes("実線=構造（contains/deploys/owns）"));
  assert.ok(h.includes("function buildPrompt"));
  assert.ok(h.includes("あなたはローカルリポジトリ理解を支援するアシスタントです"));
  assert.ok(h.includes("function renderMarkdown"));
  assert.ok(h.includes('location.hostname === "127.0.0.1"'));
  assert.ok(h.includes('<svg class="diagram"'));
});

test("layout: diagram pane stacks above the full-width panel and is resizable", () => {
  const h = htmlOf("example-a.dsl");
  assert.ok(h.includes('<section class="diagram-section" aria-label="repo-map diagram">'));
  assert.ok(h.includes('    <div class="diagram-pane">'));
  assert.ok(h.indexOf('<section class="diagram-section"') < h.indexOf('<aside class="panel" id="panel">'));
  assert.ok(h.indexOf('<svg class="diagram"') < h.indexOf('<div class="legend">'));
  assert.ok(h.indexOf('<div class="legend">') < h.indexOf('<aside class="panel" id="panel">'));
  assert.ok(h.includes(".layout { display: flex; flex-direction: column;"));
  assert.ok(h.includes(".diagram-section { width: 100%; min-width: 0; }"));
  assert.ok(h.includes("resize: both; overflow: auto;"));
  assert.ok(h.includes(".panel { width: 100%; min-width: 0;"));
});

test("diagram canvas grows with pane resize and clamps dragged nodes inside it", () => {
  const h = htmlOf("example-a.dsl");
  assert.ok(h.includes('var diagramPane = document.querySelector(".diagram-pane");'));
  assert.ok(h.includes("function syncCanvasToPane()"));
  assert.ok(h.includes('svg.setAttribute("viewBox", "0 0 " + canvas.w + " " + canvas.h);'));
  assert.ok(h.includes('backgroundRect.setAttribute("width", String(canvas.w));'));
  assert.ok(h.includes('backgroundRect.setAttribute("height", String(canvas.h));'));
  assert.ok(h.includes("function clampNodePosition(x, y)"));
  assert.ok(h.includes("x: clamp(x, 0, Math.max(0, canvas.w - NODE_W))"));
  assert.ok(h.includes("y: clamp(y, 0, Math.max(0, canvas.h - NODE_H))"));
  assert.ok(h.includes("var next = clampNodePosition(Math.round(origX + dx), Math.round(origY + dy));"));
  assert.ok(!h.includes("syncCanvasToPane({ right: nx + NODE_W, bottom: ny + NODE_H });"));
  assert.ok(h.includes('typeof ResizeObserver !== "undefined"'));
  assert.ok(h.includes('window.addEventListener("resize", function () { syncCanvasToPane(); });'));
});

test("drag additions: edges carry data-from/to/rel + class=edge; nodes carry data-x/y; drag JS present", () => {
  const h = htmlOf("example-a.dsl");
  const lines = h.match(/<line class="edge"[^>]*><\/line>/g) || [];
  assert.equal(lines.length, 12);
  for (const ln of lines) {
    assert.ok(ln.includes("data-from=") && ln.includes("data-to=") && ln.includes("data-rel="), ln);
  }
  const nodes = h.match(/<g class="node"[^>]*>/g) || [];
  assert.equal(nodes.length, 8);
  for (const g of nodes) assert.ok(g.includes("data-x=") && g.includes("data-y="), g);
  assert.ok(h.includes("function wireNode("));
  assert.ok(h.includes('addEventListener("pointerdown"'));
  assert.ok(h.includes("getScreenCTM")); // ズーム耐性のための座標変換
});

test("embedded SVG node block is byte-identical to standalone SVG node block", () => {
  const rm = parse(readExample("example-a.dsl")).repoMap;
  const L = computeLayout(rm);
  const svg = emitSvg(rm, L);
  const html = emitHtml(rm, L);
  const block = (s) => s.match(/<g class="node" data-node-id="core"[\s\S]*?<\/g>/)[0];
  assert.equal(block(html), block(svg));
});

test("sourcePath embeds data-repo-map-dsl on <html> and stays deterministic", () => {
  const rm = parse(readExample("example-a.dsl")).repoMap;
  const L = computeLayout(rm);
  const h = emitHtml(rm, L, { sourcePath: "/repo/docs/repo-map.dsl" });
  assert.ok(h.includes('<html lang="ja" data-repo-map-dsl="/repo/docs/repo-map.dsl">'), "html attr");
  assert.ok(h.includes("repo-map DSL file:"), "prompt line literal present");
  assert.equal(h, emitHtml(rm, L, { sourcePath: "/repo/docs/repo-map.dsl" })); // 同入力→同出力
});

test("no sourcePath: <html> has no data-repo-map-dsl attribute, but buildPrompt still has the line + bullets", () => {
  const h = htmlOf("example-a.dsl");
  // `data-repo-map-dsl="` は実属性のときだけ現れる（SCRIPT の getAttribute("data-repo-map-dsl") は `="` を含まない）
  assert.ok(!h.includes('data-repo-map-dsl="'), "no <html> attribute when sourcePath omitted");
  assert.ok(h.includes('<html lang="ja">'), "bare html tag");
  assert.ok(h.includes("repo-map DSL file:"), "prompt line literal");
  assert.ok(h.includes("repo-map DSL file が指定されているときは"), "guidance bullet 1");
  assert.ok(h.includes("DSL ファイルパスが未指定のときは excerpt を正としてください"), "guidance bullet 2");
});

test("sourcePath is attribute-escaped via encodeAttr", () => {
  const rm = parse(readExample("example-a.dsl")).repoMap;
  const L = computeLayout(rm);
  const h = emitHtml(rm, L, { sourcePath: 'a"b<c\nd' });
  assert.ok(h.includes('data-repo-map-dsl="a&quot;b&lt;c&#10;d"'), "escaped attribute value");
});

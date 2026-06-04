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

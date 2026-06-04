// svg_emitter.test — HTML が埋め込む内部インライン SVG 基盤（html-viewer-contract.md / theme.md）

import { test } from "node:test";
import assert from "node:assert/strict";

import { parse } from "../scripts/parser.mjs";
import { computeLayout } from "../scripts/layout.mjs";
import { emitSvg } from "../scripts/svg_emitter.mjs";
import { truncateLabel } from "../scripts/theme.mjs";
import { readExample } from "./_helpers.mjs";

function svgOf(name) {
  const rm = parse(readExample(name)).repoMap;
  return emitSvg(rm, computeLayout(rm));
}

test("same DSL -> same SVG string (byte-equal)", () => {
  const rm = parse(readExample("example-a.dsl")).repoMap;
  const L = computeLayout(rm);
  assert.equal(emitSvg(rm, L), emitSvg(rm, L));
});

test("structure: marker, edges before nodes, node transform, kind fill, data-* encoding", () => {
  const svg = svgOf("example-a.dsl");
  assert.ok(svg.includes('<marker id="arrow"'));
  assert.ok(svg.indexOf("<line ") < svg.indexOf('<g class="node"'), "edges drawn before nodes");
  assert.ok(/<g class="node"[^>]*transform="translate\(/.test(svg));
  assert.ok(svg.includes('fill="#1F2937"')); // system fill (monorepo)
  assert.ok(svg.includes('data-related-edges="monorepo web contains&#10;')); // 改行 -> &#10;
  assert.ok(svg.includes("&quot;Shared Core&quot;")); // 引用 -> &quot;
  assert.ok(svg.startsWith("<svg "));
  assert.ok(svg.includes('viewBox="0 0 1008 336"'));
});

test("focus frame present iff meta.focus", () => {
  assert.ok(svgOf("example-a.dsl").includes('class="focus-frame"')); // focus: core
  const rm = parse("# repo-map v1\n@meta\n  root: .\n  depth: 1\n  generated: 2026-01-01T00:00:00Z\n@nodes\n  a system A\n@edges\n").repoMap;
  assert.ok(!emitSvg(rm, computeLayout(rm)).includes("focus-frame"));
});

test("label truncation is pure and appends ellipsis", () => {
  const long = "これは非常に長いラベルでありボックス幅を確実に超えるはずのテキストです";
  assert.equal(truncateLabel(long), truncateLabel(long));
  assert.ok(truncateLabel(long).endsWith("…"));
  assert.equal(truncateLabel("short"), "short");
});

test("integer coordinate formatting (no decimals except fixed 1.5 / 4 3)", () => {
  let svg = svgOf("example-a.dsl");
  // 固定テーマ定数の小数（座標ではない）は除外して検査する
  svg = svg.replace(/stroke-width="1\.5"/g, "").replace(/opacity="0\.8"/g, "");
  assert.ok(!/\d\.\d/.test(svg), "no stray decimal coordinates");
});

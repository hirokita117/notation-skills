// document_map.test — document-map v1 の版選択・列挙・分類・depth×kind・決定性
//
// repo-map との分離（版をまたいで kind/relation を取り違えない）と、document-map 固有の
// 階層分類（contains のみ実線）・scope メタキー（source）・depth×kind を確認する。
// 共有の行文法・座標計算は repo-map のテスト群が守るので、ここでは差分だけを見る。

import { test } from "node:test";
import assert from "node:assert/strict";

import { parse } from "../scripts/parser.mjs";
import { computeLayout } from "../scripts/layout.mjs";
import { render, toJson } from "../scripts/render_repo_map.mjs";
import { codes, hasCode } from "./_helpers.mjs";

// 最小の有効な document-map ドキュメントを組む。
function dm(nodes, edges = "", layout = "", depth = 1) {
  let s = `# document-map v1\n@meta\n  source: docs/x.md\n  depth: ${depth}\n  generated: 2026-01-01T00:00:00Z\n`;
  s += "\n@nodes\n" + nodes.trim().split("\n").map((l) => "  " + l.trim()).join("\n") + "\n";
  s += "\n@edges\n";
  if (edges.trim()) s += edges.trim().split("\n").map((l) => "  " + l.trim()).join("\n") + "\n";
  if (layout.trim()) s += "\n@layout\n" + layout.trim().split("\n").map((l) => "  " + l.trim()).join("\n") + "\n";
  return s;
}

test("version dispatch: document-map v1 selects the document profile", () => {
  const { repoMap, profile, fatal } = parse(dm("d document D"));
  assert.equal(fatal, false);
  assert.equal(repoMap.version, "document-map v1");
  assert.equal(profile.family, "document-map");
  assert.equal(profile.scopeKey, "source");
});

test("version dispatch: document-map v2 -> E-BADVERSION; unknown header -> E-NOVERSION", () => {
  assert.ok(hasCode("# document-map v2\n@meta\n  source: x\n", "E-BADVERSION"));
  assert.ok(hasCode("# notation v1\n@meta\n  source: x\n", "E-NOVERSION"));
});

test("kind isolation: document kinds accepted; repo-map kinds rejected", () => {
  // document-map の 9 kind は通る
  assert.ok(!codes(dm("a document A\n  b section B\n  c concept C\n  r requirement R\n  d decision D\n  q open-question Q\n  k risk K\n  ac actor AC\n  ex external EX", "a b contains", "", 2)).includes("E-BADKIND"));
  // repo-map 専用 kind は document-map では未知
  assert.ok(hasCode(dm("a package A"), "E-BADKIND"));
  assert.ok(hasCode(dm("a module A"), "E-BADKIND"));
});

test("relation isolation: document relations accepted; repo-map-only relations rejected", () => {
  const ok = dm("a section A\n  b open-question B", "a b raises");
  assert.ok(!codes(ok).includes("E-BADREL"));
  // imports/calls/reads/deploys は document-map にない
  assert.ok(hasCode(dm("a section A\n  b concept B", "a b imports"), "E-BADREL"));
  // 9 relation すべて通る
  const all = dm(
    "a document A\n  b section B\n  c concept C\n  d decision D\n  q open-question Q\n  k risk K\n  ac actor AC\n  ex external EX\n  r requirement R",
    "a b contains\n  b c explains\n  r r2 depends-on\n  d q decides\n  b q raises\n  d k mitigates\n  ac b owns\n  c ex references\n  d d2 conflicts-with",
    "", 2,
  );
  // r2/d2 を定義に足す版で BADREL が出ないことだけ確認（未定義参照 E-EDGEREF は別物）
  assert.ok(!codes(all).includes("E-BADREL"));
});

test("scope meta key: source required; root is unknown in document-map", () => {
  assert.ok(hasCode("# document-map v1\n@meta\n  root: .\n  depth: 1\n  generated: 2026-01-01T00:00:00Z\n@nodes\n  a document A\n", "E-BADMETAKEY"));
  assert.ok(hasCode("# document-map v1\n@meta\n  depth: 1\n  generated: 2026-01-01T00:00:00Z\n@nodes\n  a document A\n", "E-METAMISSING")); // source 欠落
});

test("depth x kind: requirement warns at depth 1, fine at depth 2", () => {
  assert.ok(hasCode(dm("s section S\n  r requirement R", "s r contains", "", 1), "W-DEPTHEXCEED"));
  assert.ok(!codes(dm("s section S\n  r requirement R", "s r contains", "", 2)).includes("W-DEPTHEXCEED"));
  // depth 0 は concept/decision 等が細かすぎ
  assert.ok(hasCode(dm("d document D\n  c concept C", "d c contains", "", 0), "W-DEPTHEXCEED"));
});

test("hierarchy classification: only contains is solid (rank-bearing); owns is dashed", () => {
  const model = parse(dm("doc document D\n  sec section S\n  pm actor PM", "doc sec contains\n  pm sec owns")).repoMap;
  const layout = computeLayout(model);
  const byRel = Object.fromEntries(layout.edges.map((e) => [e.relation, e.dashed]));
  assert.equal(byRel.contains, false, "contains is solid");
  assert.equal(byRel.owns, true, "owns is dashed (dependency)");
  // contains が縦ランクを作る: doc(0) -> sec(1)
  assert.equal(layout.nodes.get("doc").rank, 0);
  assert.equal(layout.nodes.get("sec").rank, 1);
});

test("toJson emits meta.source (not root) and version document-map v1", () => {
  const json = JSON.parse(render(dm("a document A"), "json").output);
  assert.equal(json.version, "document-map v1");
  assert.equal(json.meta.source, "docs/x.md");
  assert.equal(json.meta.root, undefined);
});

test("determinism: same document-map DSL -> same html/json (byte-equal)", () => {
  const src = dm("doc document D\n  sec section S\n  c concept C", "doc sec contains\n  sec c contains");
  assert.equal(render(src, "html").output, render(src, "html").output);
  assert.equal(render(src, "json").output, render(src, "json").output);
});

test("html carries document-map chrome (title/legend/buildPrompt), not repo-map", () => {
  const h = render(dm("doc document D\n  sec section S", "doc sec contains"), "html").output;
  assert.ok(h.includes("document-map v1 — interactive viewer"));
  assert.ok(h.includes("実線=構成（contains）"));
  assert.ok(h.includes("あなたはローカルドキュメント理解を支援するアシスタントです"));
  assert.ok(h.includes('aria-label="document-map diagram"'));
  assert.ok(!h.includes("あなたはローカルリポジトリ理解を支援するアシスタントです"));
});

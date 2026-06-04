// validator.test — 検証規則（grammar.md §7）

import { test } from "node:test";
import assert from "node:assert/strict";

import { hasCode, codes, allDiagnostics, doc } from "./_helpers.mjs";
import { formatDiagnostics } from "../scripts/diagnostics.mjs";

// --- バージョン / セクション ---
test("E-NOVERSION / E-BADVERSION", () => {
  assert.ok(hasCode("@meta\n  root: .\n", "E-NOVERSION"));
  assert.ok(hasCode("# repo-map v2\n@meta\n", "E-BADVERSION"));
});

test("E-ORDER / E-DUPSECTION / E-BADSECTION / E-EMPTYNODES", () => {
  assert.ok(hasCode("# repo-map v1\n@nodes\n  a system A\n@meta\n  root: .\n", "E-ORDER"));
  assert.ok(hasCode("# repo-map v1\n@meta\n  root: .\n  depth: 0\n  generated: 2026-01-01T00:00:00Z\n@nodes\n  a system A\n@meta\n  root: .\n", "E-DUPSECTION"));
  assert.ok(hasCode("# repo-map v1\n@meta\n  root: .\n@bogus\n  x\n", "E-BADSECTION"));
  assert.ok(hasCode("# repo-map v1\n@meta\n  root: .\n  depth: 0\n  generated: 2026-01-01T00:00:00Z\n@nodes\n@edges\n", "E-EMPTYNODES"));
});

// --- meta ---
test("E-DEPTHVAL / E-DUPMETA / E-BADMETAKEY / E-METAMISSING / E-METASYNTAX / E-FOCUSREF", () => {
  assert.ok(hasCode(doc("a system A").replace("depth: 2", "depth: 3"), "E-DEPTHVAL"));
  assert.ok(hasCode("# repo-map v1\n@meta\n  root: .\n  root: x\n  depth: 0\n  generated: 2026-01-01T00:00:00Z\n@nodes\n  a system A\n", "E-DUPMETA"));
  assert.ok(hasCode("# repo-map v1\n@meta\n  bogus: x\n@nodes\n  a system A\n", "E-BADMETAKEY"));
  assert.ok(hasCode("# repo-map v1\n@meta\n  root: .\n@nodes\n  a system A\n", "E-METAMISSING")); // depth/generated 欠落
  assert.ok(hasCode("# repo-map v1\n@meta\n  rootnocolon\n@nodes\n  a system A\n", "E-METASYNTAX"));
  assert.ok(hasCode("# repo-map v1\n@meta\n  root: .\n  depth: 0\n  focus: ghost\n  generated: 2026-01-01T00:00:00Z\n@nodes\n  a system A\n", "E-FOCUSREF"));
});

// --- nodes ---
test("E-DUPID / E-IDLEN / E-BADID / E-BADKIND", () => {
  assert.ok(hasCode(doc("a system A\na package B"), "E-DUPID"));
  assert.ok(hasCode(doc(("x".repeat(65)) + " system A"), "E-IDLEN"));
  assert.ok(hasCode(doc("bad/id system A"), "E-BADID"));
  assert.ok(hasCode(doc("a bogus A"), "E-BADKIND"));
});

// --- edges ---
test("E-EDGEARITY / E-EDGEREF / E-BADREL / E-SELFEDGE", () => {
  assert.ok(hasCode(doc("a system A\nb package B", "a b"), "E-EDGEARITY"));
  assert.ok(hasCode(doc("a system A", "a ghost imports"), "E-EDGEREF")); // 未定義ノード参照（必須ケース）
  assert.ok(hasCode(doc("a system A\nb package B", "a b bogus"), "E-BADREL"));
  assert.ok(hasCode(doc("a system A", "a a contains"), "E-SELFEDGE"));
});

// --- layout ---
test("E-LAYOUTREF / E-LAYOUTSEM / E-LAYOUTDUP", () => {
  assert.ok(hasCode(doc("a system A", "", "ghost rank=1"), "E-LAYOUTREF"));
  assert.ok(hasCode(doc("a system A", "", "a color=red"), "E-LAYOUTSEM"));
  assert.ok(hasCode(doc("a system A", "", "a rank=1\na rank=2"), "E-LAYOUTDUP"));
});

// --- 規模上限 ---
test("E-MAXNODES / E-MAXEDGES", () => {
  const manyNodes = Array.from({ length: 41 }, (_, i) => `n${i} package P`).join("\n");
  assert.ok(hasCode(doc(manyNodes), "E-MAXNODES"));
  // 81 エッジ（10 ノード間の重複辺で水増し）
  const nodes = Array.from({ length: 10 }, (_, i) => `n${i} package P`).join("\n");
  const edges = Array.from({ length: 81 }, () => "n0 n1 imports").join("\n");
  assert.ok(hasCode(doc(nodes, edges), "E-MAXEDGES"));
});

// --- 警告 ---
test("warnings: W-DUPEDGE / W-DEPTHEXCEED / W-ORPHAN / W-CYCLE / W-DATEFMT / W-CASECLASH / W-CHAR / W-PATHSPACE", () => {
  assert.ok(hasCode(doc("a system A\nb package B", "a b imports\na b imports"), "W-DUPEDGE"));
  // depth 0 で module は細かすぎ
  const depth0 = "# repo-map v1\n@meta\n  root: .\n  depth: 0\n  generated: 2026-01-01T00:00:00Z\n@nodes\n  a system A\n  m module M\n@edges\n  a m contains\n";
  assert.ok(codes(depth0).includes("W-DEPTHEXCEED"));
  assert.ok(hasCode(doc("a system A\nb package B"), "W-ORPHAN")); // b は孤立
  assert.ok(hasCode(doc("a system A\nb package B\nc package C", "a b contains\nb c contains\nc a contains"), "W-CYCLE"));
  assert.ok(hasCode("# repo-map v1\n@meta\n  root: .\n  depth: 0\n  generated: not-a-date\n@nodes\n  a system A\n", "W-DATEFMT"));
  assert.ok(hasCode(doc("apiGw system A\napigw package B", "apiGw apigw contains"), "W-CASECLASH"));
  assert.ok(hasCode(doc("a system\tA pkg/a"), "W-CHAR"));
  assert.ok(hasCode("# repo-map v1\n@meta\n  root: a b\n  depth: 0\n  generated: 2026-01-01T00:00:00Z\n@nodes\n  a system A\n", "W-PATHSPACE"));
});

// --- 決定的な診断順（line 昇順 → 全体検査 → code アルファベット） ---
test("diagnostic ordering is deterministic", () => {
  // depth 不正(line5) + 未定義参照(line ?) + 重複辺(後) + 孤立 等
  const t = doc("a system A\nb package B\nb package C", "a ghost imports\na b imports\na b imports");
  const list = allDiagnostics(t);
  // 行付きが先（line 昇順）、全体検査（line=null）が後
  let seenWhole = false;
  let lastLine = -1;
  for (const d of list) {
    if (d.line == null) { seenWhole = true; }
    else {
      assert.equal(seenWhole, false, "line-attributed diagnostics must precede whole-doc ones");
      assert.ok(d.line >= lastLine, "lines must be ascending");
      lastLine = d.line;
    }
  }
  // 二度実行して同一順
  assert.equal(formatDiagnostics(allDiagnostics(t)), formatDiagnostics(allDiagnostics(t)));
});

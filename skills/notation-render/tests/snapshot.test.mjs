// snapshot.test — コミット済み期待出力とのバイト一致（回帰ガード）
//
// 決定性 = 二度生成して等しい。正しさ = コミット済みスナップショットと等しい。
// スナップショットの再生成は意図的なレビュー対象（examples/*.html|json を更新したら差分で気づく）。

import { test } from "node:test";
import assert from "node:assert/strict";

import { render, formatDiagnostics } from "../scripts/render_repo_map.mjs";
import { readExample } from "./_helpers.mjs";

function expectSnapshot(dsl, fmt, snapshotName) {
  const out = render(readExample(dsl), fmt);
  assert.equal(out.ok, true, `${dsl} should render`);
  assert.equal(out.output, readExample(snapshotName), `${snapshotName} mismatch (regenerate if intended)`);
}

test("example-a snapshots (html/json) are byte-stable", () => {
  expectSnapshot("example-a.dsl", "html", "example-a.html");
  expectSnapshot("example-a.dsl", "json", "example-a.json");
});

test("layout-demo snapshots (json) are byte-stable", () => {
  expectSnapshot("layout-demo.dsl", "json", "layout-demo.json");
});

test("invalid.dsl produces the committed diagnostics", () => {
  const r = render(readExample("invalid.dsl"), "json");
  assert.equal(r.ok, false);
  assert.equal(formatDiagnostics(r.diagnostics), readExample("invalid.diagnostics.txt"));
});

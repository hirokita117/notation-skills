// cli.test — render() 純関数 ＋ CLI（render_repo_map.mjs）の振る舞い

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { render, toJson } from "../scripts/render_repo_map.mjs";
import { readExample, examplesDir, cliPath } from "./_helpers.mjs";

const validDsl = readExample("example-a.dsl");
const invalidDsl = readExample("invalid.dsl");

test("render(valid, html) -> ok, output starts with <!DOCTYPE html", () => {
  const r = render(validDsl, "html");
  assert.equal(r.ok, true);
  assert.ok(r.output.startsWith("<!DOCTYPE html"));
});

test("render(invalid, html) -> not ok, empty output, diagnostics present", () => {
  const r = render(invalidDsl, "html");
  assert.equal(r.ok, false);
  assert.equal(r.output, "");
  assert.ok(r.diagnostics.some((d) => d.severity === "error"));
  assert.ok(r.diagnostics.some((d) => d.code === "E-EDGEREF")); // 未定義ノード参照
});

test("--format json: parseable, nodes in source order, deterministic", () => {
  const a = render(validDsl, "json");
  const b = render(validDsl, "json");
  assert.equal(a.output, b.output); // 決定的
  const model = JSON.parse(a.output);
  assert.equal(model.version, "repo-map v1");
  assert.deepEqual(model.nodes.slice(0, 2).map((n) => n.id), ["monorepo", "web"]);
  assert.equal(model.edges.length, 12);
});

test("warnings are reported but do not block (ok stays true)", () => {
  // 孤立ノード（W-ORPHAN）はあるが error ではない
  const dsl = "# repo-map v1\n@meta\n  root: .\n  depth: 1\n  generated: 2026-01-01T00:00:00Z\n@nodes\n  a system A\n  b package B\n@edges\n";
  const r = render(dsl, "html");
  assert.equal(r.ok, true);
  assert.ok(r.diagnostics.some((d) => d.code === "W-ORPHAN"));
});

// --- CLI（実プロセス） ---
function runCli(args, input) {
  return spawnSync(process.execPath, [cliPath, ...args], { input, encoding: "utf8" });
}

test("CLI exit codes: valid=0, invalid=1, bad-format=2", () => {
  const ok = runCli([join(examplesDir, "example-a.dsl"), "--format", "html"]);
  assert.equal(ok.status, 0);
  assert.ok(ok.stdout.startsWith("<!DOCTYPE html"));

  const bad = runCli([join(examplesDir, "invalid.dsl"), "--format", "html"]);
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, "");
  assert.ok(bad.stderr.includes("error E-"));

  const usage = runCli([join(examplesDir, "example-a.dsl"), "--format", "png"]);
  assert.equal(usage.status, 2);
});

test("CLI reads stdin via '-'", () => {
  const r = runCli(["-", "--format", "json"], validDsl);
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).nodes.length, 8);
});

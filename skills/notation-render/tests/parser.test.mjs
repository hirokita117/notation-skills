// parser.test — 字句・構文（grammar.md §1–§3）

import { test } from "node:test";
import assert from "node:assert/strict";

import { parse } from "../scripts/parser.mjs";
import { readExample, codes, hasCode, doc } from "./_helpers.mjs";

test("valid Example A parses with no errors, source order preserved", () => {
  const { repoMap, diagnostics, fatal } = parse(readExample("example-a.dsl"));
  assert.equal(fatal, false);
  assert.equal(repoMap.nodes.size, 8);
  assert.equal(repoMap.edges.length, 12);
  assert.deepEqual(repoMap.meta, { root: ".", depth: 1, focus: "core", generated: "2026-06-03T09:00:00Z" });
  assert.equal(repoMap.layout.size, 0);
  // 挿入順 = ソース順
  assert.deepEqual([...repoMap.nodes.keys()].slice(0, 3), ["monorepo", "web", "mobile"]);
  // quoted label / path
  assert.deepEqual(repoMap.nodes.get("web"), { id: "web", kind: "package", label: "Web App", path: "apps/web" });
  // path 無し
  assert.equal(repoMap.nodes.get("monorepo").path, undefined);
  // edge index = ソース順
  assert.equal(repoMap.edges[0].index, 0);
  assert.equal(repoMap.edges[11].relation, "calls");
  assert.equal(diagnostics.length, 0);
});

test("quoted label spans spaces; backslash escapes; unclosed quote -> E-QUOTE", () => {
  const ok = parse(doc('a package "Foo \\"Bar\\" Baz" pkg/a'));
  assert.equal(ok.repoMap.nodes.get("a").label, 'Foo "Bar" Baz');
  assert.equal(ok.repoMap.nodes.get("a").path, "pkg/a");
  assert.ok(hasCode(doc('a package "Unclosed'), "E-QUOTE"));
});

test("§3.5 label/path arity", () => {
  // bare 1-word label + path
  assert.equal(parse(doc("a package core pkg/a")).repoMap.nodes.get("a").label, "core");
  // bare multi-word label -> E-NODEARITY
  assert.ok(hasCode(doc("a package Web Frontend apps/web"), "E-NODEARITY"));
  // quoted label + 2 trailing -> E-NODEARITY
  assert.ok(hasCode(doc('a package "Web" b c'), "E-NODEARITY"));
  // missing label -> E-NODEARITY
  assert.ok(hasCode(doc("a package"), "E-NODEARITY"));
});

test("indent errors: 1 space / 3 spaces / tab / col-0 junk -> E-INDENT", () => {
  const t = "# repo-map v1\n@meta\n root: .\n";          // 1 space
  assert.ok(codes(t).includes("E-INDENT"));
  const t3 = "# repo-map v1\n@meta\n   root: .\n";        // 3 spaces
  assert.ok(codes(t3).includes("E-INDENT"));
  const tt = "# repo-map v1\n@meta\n\troot: .\n";         // tab
  assert.ok(codes(tt).includes("E-INDENT"));
  const junk = "# repo-map v1\ngarbage\n";               // col-0 non-@
  assert.ok(codes(junk).includes("E-INDENT"));
});

test("comments and blank lines are dropped; first non-empty line is the version header", () => {
  const t = "\n\n# repo-map v1\n# a comment\n@meta\n  root: .\n  depth: 0\n  generated: 2026-01-01T00:00:00Z\n\n@nodes\n  a system A\n@edges\n";
  const { repoMap, fatal, diagnostics } = parse(t);
  assert.equal(fatal, false);
  assert.equal(repoMap.nodes.size, 1);
  assert.equal(diagnostics.length, 0);
});

test("meta `key: value` split on first colon; value taken verbatim/trimmed", () => {
  const t = "# repo-map v1\n@meta\n  root: a/b: c\n  depth: 1\n  generated: 2026-01-01T00:00:00Z\n@nodes\n  a system A\n@edges\n";
  const { repoMap } = parse(t);
  assert.equal(repoMap.meta.root, "a/b: c"); // 最初の `:` で分割、残りは逐語
});

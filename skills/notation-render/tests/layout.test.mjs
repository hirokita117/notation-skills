// layout.test — 決定的レイアウト（layout-algorithm.md）

import { test } from "node:test";
import assert from "node:assert/strict";

import { parse } from "../scripts/parser.mjs";
import { computeLayout } from "../scripts/layout.mjs";
import { allDiagnostics, doc, readExample } from "./_helpers.mjs";

const layoutOf = (text) => computeLayout(parse(text).repoMap);
const ranks = (L) => { const o = {}; for (const [id, n] of L.nodes) o[id] = n.rank; return o; };

test("same DSL -> same layout (deepStrictEqual)", () => {
  const t = readExample("example-a.dsl");
  assert.deepStrictEqual(computeLayout(parse(t).repoMap), computeLayout(parse(t).repoMap));
});

test("longest-path ranking, not shortest", () => {
  const r = ranks(layoutOf(doc("a system A\nb package B\nc package C", "a b contains\nb c contains\na c contains")));
  assert.deepEqual([r.a, r.b, r.c], [0, 1, 2]);
});

test("@layout rank= overrides computed rank (and y reflects it)", () => {
  const L = layoutOf(doc("a system A\nb package B", "a b contains", "b rank=5"));
  assert.equal(L.nodes.get("b").rank, 5);
  assert.equal(L.nodes.get("b").y, 24 + 5 * (48 + 72)); // MARGIN + rank*(NODE_H+V_GAP)
});

test("group order is codepoint; default group last; slots reset per band", () => {
  const L = layoutOf(doc(
    "a system Root\nx package X\ny package Y\nz package Z",
    "a x contains\na y contains\na z contains",
    "x group=beta\ny group=alpha\nz group=beta"
  ));
  assert.equal(L.nodes.get("y").slot, 0); // alpha < beta
  assert.equal(L.nodes.get("x").slot, 1);
  assert.equal(L.nodes.get("z").slot, 2);
  assert.equal(L.nodes.get("a").slot, 0); // 帯ごとにスロットは 0 起点
});

test("default group is rightmost", () => {
  const L = layoutOf(doc("a system Root\np package P\nq package Q", "a p contains\na q contains", "q group=zzz"));
  assert.equal(L.nodes.get("q").slot, 0); // 名前付き group が先
  assert.equal(L.nodes.get("p").slot, 1); // 既定 "" が最後
});

test("hierarchy cycle: no throw, all nodes ranked, W-CYCLE warned", () => {
  const t = doc("a system A\nb package B\nc package C", "a b contains\nb c contains\nc a contains");
  const L = layoutOf(t);
  for (const [, n] of L.nodes) assert.equal(typeof n.rank, "number");
  assert.ok(allDiagnostics(t).some((d) => d.code === "W-CYCLE"));
});

test("dependency-only node lands one band below its consumer", () => {
  const r = ranks(layoutOf(doc("a system A\nb package B\ndb datastore D", "a b contains\nb db reads")));
  assert.equal(r.a, 0);
  assert.equal(r.b, 1);
  assert.equal(r.db, 2); // max(rank of consumers)+1
});

test("edge routing: downward vs same-band endpoints", () => {
  const L = layoutOf(doc("a system A\nb package B", "a b contains"));
  const a = L.nodes.get("a"), b = L.nodes.get("b");
  const e = L.edges[0];
  assert.deepEqual([e.x1, e.y1, e.x2, e.y2], [a.x + 80, a.y + 48, b.x + 80, b.y]); // 下向き

  const L2 = layoutOf(doc("a system A\nb package B\nc package C", "a b contains\na c contains\nb c imports"));
  const dep = L2.edges.find((x) => x.relation === "imports");
  const bb = L2.nodes.get("b"), cc = L2.nodes.get("c");
  assert.deepEqual([dep.x1, dep.y1, dep.x2, dep.y2], [bb.x + 160, bb.y + 24, cc.x, cc.y + 24]); // 同帯（右→左）
});

test("negative rank= normalized so the top band is 0", () => {
  const r = ranks(layoutOf(doc("a system A\nb package B", "a b contains", "a rank=-2\nb rank=0")));
  assert.equal(Math.min(...Object.values(r)), 0);
  assert.deepEqual([r.a, r.b], [0, 2]); // -2 シフト
});

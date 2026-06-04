// validator — 描画前ゲート（grammar.md §7 の意味検査）
//
// parser が出せない「モデル全体を要する検査」を担う: 必須キー欠落・参照整合・規模上限・
// 重複/孤立/循環/大小衝突など。error が 1 つでもあれば描画はブロックされる（facade が判定）。
// 行番号は parser が作った side-map `info` から引く。grammar.md §7.2 / §7.4 / §7.5 の実装。

import { isHierarchy, REQUIRED_META_KEYS, LIMITS } from "./model.mjs";
import { error, warning } from "./diagnostics.mjs";

// depth ごとに「細かすぎる」kind（§7.4）。system/external/datastore は全 depth 許可。
const DEPTH_EXCEED = {
  0: new Set(["module", "file-group"]),
  1: new Set(["file-group"]),
  2: new Set(),
};

/**
 * 検証する。parser の診断とは別に、意味検査の診断だけを返す（facade が両者を結合・ソート）。
 * @param {object} repoMap
 * @param {object} info  parser が返した side-map（行番号など）
 * @returns {object[]} diagnostics
 */
export function validate(repoMap, info) {
  const out = [];
  const nodes = repoMap.nodes;

  // --- 必須 meta キー（§3.2・新コード E-METAMISSING） ---
  const missing = REQUIRED_META_KEYS.filter((k) => !info.metaKeyLines.has(k));
  if (missing.length > 0) {
    out.push(error("E-METAMISSING", null,
      `missing required meta key(s): ${missing.join(", ")}`, "add the missing meta key(s)"));
  }

  // --- @nodes が空（§3.1 E-EMPTYNODES） ---
  if (nodes.size === 0) {
    out.push(error("E-EMPTYNODES", info.nodesHeaderLine,
      "@nodes has no entries", "add at least one node"));
  }

  // --- focus 参照（§3.2 E-FOCUSREF） ---
  if (repoMap.meta.focus !== undefined && !nodes.has(repoMap.meta.focus)) {
    out.push(error("E-FOCUSREF", info.metaKeyLines.get("focus") ?? null,
      `focus '${repoMap.meta.focus}' is not a defined node`, "point focus at a defined node"));
  }

  // --- エッジ参照（§3.4 E-EDGEREF）＋重複（W-DUPEDGE） ---
  const seenEdge = new Set();
  for (const e of repoMap.edges) {
    const line = info.edgeLines[e.index] ?? null;
    if (!nodes.has(e.from)) {
      out.push(error("E-EDGEREF", line,
        `edge references undefined node '${e.from}'`, `define '${e.from}' in @nodes or fix the id`));
    }
    if (!nodes.has(e.to)) {
      out.push(error("E-EDGEREF", line,
        `edge references undefined node '${e.to}'`, `define '${e.to}' in @nodes or fix the id`));
    }
    const key = `${e.from} ${e.to} ${e.relation}`;
    if (seenEdge.has(key)) {
      out.push(warning("W-DUPEDGE", line,
        `duplicate edge '${e.from} ${e.to} ${e.relation}'`, "remove the duplicate edge"));
    } else {
      seenEdge.add(key);
    }
  }

  // --- @layout 参照（§3.6 E-LAYOUTREF） ---
  for (const [id] of repoMap.layout) {
    if (!nodes.has(id)) {
      out.push(error("E-LAYOUTREF", info.layoutLines.get(id) ?? null,
        `@layout references undefined node '${id}'`, "point at a defined node or remove the line"));
    }
  }

  // --- depth と kind の整合（§7.4 W-DEPTHEXCEED） ---
  const depth = repoMap.meta.depth;
  if (depth === 0 || depth === 1 || depth === 2) {
    const forbidden = DEPTH_EXCEED[depth];
    for (const [id, node] of nodes) {
      if (forbidden.has(node.kind)) {
        out.push(warning("W-DEPTHEXCEED", info.nodeLines.get(id) ?? null,
          `kind '${node.kind}' is finer than depth ${depth} allows`, "raise depth or coarsen the node"));
      }
    }
  }

  // --- 孤立ノード（W-ORPHAN）: 出入りの辺が無く、単一ノードでも focus でもない ---
  if (nodes.size > 1) {
    const touched = new Set();
    for (const e of repoMap.edges) { touched.add(e.from); touched.add(e.to); }
    for (const [id] of nodes) {
      if (!touched.has(id) && id !== repoMap.meta.focus) {
        out.push(warning("W-ORPHAN", null, `node '${id}' has no edges`, "connect it or remove it"));
      }
    }
  }

  // --- 大小だけ違う ID（W-CASECLASH） ---
  const byLower = new Map(); // lower -> [ids]（ソース順）
  for (const [id] of nodes) {
    const lo = id.toLowerCase();
    if (!byLower.has(lo)) byLower.set(lo, []);
    byLower.get(lo).push(id);
  }
  for (const [, group] of byLower) {
    if (group.length > 1) {
      out.push(warning("W-CASECLASH", null,
        `ids differ only in case: ${group.join(", ")}`, "distinguish them by more than case"));
    }
  }

  // --- 階層系の循環（§7.3 W-CYCLE） ---
  if (hasHierarchyCycle(repoMap)) {
    out.push(warning("W-CYCLE", null,
      "hierarchical edges (contains/deploys/owns) contain a cycle", "break the hierarchy cycle"));
  }

  // --- 規模上限（§7.5） ---
  if (nodes.size > LIMITS.nodes) {
    out.push(error("E-MAXNODES", null,
      `node count ${nodes.size} exceeds ${LIMITS.nodes}`, "raise depth, narrow root, or abstract"));
  }
  if (repoMap.edges.length > LIMITS.edges) {
    out.push(error("E-MAXEDGES", null,
      `edge count ${repoMap.edges.length} exceeds ${LIMITS.edges}`, "reduce edges to <=80"));
  }
  if (info.meaningfulLineCount > LIMITS.lines) {
    out.push(error("E-MAXLINES", null,
      `meaningful line count ${info.meaningfulLineCount} exceeds ${LIMITS.lines}`, "reduce to <=200 lines"));
  }

  return out;
}

// --- 階層系循環の検出（存在判定のみ。断ち切りは layout が行う） ---

function hasHierarchyCycle(repoMap) {
  const adj = new Map();
  for (const [id] of repoMap.nodes) adj.set(id, []);
  for (const e of repoMap.edges) {
    if (e.from === e.to) continue; // 自己辺は E-SELFEDGE。循環判定には含めない
    if (isHierarchy(e.relation) && adj.has(e.from) && adj.has(e.to)) {
      adj.get(e.from).push(e.to);
    }
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  for (const [id] of adj) color.set(id, WHITE);
  // 反復 DFS（深い階層でもスタック溢れしない）。発見順は color で決まり決定的。
  for (const [start] of adj) {
    if (color.get(start) !== WHITE) continue;
    const stack = [[start, 0]];
    color.set(start, GRAY);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const [node, idx] = frame;
      const succ = adj.get(node);
      if (idx < succ.length) {
        frame[1]++;
        const nxt = succ[idx];
        const c = color.get(nxt);
        if (c === GRAY) return true; // 後退辺 = 循環
        if (c === WHITE) { color.set(nxt, GRAY); stack.push([nxt, 0]); }
      } else {
        color.set(node, BLACK);
        stack.pop();
      }
    }
  }
  return false;
}

// mermaid_emitter — repo-map v1 → Mermaid `graph TD`（任意・正本にしない）
//
// output-formats.md §3 の実装。Mermaid はレイアウトを自前で行うため幾何は決定的でなく、あくまで便宜的な派生。
// 決定的な正典は SVG。ここは「ノード宣言（ソース順）＋エッジ（index 順）」の機械変換のみ。

import { isHierarchy } from "./model.mjs";

// kind ごとの Mermaid 形（前後の囲み）
const SHAPE = {
  system: ["[[", "]]"],
  package: ["[", "]"],
  module: ["(", ")"],
  "file-group": ["([", "])"],
  external: ["{{", "}}"],
  datastore: ["[(", ")]"],
};

/** repo-map の id を Mermaid id にする（`.`/`-` を `_` に）。固定写像。 */
function mermaidId(id) {
  return id.replace(/[.-]/g, "_");
}

/** ラベルを Mermaid 表示テキストに（引用で囲み、内部の `"` は `'` に）。 */
function mermaidLabel(label) {
  return '"' + String(label).replace(/"/g, "'") + '"';
}

export function emitMermaid(repoMap) {
  const out = ["graph TD"];

  // ノード宣言（ソース順）
  for (const [id, node] of repoMap.nodes) {
    const [open, close] = SHAPE[node.kind] ?? ["[", "]"];
    out.push(`  ${mermaidId(id)}${open}${mermaidLabel(node.label)}${close}`);
  }

  // エッジ（index 順）。構造=実線、依存=点線。
  for (const e of repoMap.edges) {
    const arrow = isHierarchy(e.relation) ? "-->" : "-.->";
    out.push(`  ${mermaidId(e.from)} ${arrow}|${e.relation}| ${mermaidId(e.to)}`);
  }

  // focus があれば固定スニペットを 1 つだけ（色は SVG と一致させない・便宜的）
  if (repoMap.meta.focus !== undefined && repoMap.nodes.has(repoMap.meta.focus)) {
    out.push("  classDef focus stroke:#F59E0B,stroke-width:3px;");
    out.push(`  class ${mermaidId(repoMap.meta.focus)} focus;`);
  }

  return out.join("\n") + "\n";
}

// mermaid_emitter — notation DSL → Mermaid `graph TD`（任意・正本にしない）
//
// output-formats.md §3 の実装。Mermaid はレイアウトを自前で行うため幾何は決定的でなく、あくまで便宜的な派生。
// 決定的な正典は SVG。ここは「ノード宣言（ソース順）＋エッジ（index 順）」の機械変換のみ。
// kind ごとの形・階層/依存の区別はプロファイル由来（未指定なら model.version から解決）。

import { resolveProfile } from "./profiles.mjs";

/** notation の id を Mermaid id にする（`.`/`-` を `_` に）。固定写像。 */
function mermaidId(id) {
  return id.replace(/[.-]/g, "_");
}

/** ラベルを Mermaid 表示テキストに（引用で囲み、内部の `"` は `'` に）。 */
function mermaidLabel(label) {
  return '"' + String(label).replace(/"/g, "'") + '"';
}

export function emitMermaid(repoMap, profile) {
  const p = resolveProfile(profile, repoMap);
  const out = ["graph TD"];

  // ノード宣言（ソース順）
  for (const [id, node] of repoMap.nodes) {
    const [open, close] = p.mermaidShape[node.kind] ?? ["[", "]"];
    out.push(`  ${mermaidId(id)}${open}${mermaidLabel(node.label)}${close}`);
  }

  // エッジ（index 順）。構造=実線、依存=点線。
  for (const e of repoMap.edges) {
    const arrow = p.isHierarchy(e.relation) ? "-->" : "-.->";
    out.push(`  ${mermaidId(e.from)} ${arrow}|${e.relation}| ${mermaidId(e.to)}`);
  }

  // focus があれば固定スニペットを 1 つだけ（色は SVG と一致させない・便宜的）
  if (repoMap.meta.focus !== undefined && repoMap.nodes.has(repoMap.meta.focus)) {
    out.push("  classDef focus stroke:#F59E0B,stroke-width:3px;");
    out.push(`  class ${mermaidId(repoMap.meta.focus)} focus;`);
  }

  return out.join("\n") + "\n";
}

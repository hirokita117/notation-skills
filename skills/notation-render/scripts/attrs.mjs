// attrs — data-* 属性と DSL 抜粋の決定的導出（SVG/HTML 共有）
//
// html-viewer-contract.md §1 の実装。値はすべて DSL から一意に決まる（同じ DSL → 同じ属性値）。
// SVG と HTML で同じ関数を使い、ノードブロックがバイト一致するようにする。
// 導出規則（id/kind/label/path/edges）は grammar.md に従う。

// --- エスケープ ---

/** <text> など要素内容用の XML エスケープ。 */
export function escapeXmlText(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 二重引用符属性値用のエスケープ（改行は &#10;、引用は &quot;）。 */
export function encodeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "&#10;");
}

// --- 導出 ---

/** そのノードに接続する全エッジを `edge.index` 順に `from to relation` で並べ、改行連結。 */
export function relatedEdges(repoMap, id) {
  const lines = [];
  for (const e of repoMap.edges) {
    if (e.from === id || e.to === id) lines.push(`${e.from} ${e.to} ${e.relation}`);
  }
  return lines.join("\n");
}

/** ラベルを DSL 行として描画（複数語・空・要エスケープなら引用、それ以外は裸）。§3.5。 */
function renderLabel(label) {
  if (/\s/.test(label) || label === "" || label.includes('"') || label.includes("\\")) {
    return '"' + label.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  return label;
}

/** ノード定義行を正準形に再構成（`id kind label [path]`）。 */
export function nodeDefLine(node) {
  let s = `${node.id} ${node.kind} ${renderLabel(node.label)}`;
  if (node.path !== undefined && node.path !== "") s += ` ${node.path}`;
  return s;
}

/** そのノードを理解する最小 DSL 断片: 定義行 ＋ related edges 行（index 順）。 */
export function dslExcerpt(repoMap, id) {
  const node = repoMap.nodes.get(id);
  const lines = [nodeDefLine(node)];
  for (const e of repoMap.edges) {
    if (e.from === id || e.to === id) lines.push(`${e.from} ${e.to} ${e.relation}`);
  }
  return lines.join("\n");
}

/**
 * ノード `<g>` に付ける DSL 由来の data-* 属性文字列（固定順・先頭スペース付き）。
 * 座標由来の data-x/data-y は emit 側で付ける（レイアウト由来のため）。
 */
export function nodeDataAttrs(repoMap, id) {
  const node = repoMap.nodes.get(id);
  const path = node.path ?? "";
  return (
    ` data-node-id="${encodeAttr(node.id)}"` +
    ` data-label="${encodeAttr(node.label)}"` +
    ` data-kind="${encodeAttr(node.kind)}"` +
    ` data-path="${encodeAttr(path)}"` +
    ` data-related-edges="${encodeAttr(relatedEdges(repoMap, id))}"` +
    ` data-dsl-excerpt="${encodeAttr(dslExcerpt(repoMap, id))}"`
  );
}

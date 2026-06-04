// svg_emitter — 単一 SVG 文字列（決定的な正典）
//
// output-formats.md §1 の実装。座標は layout、色・フォントは theme。外部参照なしの自己完結 1 枚。
// 要素順・属性順を固定し、座標は整数 String 化（ロケール非依存）でバイト安定にする。
// ノード `<g>` には data-*（attrs）＋ data-x/data-y＋transform を、エッジ `<line>` には
// class="edge"＋data-from/to/rel を付ける（HTML のドラッグで使う・静的 SVG では無害）。

import { DIMS, THEME, kindFill as defaultKindFill, kindText as defaultKindText, truncateLabel } from "./theme.mjs";
import { nodeDataAttrs, escapeXmlText } from "./attrs.mjs";

const { NODE_W, NODE_H } = DIMS;

/**
 * モデル ＋ layout から SVG 文字列を作る。kind→色だけがバージョンで異なるので opts で差し替え可能
 * （未指定なら repo-map の色。幾何・属性導出は両バージョン共通）。
 * @param {object} repoMap
 * @param {object} layout  computeLayout の戻り値
 * @param {object} [opts]  { rootAttrs?, kindFill?, kindText? }
 * @returns {string}
 */
export function emitSvg(repoMap, layout, opts = {}) {
  const { canvas, edges, nodes, focus } = layout;
  const rootAttrs = opts.rootAttrs ? opts.rootAttrs + " " : "";
  const kindFill = opts.kindFill ?? defaultKindFill;
  const kindText = opts.kindText ?? defaultKindText;
  const L = [];

  L.push(
    `<svg ${rootAttrs}width="${canvas.w}" height="${canvas.h}" viewBox="0 0 ${canvas.w} ${canvas.h}" ` +
      `xmlns="http://www.w3.org/2000/svg" font-family="${THEME.FONT_FAMILY}">`
  );

  // defs: to 端の矢頭マーカー
  L.push(`  <defs>`);
  L.push(`    <marker id="arrow" markerWidth="${THEME.ARROW_SIZE}" markerHeight="${THEME.ARROW_SIZE}" refX="7" refY="4" orient="auto">`);
  L.push(`      <path d="M0,0 L8,4 L0,8 z" fill="${THEME.EDGE_COLOR}"></path>`);
  L.push(`    </marker>`);
  L.push(`  </defs>`);

  // 背景
  L.push(`  <rect x="0" y="0" width="${canvas.w}" height="${canvas.h}" fill="${THEME.BACKGROUND}"></rect>`);

  // エッジ（index 順・先に描いてノードで上書き）
  for (const e of edges) {
    L.push(emitEdge(e));
  }

  // ノード（ソース順・transform で配置）
  for (const [id, node] of repoMap.nodes) {
    L.push(emitNode(repoMap, id, node, nodes.get(id), kindFill, kindText));
  }

  // focus 枠（最後・幾何は変えず枠だけ）
  if (focus !== undefined && nodes.has(focus)) {
    const p = nodes.get(focus);
    L.push(
      `  <rect class="focus-frame" data-focus-for="${escapeAttr(focus)}" x="${p.x - 3}" y="${p.y - 3}" ` +
        `width="${NODE_W + 6}" height="${NODE_H + 6}" rx="${THEME.NODE_RADIUS + 2}" ` +
        `fill="none" stroke="${THEME.FOCUS_STROKE}" stroke-width="${THEME.FOCUS_WIDTH}"></rect>`
    );
  }

  L.push(`</svg>`);
  return L.join("\n") + "\n";
}

function emitEdge(e) {
  const dash = e.dashed ? ` stroke-dasharray="${THEME.EDGE_DEP_DASH}"` : "";
  return (
    `  <line class="edge" data-from="${escapeAttr(e.from)}" data-to="${escapeAttr(e.to)}" data-rel="${escapeAttr(e.relation)}" ` +
    `x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" ` +
    `stroke="${THEME.EDGE_COLOR}" stroke-width="${THEME.EDGE_WIDTH}"${dash} marker-end="url(#arrow)"></line>`
  );
}

function emitNode(repoMap, id, node, pos, kindFill, kindText) {
  const data = nodeDataAttrs(repoMap, id);
  const label = escapeXmlText(truncateLabel(node.label));
  const idText = escapeXmlText(id);
  return (
    `  <g class="node"${data} data-x="${pos.x}" data-y="${pos.y}" transform="translate(${pos.x},${pos.y})">\n` +
    `    <rect x="0" y="0" width="${NODE_W}" height="${NODE_H}" rx="${THEME.NODE_RADIUS}" ` +
    `fill="${kindFill(node.kind)}" stroke="${THEME.NODE_STROKE}" stroke-width="${THEME.NODE_STROKE_WIDTH}"></rect>\n` +
    `    <text x="${NODE_W / 2}" y="22" text-anchor="middle" fill="${kindText(node.kind)}" font-size="${THEME.FONT_SIZE_LABEL}">${label}</text>\n` +
    `    <text x="${NODE_W / 2}" y="38" text-anchor="middle" fill="${kindText(node.kind)}" font-size="${THEME.FONT_SIZE_ID}" opacity="0.8">${idText}</text>\n` +
    `  </g>`
  );
}

// 属性用の軽量エスケープ（id/relation は基本 ASCII だが念のため）。
function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

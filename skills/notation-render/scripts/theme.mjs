// theme — 固定テーマ定数（色・フォント）と寸法定数、決定的なラベル省略
//
// 色・フォントの正本は theme.md、寸法定数（NODE_W 等）の正本は layout-algorithm.md §4。
// ここはそれらを実装として写すだけ。齟齬があれば .md を正とし、このファイルを直す。

// --- 寸法定数（layout-algorithm.md §4） ---

export const DIMS = Object.freeze({
  NODE_W: 160,
  NODE_H: 48,
  H_GAP: 40,
  V_GAP: 72,
  MARGIN: 24,
});

// --- kind ごとの塗り・文字色（theme.md） ---

const KIND_FILL = Object.freeze({
  system: "#1F2937",
  package: "#2563EB",
  module: "#0EA5E9",
  "file-group": "#14B8A6",
  external: "#9CA3AF",
  datastore: "#7C3AED",
});

const KIND_TEXT = Object.freeze({
  system: "#FFFFFF",
  package: "#FFFFFF",
  module: "#FFFFFF",
  "file-group": "#FFFFFF",
  external: "#111827", // コントラスト確保
  datastore: "#FFFFFF",
});

export const kindFill = (kind) => KIND_FILL[kind] ?? "#9CA3AF";
export const kindText = (kind) => KIND_TEXT[kind] ?? "#111827";

// --- document-map v1 の kind ごとの塗り・文字色（theme.md「document-map の箱の塗り」） ---
//
// repo-map のパレット（slate/blue/cyan/teal/grey/violet）と整合させつつ、9 種を識別できるよう
// amber/red/emerald を足す。境界=灰（external）は repo-map と同じ意味付け。

const DM_KIND_FILL = Object.freeze({
  document: "#1F2937",
  section: "#2563EB",
  concept: "#0EA5E9",
  requirement: "#14B8A6",
  decision: "#7C3AED",
  "open-question": "#D97706", // focus 枠 #F59E0B とは別色
  risk: "#DC2626",
  actor: "#059669",
  external: "#9CA3AF",
});

const DM_KIND_TEXT = Object.freeze({
  document: "#FFFFFF",
  section: "#FFFFFF",
  concept: "#FFFFFF",
  requirement: "#FFFFFF",
  decision: "#FFFFFF",
  "open-question": "#FFFFFF",
  risk: "#FFFFFF",
  actor: "#FFFFFF",
  external: "#111827", // 境界の灰には濃灰文字（コントラスト確保）
});

export const documentMapKindFill = (kind) => DM_KIND_FILL[kind] ?? "#9CA3AF";
export const documentMapKindText = (kind) => DM_KIND_TEXT[kind] ?? "#111827";

// --- 共通テーマ定数（theme.md） ---

export const THEME = Object.freeze({
  EDGE_COLOR: "#4B5563",
  EDGE_DEP_DASH: "4 3", // 依存系（破線）
  EDGE_WIDTH: "1.5", // theme.md は数値を固定しないため、参照 HTML に合わせ 1.5 を固定採用
  ARROW_SIZE: 8, // to 端の塗り三角
  BACKGROUND: "#FFFFFF",
  NODE_STROKE: "#111827",
  NODE_STROKE_WIDTH: "1",
  NODE_RADIUS: 8,
  FOCUS_STROKE: "#F59E0B",
  FOCUS_WIDTH: "3",
  FONT_FAMILY: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  FONT_SIZE_LABEL: 13,
  FONT_SIZE_ID: 10,
  FONT_SIZE_LEGEND: 12,
});

// --- 決定的なラベル省略（theme.md「NODE_W − 16px 超で末尾省略」） ---
//
// ブラウザのテキストメトリクスは使えないため、コードポイント単位の固定平均字幅ヒューリスティック
// で推定する（実ブラウザと画素一致はしないが、同じ文字列 → 常に同じ結果＝決定的）。

const LABEL_MAX_PX = DIMS.NODE_W - 16; // 144

// 全角・CJK 系（おおむね 1em）。layout/emit を通じて固定。
function isWide(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

// 細い字（おおむね 0.28em）。固定集合。
const NARROW = new Set([..."ijl.,:;'!|()[]{} "].map((c) => c.codePointAt(0)));

function charWidthEm(cp) {
  if (isWide(cp)) return 1.0;
  if (NARROW.has(cp)) return 0.28;
  return 0.58; // 平均アドバンス
}

function estWidthPx(s, fontPx) {
  let w = 0;
  for (const ch of s) w += charWidthEm(ch.codePointAt(0)) * fontPx;
  return w;
}

/** ラベルが幅を超えたら末尾を「…」で省略する純関数（決定的）。 */
export function truncateLabel(label, maxPx = LABEL_MAX_PX, fontPx = THEME.FONT_SIZE_LABEL) {
  if (estWidthPx(label, fontPx) <= maxPx) return label;
  const ELL = "…";
  const budget = maxPx - estWidthPx(ELL, fontPx);
  let out = "";
  let w = 0;
  for (const ch of label) {
    const cw = charWidthEm(ch.codePointAt(0)) * fontPx;
    if (w + cw > budget) break;
    out += ch;
    w += cw;
  }
  return out + ELL;
}

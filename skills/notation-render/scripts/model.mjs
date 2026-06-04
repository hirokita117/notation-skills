// model — 内部モデル `RepoMap` の型と閉じた列挙（葉モジュール・依存ゼロ）
//
// grammar.md §4（内部モデル）と §5（列挙）の実装。ここは正本を再定義せず、
// grammar.md の値をそのまま写す。ロジックは持たず、定数と小さなコンストラクタだけ。
// 齟齬があれば grammar.md を正とし、このファイルを直す。

// --- 列挙（grammar.md §5・閉じた集合） ---

/** ノード kind（閉じた集合）。grammar.md §5。 */
export const KINDS = Object.freeze([
  "system",
  "package",
  "module",
  "file-group",
  "external",
  "datastore",
]);

/** relation（閉じた集合）。grammar.md §5。 */
export const RELATIONS = Object.freeze([
  "contains",
  "imports",
  "calls",
  "deploys",
  "reads",
  "owns",
]);

/** 階層系 relation（ランク決定に使い、実線で描く）。grammar.md §5 / layout-algorithm §2。 */
export const HIERARCHY = Object.freeze(new Set(["contains", "deploys", "owns"]));

/** 依存系 relation（ランクに効かせず、破線で描く）。 */
export const DEPENDENCY = Object.freeze(new Set(["imports", "calls", "reads"]));

const KIND_SET = new Set(KINDS);
const RELATION_SET = new Set(RELATIONS);

export const isKind = (v) => KIND_SET.has(v);
export const isRelation = (v) => RELATION_SET.has(v);
export const isHierarchy = (rel) => HIERARCHY.has(rel);
export const isDependency = (rel) => DEPENDENCY.has(rel);

// --- 補助定数（grammar.md §1.7 / §7.5） ---

/** id の文字集合（grammar.md §1.7）。先頭は英字/`_`、以降は英数・`_`・`-`・`.`。 */
export const ID_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/** id の最大長（grammar.md §1.7）。 */
export const ID_MAX_LEN = 64;

/** depth の許容値（grammar.md §3.2）。 */
export const DEPTH_VALUES = Object.freeze(new Set([0, 1, 2]));

/** 必須 meta キー（grammar.md §3.2）。 */
export const REQUIRED_META_KEYS = Object.freeze(["root", "depth", "generated"]);

/** 既知 meta キー（grammar.md §3.2）。 */
export const META_KEYS = Object.freeze(["root", "depth", "focus", "generated"]);

/** 規模上限（grammar.md §7.5）。 */
export const LIMITS = Object.freeze({ nodes: 40, edges: 80, lines: 200 });

/** 正準バージョン文字列リテラル（grammar.md §2）。 */
export const VERSION = "repo-map v1";

/** バージョンヘッダ行の厳密一致リテラル。 */
export const VERSION_HEADER = "# repo-map v1";

// --- コンストラクタ ---

/**
 * 空の RepoMap を作る。nodes は挿入順（=ソース順）を保つ Map、edges はソース順の配列、
 * layout は @layout が無ければ空 Map。座標・色は持たない（layout/emit が後で算出する）。
 */
export function makeRepoMap() {
  return {
    version: VERSION,
    meta: { root: undefined, depth: undefined, focus: undefined, generated: undefined },
    nodes: new Map(), // id -> { id, kind, label, path? }
    edges: [], // [{ index, from, to, relation }]
    layout: new Map(), // id -> { id, rank?, group? }
  };
}

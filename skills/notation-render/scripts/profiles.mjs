// profiles — DSL バージョン別プロファイル（dialect）レジストリ
//
// 1 本のパイプライン（parse → validate → layout → emit）を、バージョンごとに違う部分だけ
// 差し替えて動かすための「設定の束」。差分は列挙（kind/relation）・階層/依存の分類・scope メタキー名・
// depth×kind 規則・規模上限・テーマ色・emit chrome（title/legend/prompt/属性名）。行文法・座標計算・
// SVG 幾何は両バージョン共通なので、ここには持たない。
//
// repo-map の値は model.mjs / theme.mjs（= grammar.md / theme.md の実装）から写し、再定義しない。
// document-map の値は document-map-notation/references/grammar.md を正本とし、ここに実装する。

import {
  KINDS as RM_KINDS, RELATIONS as RM_RELATIONS,
  HIERARCHY as RM_HIERARCHY, DEPENDENCY as RM_DEPENDENCY,
  isKind as rmIsKind, isRelation as rmIsRelation,
  isHierarchy as rmIsHierarchy, isDependency as rmIsDependency,
  META_KEYS as RM_META_KEYS, REQUIRED_META_KEYS as RM_REQUIRED_META_KEYS,
  LIMITS, VERSION as RM_VERSION, VERSION_HEADER as RM_VERSION_HEADER,
} from "./model.mjs";
import {
  kindFill as rmKindFill, kindText as rmKindText,
  documentMapKindFill as dmKindFill, documentMapKindText as dmKindText,
} from "./theme.mjs";

// --- repo-map v1 プロファイル（正本は model.mjs / theme.mjs / grammar.md） ---

export const repoMapProfile = Object.freeze({
  family: "repo-map",
  version: RM_VERSION,             // "repo-map v1"
  versionHeader: RM_VERSION_HEADER, // "# repo-map v1"

  kinds: new Set(RM_KINDS),
  kindList: RM_KINDS,
  kindHint: "system/package/module/file-group/external/datastore",
  isKind: rmIsKind,

  relations: new Set(RM_RELATIONS),
  relationList: RM_RELATIONS,
  relationHint: "contains/imports/calls/deploys/reads/owns",
  isRelation: rmIsRelation,

  hierarchy: RM_HIERARCHY,
  dependency: RM_DEPENDENCY,
  isHierarchy: rmIsHierarchy,
  isDependency: rmIsDependency,
  hierarchyList: ["contains", "deploys", "owns"], // W-CYCLE メッセージ用

  scopeKey: "root",
  metaKeys: RM_META_KEYS,                 // ["root","depth","focus","generated"]
  requiredMetaKeys: RM_REQUIRED_META_KEYS, // ["root","depth","generated"]

  // depth ごとに「細かすぎる」kind（grammar.md §7.4）
  depthExceed: Object.freeze({
    0: new Set(["module", "file-group"]),
    1: new Set(["file-group"]),
    2: new Set(),
  }),

  limits: LIMITS, // { nodes:40, edges:80, lines:200 }

  kindFill: rmKindFill,
  kindText: rmKindText,

  // Mermaid: kind ごとの形（前後の囲み）
  mermaidShape: Object.freeze({
    system: ["[[", "]]"],
    package: ["[", "]"],
    module: ["(", ")"],
    "file-group": ["([", "])"],
    external: ["{{", "}}"],
    datastore: ["[(", ")]"],
  }),
});

// --- document-map v1 プロファイル（正本は document-map-notation/references/grammar.md） ---

const DM_KINDS = Object.freeze([
  "document", "section", "concept", "requirement",
  "decision", "open-question", "risk", "actor", "external",
]);
const DM_RELATIONS = Object.freeze([
  "contains", "explains", "depends-on", "decides",
  "raises", "mitigates", "owns", "references", "conflicts-with",
]);
// 階層系 = contains のみ（読み筋スパイン・実線・ランク決定）。残りは依存系（破線・ランク非関与）。
const DM_HIERARCHY = Object.freeze(new Set(["contains"]));
const DM_DEPENDENCY = Object.freeze(new Set([
  "explains", "depends-on", "decides", "raises",
  "mitigates", "owns", "references", "conflicts-with",
]));
const DM_KIND_SET = new Set(DM_KINDS);
const DM_REL_SET = new Set(DM_RELATIONS);

export const documentMapProfile = Object.freeze({
  family: "document-map",
  version: "document-map v1",
  versionHeader: "# document-map v1",

  kinds: DM_KIND_SET,
  kindList: DM_KINDS,
  kindHint: "document/section/concept/requirement/decision/open-question/risk/actor/external",
  isKind: (v) => DM_KIND_SET.has(v),

  relations: DM_REL_SET,
  relationList: DM_RELATIONS,
  relationHint: "contains/explains/depends-on/decides/raises/mitigates/owns/references/conflicts-with",
  isRelation: (v) => DM_REL_SET.has(v),

  hierarchy: DM_HIERARCHY,
  dependency: DM_DEPENDENCY,
  isHierarchy: (r) => DM_HIERARCHY.has(r),
  isDependency: (r) => DM_DEPENDENCY.has(r),
  hierarchyList: ["contains"],

  scopeKey: "source",
  metaKeys: Object.freeze(["source", "depth", "focus", "generated"]),
  requiredMetaKeys: Object.freeze(["source", "depth", "generated"]),

  // grammar.md §7.4: depth0=俯瞰, depth1=セクション+概念+決定+未決, depth2=要件+詳細
  depthExceed: Object.freeze({
    0: new Set(["concept", "requirement", "decision", "open-question", "risk"]),
    1: new Set(["requirement"]),
    2: new Set(),
  }),

  limits: LIMITS, // repo-map と同値 40/80/200

  kindFill: dmKindFill,
  kindText: dmKindText,

  // Mermaid: 9 kind に区別できる形（便宜的な派生。正典は HTML）
  mermaidShape: Object.freeze({
    document: ["[[", "]]"],
    section: ["[", "]"],
    concept: ["(", ")"],
    requirement: ["[/", "/]"],
    decision: ["{{", "}}"],
    "open-question": ["{", "}"],
    risk: [">", "]"],
    actor: ["((", "))"],
    external: ["([", "])"],
  }),
});

// --- レジストリと選択 ---

const BY_HEADER = new Map([
  [repoMapProfile.versionHeader, repoMapProfile],
  [documentMapProfile.versionHeader, documentMapProfile],
]);

const BY_VERSION = new Map([
  [repoMapProfile.version, repoMapProfile],
  [documentMapProfile.version, documentMapProfile],
]);

/** バージョン文字列（"repo-map v1" 等）からプロファイルを引く。未知なら undefined。 */
export function profileByVersion(version) {
  return BY_VERSION.get(version);
}

/** プロファイルが未指定のとき、モデルの version から解決する（既定は repo-map）。 */
export function resolveProfile(profile, model) {
  return profile ?? (model && profileByVersion(model.version)) ?? repoMapProfile;
}

/**
 * 先頭行（trimEnd 済み）から対応プロファイルを選ぶ（grammar.md §2 / render-contract.md）。
 * @returns {{ profile: object } | { versionError: { code, message, remedy } }}
 *   versionError は parser が行番号を付けて診断化する（profiles は診断整形を持たない）。
 */
export function selectProfile(firstLine) {
  const exact = BY_HEADER.get(firstLine);
  if (exact) return { profile: exact };

  const m = /^#\s+(repo-map|document-map)\s+v(\S+)/.exec(firstLine);
  if (m && m[2] !== "1") {
    return {
      versionError: {
        code: "E-BADVERSION",
        message: `unsupported version '${m[2]}'`,
        remedy: `this renderer supports ${m[1]} v1 only`,
      },
    };
  }
  return {
    versionError: {
      code: "E-NOVERSION",
      message: "first non-empty line is not a supported version header",
      remedy: "make the first line `# repo-map v1` or `# document-map v1`",
    },
  };
}

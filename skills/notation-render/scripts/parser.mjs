// parser — DSL テキスト → 内部モデル `RepoMap`（grammar.md の実装）
//
// 字句分類（§1.2）→ バージョンヘッダ（§2）→ セクション状態機械（§3.1）→
// エントリのトークン化（§1.5・引用は §1.7/§3.5）→ モデル構築（§4）。
// このフェーズでは「1 行で完結する字句・構文の診断」だけを出す。意味検査（未定義参照・
// 規模上限・必須キー欠落など、モデル全体を要するもの）は validator.mjs が担当する。
//
// repoMap は §4 のとおり座標も行番号も持たない。診断に必要な行番号は別マップ `info` に保持し、
// JSON 出力（内部モデル）は §4 のフィールドだけになるようにする。

import { makeModel, ID_RE, ID_MAX_LEN, DEPTH_VALUES } from "./model.mjs";
import { selectProfile } from "./profiles.mjs";
import { error, warning } from "./diagnostics.mjs";

// --- 公開 API ---

/**
 * DSL テキストをパースする。先頭の version 行で対応プロファイル（repo-map v1 / document-map v1）を
 * 選び、共通の状態機械で内部モデルを組む。列挙（kind/relation）・scope メタキー名はプロファイル由来。
 * @returns {{ repoMap: object, profile: object|undefined, diagnostics: object[], info: object, fatal: boolean }}
 *   fatal=true はバージョン不一致など「描画も意味検査も意味がない」状態（validator を回さない）。
 *   戻り値のキー名は後方互換のため `repoMap`（= 内部モデル。document-map でも同名）。
 */
export function parse(text) {
  const lines = normalizeLines(text);
  const diagnostics = [];
  const info = {
    meaningfulLineCount: 0,
    metaKeyLines: new Map(), // key -> line
    nodeLines: new Map(), // id -> line
    edgeLines: [], // edge.index -> line
    layoutLines: new Map(), // id -> line
    nodesHeaderLine: null,
  };

  // --- バージョンヘッダ（§2）: 最初の非空行のみ特別扱い ---
  let firstIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!isBlank(lines[i])) { firstIdx = i; break; }
  }
  if (firstIdx === -1) {
    diagnostics.push(error("E-NOVERSION", null,
      "document has no version header", "add `# repo-map v1` as the first line"));
    return { repoMap: makeModel("repo-map v1", "root"), profile: undefined, diagnostics, info, fatal: true };
  }
  const sel = selectProfile(lines[firstIdx].trimEnd());
  if (sel.versionError) {
    const ve = sel.versionError;
    diagnostics.push(error(ve.code, firstIdx + 1, ve.message, ve.remedy));
    return { repoMap: makeModel("repo-map v1", "root"), profile: undefined, diagnostics, info, fatal: true };
  }
  const profile = sel.profile;
  const repoMap = makeModel(profile.version, profile.scopeKey);

  // --- セクション状態機械（§3.1） ---
  // ランク: meta=0, nodes=1, edges=2, layout=3。厳密増加でなければ E-ORDER / E-DUPSECTION。
  const SECTIONS = { "@meta": 0, "@nodes": 1, "@edges": 2, "@layout": 3 };
  let current = null; // "@meta" | "@nodes" | "@edges" | "@layout" | "@bad" | null
  let lastRank = -1;
  const seen = new Set();
  let reportedStrayEntry = false;

  for (let i = firstIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    if (isBlank(raw)) continue;

    const cls = classifyLine(raw);
    if (cls.kind === "comment") continue;

    // 有意行（空行・コメント以外）を数える（§7.5 E-MAXLINES 用）
    info.meaningfulLineCount++;

    if (cls.kind === "indent-error") {
      diagnostics.push(error("E-INDENT", lineNo,
        "entry line is not indented with exactly 2 spaces (or column 0 has invalid content)",
        "indent entries with exactly 2 spaces"));
      continue;
    }

    if (cls.kind === "header") {
      const name = raw.trimEnd();
      if (!(name in SECTIONS)) {
        diagnostics.push(error("E-BADSECTION", lineNo,
          `unknown section header '${name}'`, "use @meta/@nodes/@edges/@layout or remove it"));
        current = "@bad";
        continue;
      }
      const rank = SECTIONS[name];
      if (seen.has(name)) {
        diagnostics.push(error("E-DUPSECTION", lineNo,
          `duplicate section '${name}'`, "merge the duplicate section"));
      } else if (rank <= lastRank) {
        diagnostics.push(error("E-ORDER", lineNo,
          `section '${name}' is out of order`, "order sections @meta -> @nodes -> @edges -> @layout"));
      }
      seen.add(name);
      lastRank = Math.max(lastRank, rank);
      current = name;
      if (name === "@nodes") info.nodesHeaderLine = lineNo;
      continue;
    }

    // ここからエントリ行
    const content = raw.slice(2); // ちょうど 2 スペースの字下げを除く
    if (current === null) {
      if (!reportedStrayEntry) {
        diagnostics.push(error("E-ORDER", lineNo,
          "entry appears before any section header", "start with @meta then @nodes/@edges"));
        reportedStrayEntry = true;
      }
      continue;
    }
    if (current === "@bad") continue; // 不正セクション下のエントリは無視（既に E-BADSECTION 報告済み）

    if (current === "@meta") parseMetaLine(content, lineNo, repoMap, info, diagnostics, profile);
    else if (current === "@nodes") parseNodeLine(content, lineNo, repoMap, info, diagnostics, profile);
    else if (current === "@edges") parseEdgeLine(content, lineNo, repoMap, info, diagnostics, profile);
    else if (current === "@layout") parseLayoutLine(content, lineNo, repoMap, info, diagnostics);
  }

  return { repoMap, profile, diagnostics, info, fatal: false };
}

// --- 行の正規化・分類（§1.1 / §1.2） ---

function normalizeLines(text) {
  // CR 除去（\r\n -> \n、孤立 CR も落とす）。最終改行の有無は split で吸収される。
  return String(text).replace(/\r\n?/g, "\n").split("\n");
}

function isBlank(raw) {
  return /^[ \t]*$/.test(raw);
}

/** 1 行を header / entry / comment / indent-error に分類する（§1.2 表）。 */
function classifyLine(raw) {
  const lead = /^[ \t]*/.exec(raw)[0];
  const rest = raw.slice(lead.length);
  const first = rest[0];
  if (first === "#") return { kind: "comment" };
  if (lead.length === 0) {
    if (raw[0] === "@") return { kind: "header" };
    return { kind: "indent-error" }; // 列 0 に @/# 以外の非空白
  }
  if (lead === "  ") return { kind: "entry" }; // ちょうど 2 スペース
  return { kind: "indent-error" }; // 1 スペース・3+・タブ字下げなど
}

// --- エントリのトークン化（§1.5・引用 §3.5） ---

/**
 * エントリ本体（字下げ除去後）をトークン列にする。
 * 引用 `"..."`（`\"`/`\\` エスケープ）はスペースを含めて 1 トークン。
 * @returns {{ tokens: {quoted:boolean,value:string}[], unclosedQuote:boolean, hasTab:boolean }}
 */
function tokenize(content) {
  const tokens = [];
  let i = 0;
  const n = content.length;
  let hasTab = false;
  let unclosedQuote = false;
  while (i < n) {
    // 区切り（スペース/タブ）を読み飛ばす
    while (i < n && (content[i] === " " || content[i] === "\t")) {
      if (content[i] === "\t") hasTab = true;
      i++;
    }
    if (i >= n) break;
    if (content[i] === '"') {
      i++; // 開き引用
      let buf = "";
      let closed = false;
      while (i < n) {
        const c = content[i];
        if (c === "\\" && i + 1 < n) { buf += content[i + 1]; i += 2; continue; }
        if (c === '"') { closed = true; i++; break; }
        if (c === "\t") hasTab = true;
        buf += c;
        i++;
      }
      if (!closed) unclosedQuote = true;
      tokens.push({ quoted: true, value: buf });
    } else {
      let buf = "";
      while (i < n && content[i] !== " " && content[i] !== "\t") {
        buf += content[i];
        i++;
      }
      tokens.push({ quoted: false, value: buf });
    }
  }
  return { tokens, unclosedQuote, hasTab };
}

// --- @meta（§3.2） ---

function parseMetaLine(content, lineNo, repoMap, info, diagnostics, profile) {
  if (content.includes("\t")) {
    diagnostics.push(warning("W-CHAR", lineNo, "entry value contains a tab", "replace tabs with spaces"));
  }
  const colon = content.indexOf(":");
  if (colon < 0) {
    diagnostics.push(error("E-METASYNTAX", lineNo, "meta line is not `key: value`", "use `key: value`"));
    return;
  }
  const key = content.slice(0, colon);
  const after = content.slice(colon + 1);
  if (key === "" || /\s/.test(key) || after[0] !== " ") {
    diagnostics.push(error("E-METASYNTAX", lineNo,
      "meta line is not `key: value` (need `:` then a space)", "use `key: value`"));
    return;
  }
  const value = after.trim();

  if (!profile.metaKeys.includes(key)) {
    diagnostics.push(error("E-BADMETAKEY", lineNo, `unknown meta key '${key}'`, "remove the unknown key"));
    return;
  }
  if (info.metaKeyLines.has(key)) {
    diagnostics.push(error("E-DUPMETA", lineNo, `duplicate meta key '${key}'`, "use each meta key at most once"));
    return;
  }
  info.metaKeyLines.set(key, lineNo);

  if (key === "depth") {
    const d = /^-?\d+$/.test(value) ? Number(value) : NaN;
    if (!DEPTH_VALUES.has(d)) {
      diagnostics.push(error("E-DEPTHVAL", lineNo, `depth '${value}' is not 0, 1, or 2`, "set depth to 0, 1, or 2"));
    } else {
      repoMap.meta.depth = d;
    }
  } else if (key === profile.scopeKey) {
    // scope（repo-map=root / document-map=source）。値は逐語保持。空白は W-PATHSPACE。
    repoMap.meta[profile.scopeKey] = value;
    if (/\s/.test(value)) {
      diagnostics.push(warning("W-PATHSPACE", lineNo, `${profile.scopeKey} path contains a space`, "avoid spaces in paths"));
    }
  } else if (key === "generated") {
    repoMap.meta.generated = value;
    if (!isIsoTimestamp(value)) {
      diagnostics.push(warning("W-DATEFMT", lineNo,
        "generated is not an ISO 8601 timestamp", "use e.g. 2026-06-03T12:00:00Z"));
    }
  } else if (key === "focus") {
    repoMap.meta.focus = value; // 参照検査（E-FOCUSREF）は validator
  }
}

function isIsoTimestamp(v) {
  // YYYY-MM-DDThh:mm:ss(Z | ±hh:mm)（grammar.md §6）。値は逐語保持し、形のみ検査。
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/.test(v);
}

// --- @nodes（§3.3 / §3.5） ---

function parseNodeLine(content, lineNo, repoMap, info, diagnostics, profile) {
  const { tokens, unclosedQuote, hasTab } = tokenize(content);
  if (hasTab) diagnostics.push(warning("W-CHAR", lineNo, "entry value contains a tab", "replace tabs with spaces"));
  if (unclosedQuote) {
    diagnostics.push(error("E-QUOTE", lineNo, "unclosed quoted string", "close the quote"));
  }
  if (tokens.length === 0) return;

  const id = tokens[0].value;
  // id 検査（§1.7 / 新コード E-BADID・E-IDLEN）
  if (!ID_RE.test(id)) {
    diagnostics.push(error("E-BADID", lineNo, `node id '${id}' uses characters outside §1.7`,
      "start with a letter/_ and use only letters, digits, _, -, ."));
  }
  if (id.length > ID_MAX_LEN) {
    diagnostics.push(error("E-IDLEN", lineNo, `node id '${id}' exceeds ${ID_MAX_LEN} characters`, "shorten the id"));
  }

  const kind = tokens.length >= 2 ? tokens[1].value : "";
  if (tokens.length >= 2 && !profile.isKind(kind)) {
    diagnostics.push(error("E-BADKIND", lineNo, `unknown kind '${kind}'`, `use ${profile.kindHint}`));
  }

  // ラベル / パス（§3.5）
  let label = "";
  let path;
  const rest = tokens.slice(2);
  if (tokens.length < 3 || rest.length === 0) {
    diagnostics.push(error("E-NODEARITY", lineNo, "node line is missing a label",
      "quote multi-word labels; path is the single token after the label"));
  } else {
    label = rest[0].value;
    const trailing = rest.slice(1);
    if (trailing.length === 1) {
      path = trailing[0].value;
    } else if (trailing.length >= 2) {
      diagnostics.push(error("E-NODEARITY", lineNo, "too many tokens after the label",
        "quote multi-word labels; path is the single token after the label"));
    }
  }

  // モデルへ登録（id があれば best-effort で。重複は E-DUPID で先勝ち）
  if (id !== "") {
    if (repoMap.nodes.has(id)) {
      diagnostics.push(error("E-DUPID", lineNo, `duplicate node id '${id}'`, "make all ids unique"));
    } else {
      const node = { id, kind, label };
      if (path !== undefined) node.path = path;
      repoMap.nodes.set(id, node);
      info.nodeLines.set(id, lineNo);
    }
  }
}

// --- @edges（§3.4） ---

function parseEdgeLine(content, lineNo, repoMap, info, diagnostics, profile) {
  const { tokens, unclosedQuote, hasTab } = tokenize(content);
  if (hasTab) diagnostics.push(warning("W-CHAR", lineNo, "entry value contains a tab", "replace tabs with spaces"));
  if (unclosedQuote) diagnostics.push(error("E-QUOTE", lineNo, "unclosed quoted string", "close the quote"));

  if (tokens.length !== 3) {
    diagnostics.push(error("E-EDGEARITY", lineNo, `edge line has ${tokens.length} tokens, expected 3`,
      "use `<from> <to> <relation>`"));
    return;
  }
  const from = tokens[0].value;
  const to = tokens[1].value;
  const relation = tokens[2].value;

  if (!profile.isRelation(relation)) {
    diagnostics.push(error("E-BADREL", lineNo, `unknown relation '${relation}'`, `use ${profile.relationHint}`));
  }
  if (from === to) {
    diagnostics.push(error("E-SELFEDGE", lineNo, `self-edge on '${from}'`, "remove the self-edge"));
  }

  // 参照検査（E-EDGEREF）は validator。index = ソース順を維持するため常に登録。
  const index = repoMap.edges.length;
  repoMap.edges.push({ index, from, to, relation });
  info.edgeLines.push(lineNo);
}

// --- @layout（§3.6） ---

function parseLayoutLine(content, lineNo, repoMap, info, diagnostics) {
  const { tokens, unclosedQuote, hasTab } = tokenize(content);
  if (hasTab) diagnostics.push(warning("W-CHAR", lineNo, "entry value contains a tab", "replace tabs with spaces"));
  if (unclosedQuote) diagnostics.push(error("E-QUOTE", lineNo, "unclosed quoted string", "close the quote"));
  if (tokens.length === 0) return;

  const id = tokens[0].value;
  const override = { id };
  let bad = false;
  for (const t of tokens.slice(1)) {
    const v = t.value;
    let m;
    if ((m = /^rank=(-?\d+)$/.exec(v))) {
      override.rank = Number(m[1]);
    } else if (v.startsWith("group=")) {
      override.group = v.slice("group=".length);
    } else {
      diagnostics.push(error("E-LAYOUTSEM", lineNo, `@layout property '${v}' is not rank=/group=`,
        "@layout takes only rank= and group="));
      bad = true;
    }
  }
  if (bad) return;

  // 参照検査（E-LAYOUTREF）は validator。重複は E-LAYOUTDUP で先勝ち。
  if (repoMap.layout.has(id)) {
    diagnostics.push(error("E-LAYOUTDUP", lineNo, `duplicate @layout line for '${id}'`, "use one @layout line per node"));
    return;
  }
  repoMap.layout.set(id, override);
  info.layoutLines.set(id, lineNo);
}

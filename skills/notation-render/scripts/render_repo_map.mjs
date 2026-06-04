#!/usr/bin/env node
// render_repo_map — CLI ファサード（DSL → HTML / JSON / Mermaid）
//
// パイプライン parse → validate → layout → emit を 1 本のコマンドにまとめる実行可能レンダラー。
// 入力は DSL テキストのみ（リポジトリを再走査しない）。同じ DSL からは同じ出力（決定的）。
// 仕様の正本は repo-map-notation/references/grammar.md と notation-render/references/*.md。
//
// 使い方:
//   node render_repo_map.mjs input.repo-map --format html > out.html
//   cat input.repo-map | node render_repo_map.mjs - --format json
//
// --format html|json|mermaid（既定 html）。json は parse/validate/layout 後の内部モデル確認用。
// 出力は stdout、診断は stderr。終了コード: 0 正常 / 1 検証エラー（描画せず）/ 2 使用法エラー。

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "./parser.mjs";
import { validate } from "./validator.mjs";
import { computeLayout } from "./layout.mjs";
import { emitHtml } from "./html_emitter.mjs";
import { emitMermaid } from "./mermaid_emitter.mjs";
import { resolveProfile } from "./profiles.mjs";
import { sortDiagnostics, formatDiagnostics, hasError } from "./diagnostics.mjs";

// テスト・他スクリプトからの利用向けに再エクスポート（facade）。
export { parse } from "./parser.mjs";
export { validate } from "./validator.mjs";
export { computeLayout } from "./layout.mjs";
export { emitHtml } from "./html_emitter.mjs";
export { emitMermaid } from "./mermaid_emitter.mjs";
export { sortDiagnostics, formatDiagnostics, hasError } from "./diagnostics.mjs";

const FORMATS = new Set(["html", "json", "mermaid"]);

// --- 純関数: テキスト → 出力 ---

/**
 * DSL テキストを 1 形式へレンダリングする純関数。
 * @param {string} text  DSL 本文
 * @param {"html"|"json"|"mermaid"} format
 * @param {string|null} [sourcePath]  入力 DSL の絶対パス（html のみ使用）。`<html data-repo-map-dsl>`
 *   に埋め込み、Viewer の Copy プロンプトの `repo-map DSL file:` 行に使う。stdin 等で不明なら null（埋め込まない）。
 * @returns {{ ok: boolean, output: string, diagnostics: object[] }}
 *   ok=false（error あり）なら output は空文字。diagnostics は警告も含む（描画時も報告する）。
 */
export function render(text, format = "html", sourcePath = null) {
  const { repoMap, profile, diagnostics: parseDiags, info, fatal } = parse(text);
  const all = sortDiagnostics(fatal ? parseDiags : parseDiags.concat(validate(repoMap, info, profile)));

  if (hasError(all)) return { ok: false, output: "", diagnostics: all };

  let output;
  if (format === "json") {
    output = toJson(repoMap, profile);
  } else if (format === "mermaid") {
    output = emitMermaid(repoMap, profile);
  } else {
    const layout = computeLayout(repoMap, profile);
    output = emitHtml(repoMap, layout, { sourcePath, profile });
  }
  return { ok: true, output, diagnostics: all };
}

/** 内部モデル（grammar.md §4）を決定的 JSON（2 スペース）にする。Map は挿入順で配列化。
 *  meta の scope キー名（repo-map=root / document-map=source）はプロファイル由来。 */
export function toJson(repoMap, profile) {
  const p = resolveProfile(profile, repoMap);
  const meta = {};
  meta[p.scopeKey] = repoMap.meta[p.scopeKey];
  meta.depth = repoMap.meta.depth;
  if (repoMap.meta.focus !== undefined) meta.focus = repoMap.meta.focus;
  meta.generated = repoMap.meta.generated;

  const nodes = [];
  for (const [, n] of repoMap.nodes) {
    const node = { id: n.id, kind: n.kind, label: n.label };
    if (n.path !== undefined) node.path = n.path;
    nodes.push(node);
  }

  const edges = repoMap.edges.map((e) => ({ index: e.index, from: e.from, to: e.to, relation: e.relation }));

  const layout = [];
  for (const [, ov] of repoMap.layout) {
    const o = { id: ov.id };
    if (ov.rank !== undefined) o.rank = ov.rank;
    if (ov.group !== undefined) o.group = ov.group;
    layout.push(o);
  }

  return JSON.stringify({ version: repoMap.version, meta, nodes, edges, layout }, null, 2) + "\n";
}

// --- CLI ---

function parseArgs(argv) {
  let format = "html";
  let input = null; // ファイルパス、"-"、または null（=stdin）
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--format" || a === "-f") {
      format = argv[++i];
    } else if (a.startsWith("--format=")) {
      format = a.slice("--format=".length);
    } else if (a === "--help" || a === "-h") {
      return { help: true };
    } else if (a === "-") {
      input = "-";
    } else if (a.startsWith("-")) {
      return { error: `unknown option: ${a}` };
    } else {
      input = a;
    }
  }
  return { format, input };
}

const USAGE =
  "usage: render_repo_map.mjs [input.repo-map | -] --format html|json|mermaid\n" +
  "  入力を省略 / `-` で stdin。出力は stdout、診断は stderr。\n" +
  "  終了コード: 0 正常 / 1 検証エラー / 2 使用法エラー。\n";

export function main(argv, io = {}) {
  const out = io.stdout ?? process.stdout;
  const err = io.stderr ?? process.stderr;
  const args = parseArgs(argv);

  if (args.help) { out.write(USAGE); return 0; }
  if (args.error) { err.write(args.error + "\n" + USAGE); return 2; }
  if (!FORMATS.has(args.format)) {
    err.write(`unsupported --format '${args.format}'\n` + USAGE);
    return 2;
  }

  let text;
  try {
    text = args.input && args.input !== "-" ? readFileSync(args.input, "utf8") : readFileSync(0, "utf8");
  } catch (e) {
    err.write(`cannot read input: ${e.message}\n`);
    return 2;
  }

  // html 用に入力 DSL の絶対パスを解決して埋め込む（stdin / `-` は不明なので null）。
  // readFileSync 成功後なので realpathSync は存在保証あり。json/mermaid では未使用。
  const sourcePath = args.input && args.input !== "-" ? realpathSync(args.input) : null;

  const result = render(text, args.format, sourcePath);
  if (result.diagnostics.length) err.write(formatDiagnostics(result.diagnostics));
  if (!result.ok) return 1;
  out.write(result.output);
  return 0;
}

// 直接実行時のみ main を走らせる（import 時は副作用なし）。
function invokedDirectly() {
  try {
    return process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (invokedDirectly()) {
  process.exitCode = main(process.argv.slice(2));
}

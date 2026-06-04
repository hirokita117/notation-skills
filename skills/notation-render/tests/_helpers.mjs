// _helpers — テスト共通ヘルパ（`*.test.mjs` ではないので test runner には拾われない）

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { parse } from "../scripts/parser.mjs";
import { validate } from "../scripts/validator.mjs";
import { sortDiagnostics } from "../scripts/diagnostics.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const examplesDir = join(here, "..", "examples");
export const scriptsDir = join(here, "..", "scripts");
export const cliPath = join(scriptsDir, "render_repo_map.mjs");
// リポジトリ直下の生成済みギャラリー（build-gallery.mjs の出力先）。
export const galleryDir = join(here, "..", "..", "..", "gallery");

export function readExample(name) {
  return readFileSync(join(examplesDir, name), "utf8");
}

export function readGallery(name) {
  return readFileSync(join(galleryDir, name), "utf8");
}

/** parse → validate → sort した全診断（決定的順）。 */
export function allDiagnostics(text) {
  const { repoMap, diagnostics, info, fatal } = parse(text);
  const all = fatal ? diagnostics : diagnostics.concat(validate(repoMap, info));
  return sortDiagnostics(all);
}

export const codes = (text) => allDiagnostics(text).map((d) => d.code);
export const hasCode = (text, code) => codes(text).includes(code);

/** 最小の有効ドキュメントを組み立てる（meta は固定）。 */
export function doc(nodes, edges = "", layout = "") {
  let s = "# repo-map v1\n@meta\n  root: .\n  depth: 2\n  generated: 2026-01-01T00:00:00Z\n";
  s += "\n@nodes\n" + nodes.trim().split("\n").map((l) => "  " + l.trim()).join("\n") + "\n";
  s += "\n@edges\n";
  if (edges.trim()) s += edges.trim().split("\n").map((l) => "  " + l.trim()).join("\n") + "\n";
  if (layout.trim()) s += "\n@layout\n" + layout.trim().split("\n").map((l) => "  " + l.trim()).join("\n") + "\n";
  return s;
}

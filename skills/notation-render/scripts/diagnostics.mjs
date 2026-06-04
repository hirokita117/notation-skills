// diagnostics — 診断の生成・整形・決定的ソート
//
// grammar.md §7.1（メッセージ書式・出力順）の実装。書式は正準:
//   <severity> <CODE> [line <n>]: <message> (remedy: <remedy>)
// 出力順は「ソース行の昇順 → 全体検査（line=null）→ コードのアルファベット順」で決定的にする。

// --- 生成 ---

/**
 * 1 件の診断を作る。
 * @param {"error"|"warning"} severity
 * @param {string} code  安定コード（例 "E-EDGEREF"）
 * @param {number|null} line  1 始まりの行番号。全体検査は null。
 * @param {string} message  端的な事実
 * @param {string} remedy  命令形の処方
 */
export function diag(severity, code, line, message, remedy) {
  return { severity, code, line: line ?? null, message, remedy };
}

export const error = (code, line, message, remedy) => diag("error", code, line, message, remedy);
export const warning = (code, line, message, remedy) => diag("warning", code, line, message, remedy);

// --- 整形 ---

/** grammar.md §7.1 の正準書式に整形する。 */
export function formatDiagnostic(d) {
  const where = d.line == null ? "" : ` [line ${d.line}]`;
  return `${d.severity} ${d.code}${where}: ${d.message} (remedy: ${d.remedy})`;
}

/** 診断リストを 1 行ずつ整形して連結（末尾改行付き）。空なら空文字。 */
export function formatDiagnostics(list) {
  if (list.length === 0) return "";
  return list.map(formatDiagnostic).join("\n") + "\n";
}

// --- ソート（決定的・grammar.md §7.1） ---

/**
 * 「ソース行の昇順 → 全体検査 → コードのアルファベット順」で並べ替えた新しい配列を返す。
 * 同一 (line, code) は元の挿入順を保つ（Array.prototype.sort は安定）。
 */
export function sortDiagnostics(list) {
  return [...list].sort((a, b) => {
    const aWhole = a.line == null;
    const bWhole = b.line == null;
    // 行付き診断を先に、全体検査（line=null）を後に
    if (aWhole !== bWhole) return aWhole ? 1 : -1;
    // どちらも行付きなら行番号昇順
    if (!aWhole && a.line !== b.line) return a.line - b.line;
    // 同じ行 / どちらも全体検査ならコードのアルファベット順（ASCII）
    if (a.code < b.code) return -1;
    if (a.code > b.code) return 1;
    return 0; // 安定ソートで挿入順を保持
  });
}

// --- 判定 ---

/** error が 1 件でもあるか（描画前ゲート）。 */
export function hasError(list) {
  return list.some((d) => d.severity === "error");
}

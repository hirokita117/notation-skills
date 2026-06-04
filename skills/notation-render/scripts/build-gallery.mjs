#!/usr/bin/env node
// build-gallery — repo-map DSL カタログ（Storybook 風ギャラリー）の決定的ビルダー
//
// examples/*.dsl を走査し、各例の「DSL 全文 / 生成 HTML（インタラクティブ Viewer・iframe）」を
// 1 画面で見比べる静的ギャラリーを生成する。生成は render_repo_map.mjs（決定的レンダラー）に委譲し、
// Storybook 本体や npm 依存は使わない（Node 標準ライブラリのみ）。成果物は file:// で開ける。
//
// 出力（既定でリポジトリ直下 gallery/）:
//   gallery/index.html        … 左=バージョン別ストーリー一覧、右=[Preview HTML][DSL source] タブ
//   gallery/<id>.html         … 各 valid 例の生成 HTML（iframe プレビュー用）
// invalid な例は描画せず、stderr 形式の診断（diagnostics）を一覧に表示する。
//
// 使い方:
//   node skills/notation-render/scripts/build-gallery.mjs
//
// 決定的: 同じ examples/ からは常に同じバイト列を出す（Date.now / random 不使用、ストーリーは
// [version, id] で安定ソート）。テスト向けに parseStoryMeta / buildStory / renderIndexHtml を export。
//
// 注意（意図的な相対パス）: HTML プレビューに埋め込む DSL パス（`data-repo-map-dsl`）は
// CLI の realpathSync 絶対パスではなく **リポジトリ相対の固定文字列** を渡す。絶対パスは機種依存で
// 非決定的になり、コミットする gallery/*.html が可搬でなくなるため。ここでは render() を直接呼んで回避する。

import { readFileSync, writeFileSync, readdirSync, mkdirSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

import { render, sortDiagnostics, formatDiagnostics } from "./render_repo_map.mjs";

const here = dirname(fileURLToPath(import.meta.url));
// scripts/ から見た既定パス。examples は隣、gallery はリポジトリ直下（scripts/../../../gallery）。
const DEFAULT_EXAMPLES_DIR = join(here, "..", "examples");
const DEFAULT_OUT_DIR = join(here, "..", "..", "..", "gallery");
// examples/ ファイルのリポジトリ相対パス接頭辞（data-repo-map-dsl 用・可搬で決定的）。
const EXAMPLES_REL_PREFIX = "skills/notation-render/examples";

// --- メタ抽出（純関数・テスト対象） ---

/**
 * ストーリーのメタ情報を DSL テキストから導く。
 * - version: 先頭の `# repo-map vN` ヘッダから（描画成否と独立。将来 v2 が invalid でもバージョンで分類）。
 * - title:   任意コメント `# story: ...`。無ければ id。
 * - desc:    任意コメント `# desc: ...`。無ければ valid は @meta からの自動要約、invalid は診断件数。
 * - tags:    invalid（描画不可）/ layout（@layout あり）/ focus（@meta focus あり）を自動判定。
 * @param {string} id  拡張子なしのストーリー ID（例 "example-a"）
 * @param {string} dslText
 * @returns {{ version: string, title: string, desc: string, tags: string[] }}
 */
export function parseStoryMeta(id, dslText) {
  const lines = dslText.split(/\r?\n/);

  const firstNonBlank = lines.find((l) => l.trim() !== "") ?? "";
  const vm = firstNonBlank.match(/^#\s*((?:repo-map|document-map)\s+v\d+)\b/i);
  const version = vm ? vm[1].replace(/\s+/g, " ") : "unknown";

  const storyLine = lines.map((l) => l.match(/^#\s*story:\s*(.+?)\s*$/)).find(Boolean);
  const descLine = lines.map((l) => l.match(/^#\s*desc:\s*(.+?)\s*$/)).find(Boolean);

  const res = render(dslText, "json");
  const valid = res.ok;
  const model = valid ? JSON.parse(res.output) : null;

  const tags = [];
  if (!valid) tags.push("invalid");
  // layout: valid は parse 済みモデルの真実、invalid はアンカー一致の行スキャンで代替。
  const layoutPresent = valid
    ? Array.isArray(model.layout) && model.layout.length > 0
    : lines.some((l) => l.trimEnd() === "@layout");
  if (layoutPresent) tags.push("layout");
  // focus: 同上。invalid は @meta 配下のインデント行 `focus:` をアンカー一致で拾う。
  const focusPresent = valid
    ? model.meta && model.meta.focus !== undefined
    : lines.some((l) => /^\s+focus:\s/.test(l));
  if (focusPresent) tags.push("focus");

  const title = storyLine ? storyLine[1] : id;

  let desc;
  if (descLine) {
    desc = descLine[1];
  } else if (valid) {
    // scope キーは版で異なる（repo-map=root / document-map=source）。存在する方を表示。
    const { depth, focus } = model.meta;
    const scopeKey = model.meta.root !== undefined ? "root" : "source";
    const parts = [`${scopeKey}=${model.meta[scopeKey]}`, `depth=${depth}`,
      `${model.nodes.length} nodes / ${model.edges.length} edges`];
    if (focus !== undefined) parts.push(`focus=${focus}`);
    desc = parts.join(" · ");
  } else {
    const errs = sortDiagnostics(res.diagnostics).filter((d) => d.severity === "error").length;
    desc = `${errs} 件のエラー（描画不可）`;
  }

  return { version, title, desc, tags };
}

/**
 * 1 ストーリー分の成果物を組み立てる純関数。valid なら html を生成、invalid なら診断テキストを持つ。
 * @param {string} id  拡張子なし ID
 * @param {string} dslText
 * @param {string} relPath  HTML に埋め込む DSL のリポジトリ相対パス
 * @returns {{ id, version, title, desc, tags, valid, dsl, html, diagnostics }}
 */
export function buildStory(id, dslText, relPath) {
  const meta = parseStoryMeta(id, dslText);
  const valid = !meta.tags.includes("invalid");
  if (!valid) {
    const r = render(dslText, "json");
    return {
      ...meta, id, valid,
      dsl: dslText, html: null,
      diagnostics: formatDiagnostics(sortDiagnostics(r.diagnostics)),
    };
  }
  return {
    ...meta, id, valid,
    dsl: dslText,
    html: render(dslText, "html", relPath).output,
    diagnostics: null,
  };
}

// --- index.html 生成（純関数・テスト対象） ---

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// `</script>` 脱出・行区切り混入を防いで JSON を <script> に安全に埋める。
function embedJson(value) {
  return JSON.stringify(value).replace(/[<\u2028\u2029]/g, (c) =>
    "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

/** ストーリー配列（[version,id] 順を想定）から自己完結 HTML を組み立てる。決定的。 */
export function renderIndexHtml(stories) {
  // バージョンごとにグループ化（出現順を保持）。
  const groups = [];
  const byVersion = new Map();
  for (const s of stories) {
    if (!byVersion.has(s.version)) {
      const g = { version: s.version, items: [] };
      byVersion.set(s.version, g);
      groups.push(g);
    }
    byVersion.get(s.version).items.push(s);
  }

  const tagChip = (t) => `<span class="tag tag-${escapeHtml(t)}">${escapeHtml(t)}</span>`;
  const storyButton = (s) =>
    `      <li><button class="story-btn" data-id="${escapeHtml(s.id)}">` +
    `<span class="st-title">${escapeHtml(s.title)}</span>` +
    `<span class="st-desc">${escapeHtml(s.desc)}</span>` +
    `<span class="st-tags">${s.tags.map(tagChip).join("")}</span>` +
    `</button></li>`;
  const groupSection = (g) =>
    `    <section class="group">\n` +
    `      <h2>${escapeHtml(g.version)}</h2>\n` +
    `      <ul>\n${g.items.map(storyButton).join("\n")}\n      </ul>\n` +
    `    </section>`;

  // 詳細ペインに渡すデータ（DSL/診断は textContent で注入するので HTML エスケープ不要）。
  const data = {};
  for (const s of stories) {
    data[s.id] = {
      title: s.title, version: s.version, tags: s.tags, valid: s.valid,
      dsl: s.dsl,
      html: s.valid ? `${s.id}.html` : null,
      diagnostics: s.diagnostics,
    };
  }
  const firstId = stories.length ? stories[0].id : "";

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>notation DSL カタログ</title>
<style>
  :root { --fg:#111827; --muted:#6B7280; --border:#E5E7EB; --bg:#F9FAFB; --accent:#2563EB;
    --font: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:var(--font); color:var(--fg); background:var(--bg); }
  header { padding:14px 20px; border-bottom:1px solid var(--border); background:#fff; }
  header h1 { margin:0; font-size:18px; }
  header .sub { margin:4px 0 0; font-size:13px; color:var(--muted); }
  .app { display:flex; align-items:stretch; min-height: calc(100vh - 64px); }
  .sidebar { width:340px; flex:0 0 340px; border-right:1px solid var(--border); background:#fff;
    overflow:auto; padding:8px 0; }
  .group { margin:0 0 6px; }
  .group h2 { font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:var(--muted);
    margin:10px 16px 4px; }
  .group ul { list-style:none; margin:0; padding:0; }
  .story-btn { display:block; width:100%; text-align:left; border:0; background:transparent;
    border-left:3px solid transparent; padding:8px 14px; cursor:pointer; font-family:inherit; }
  .story-btn:hover { background:var(--bg); }
  .story-btn.active { background:#EFF6FF; border-left-color:var(--accent); }
  .st-title { display:block; font-size:13px; font-weight:600; }
  .st-desc { display:block; font-size:11px; color:var(--muted); margin-top:2px; }
  .st-tags { display:block; margin-top:4px; }
  .tag { display:inline-block; font-size:10px; padding:1px 6px; border-radius:999px; margin-right:4px;
    background:#F3F4F6; color:#374151; border:1px solid var(--border); }
  .tag-layout { background:#ECFDF5; color:#065F46; border-color:#A7F3D0; }
  .tag-focus { background:#FFFBEB; color:#92400E; border-color:#FDE68A; }
  .tag-invalid { background:#FEF2F2; color:#991B1B; border-color:#FECACA; }
  .detail { flex:1 1 auto; display:flex; flex-direction:column; min-width:0; padding:16px; }
  .detail-head { font-size:14px; font-weight:600; margin:0 0 8px; }
  .tabs { display:flex; gap:4px; border-bottom:1px solid var(--border); margin-bottom:12px; }
  .tab-btn { border:0; background:transparent; padding:8px 12px; cursor:pointer; font-family:inherit;
    font-size:13px; color:var(--muted); border-bottom:2px solid transparent; margin-bottom:-1px; }
  .tab-btn:hover { color:var(--fg); }
  .tab-btn.active { color:var(--accent); border-bottom-color:var(--accent); font-weight:600; }
  .tab-btn[hidden] { display:none; }
  .pane { display:none; }
  .pane.active { display:block; }
  .preview-frame { width:100%; height:740px; border:1px solid var(--border); border-radius:8px; background:#fff; }
  pre.code { border:1px solid var(--border); border-radius:8px; background:#fff; padding:12px;
    font-family:var(--mono); font-size:12px; line-height:1.5; overflow:auto; white-space:pre; margin:0; }
  pre.diag { color:#991B1B; }
</style>
</head>
<body>
<header>
  <h1>notation DSL カタログ</h1>
  <p class="sub">repo-map v1 / document-map v1 の代表例を「DSL 全文 / 生成 HTML」で見比べる。左で例を選び、右のタブで切り替え。</p>
</header>
<div class="app">
  <nav class="sidebar">
${groups.map(groupSection).join("\n")}
  </nav>
  <main class="detail">
    <div class="detail-head" id="detail-title"></div>
    <div class="tabs">
      <button class="tab-btn" data-tab="preview">Preview HTML</button>
      <button class="tab-btn" data-tab="dsl">DSL source</button>
      <button class="tab-btn" data-tab="diag">Diagnostics</button>
    </div>
    <div class="panes">
      <div class="pane" data-pane="preview"><iframe class="preview-frame" id="preview" title="repo-map HTML preview"></iframe></div>
      <div class="pane" data-pane="dsl"><pre class="code" id="dsl-pre"></pre></div>
      <div class="pane" data-pane="diag"><pre class="code diag" id="diag-pre"></pre></div>
    </div>
  </main>
</div>
<script type="application/json" id="stories-data">${embedJson(data)}</script>
<script>
(function () {
  var DATA = JSON.parse(document.getElementById("stories-data").textContent);
  var FIRST = ${embedJson(firstId)};
  var current = null, currentTab = null;

  var titleEl = document.getElementById("detail-title");
  var iframe = document.getElementById("preview");
  var dslPre = document.getElementById("dsl-pre");
  var diagPre = document.getElementById("diag-pre");
  var tabBtns = Array.prototype.slice.call(document.querySelectorAll(".tab-btn"));
  var panes = Array.prototype.slice.call(document.querySelectorAll(".pane"));

  function tabsFor(s) { return s.valid ? ["preview", "dsl"] : ["dsl", "diag"]; }

  function showTab(tab) {
    var s = DATA[current];
    if (!s) return;
    if (tabsFor(s).indexOf(tab) === -1) tab = tabsFor(s)[0];
    currentTab = tab;
    tabBtns.forEach(function (b) { b.classList.toggle("active", b.dataset.tab === tab); });
    panes.forEach(function (p) { p.classList.toggle("active", p.dataset.pane === tab); });
    if (tab === "preview") {
      if (iframe.getAttribute("src") !== s.html) iframe.setAttribute("src", s.html);
    } else if (tab === "dsl") {
      dslPre.textContent = s.dsl;
    } else if (tab === "diag") {
      diagPre.textContent = s.diagnostics || "";
    }
  }

  function selectStory(id) {
    if (!DATA[id]) return;
    current = id;
    var s = DATA[id];
    titleEl.textContent = s.title + "  —  " + s.version;
    document.querySelectorAll(".story-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.id === id);
    });
    var avail = tabsFor(s);
    tabBtns.forEach(function (b) { b.hidden = avail.indexOf(b.dataset.tab) === -1; });
    showTab(avail[0]);
  }

  document.querySelectorAll(".story-btn").forEach(function (b) {
    b.addEventListener("click", function () { selectStory(b.dataset.id); });
  });
  tabBtns.forEach(function (b) {
    b.addEventListener("click", function () { showTab(b.dataset.tab); });
  });

  if (FIRST) selectStory(FIRST);
})();
</script>
</body>
</html>
`;
}

// --- ビルド（ファイル書き出し） ---

/**
 * examples/*.dsl を走査して gallery/ を再生成する。
 * @param {{ examplesDir?: string, outDir?: string }} [opts]
 * @returns {{ outDir: string, stories: object[] }}
 */
export function buildGallery(opts = {}) {
  const examplesDir = opts.examplesDir ?? DEFAULT_EXAMPLES_DIR;
  const outDir = opts.outDir ?? DEFAULT_OUT_DIR;

  const files = readdirSync(examplesDir).filter((f) => f.endsWith(".dsl")).sort();
  const stories = files.map((f) => {
    const id = basename(f, ".dsl");
    const dslText = readFileSync(join(examplesDir, f), "utf8");
    const relPath = `${EXAMPLES_REL_PREFIX}/${f}`;
    return buildStory(id, dslText, relPath);
  });
  // 一覧は [version, id] で安定ソート（決定的）。
  stories.sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  mkdirSync(outDir, { recursive: true });
  for (const s of stories) {
    if (s.valid) {
      writeFileSync(join(outDir, `${s.id}.html`), s.html);
    }
  }
  writeFileSync(join(outDir, "index.html"), renderIndexHtml(stories));
  return { outDir, stories };
}

// --- CLI ---

// 直接実行時のみビルドする（import 時は副作用なし）。render_repo_map.mjs と同じ判定。
function invokedDirectly() {
  try {
    return process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  const { outDir, stories } = buildGallery();
  const valid = stories.filter((s) => s.valid).length;
  const invalid = stories.length - valid;
  process.stdout.write(
    `gallery: ${stories.length} ストーリー（valid ${valid} / invalid ${invalid}）→ ${outDir}/index.html\n`
  );
}

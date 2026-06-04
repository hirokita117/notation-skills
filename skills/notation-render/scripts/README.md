# notation-render scripts — 決定的レンダラー（`repo-map v1` DSL → SVG / HTML / JSON）

`repo-map v1` DSL **テキストだけ**を入力に、`parse → validate → layout → emit` をコードで機械的に実行する
実行可能レンダラー。**同じ DSL からは毎回同じ出力**（乱数・時刻・実行環境差・LLM 判断に依存しない）。
リポジトリを再走査せず、入力は DSL テキストのみ。

> このスクリプトは仕様の**実装**であり、正本は次の `.md`：
> 文法・列挙・検証 = [`repo-map-notation/references/grammar.md`](../../repo-map-notation/references/grammar.md)、
> レイアウト = [`../references/layout-algorithm.md`](../references/layout-algorithm.md)、
> テーマ = [`../references/theme.md`](../references/theme.md)、
> 出力形式 = [`../references/output-formats.md`](../references/output-formats.md)、
> インタラクティブ HTML 契約 = [`repo-map-interactive-viewer/references/html-viewer-contract.md`](../../repo-map-interactive-viewer/references/html-viewer-contract.md)。
> **挙動と `.md` が食い違ったら `.md` を正とし、スクリプトを直す。**

## 必要環境

- **Node.js 18+（推奨 20+）**。`node:test` と `node --test` を使うため。
- **外部依存ゼロ**（Node.js 標準ライブラリのみ）。`package.json` も不要。
  - 外部依存を追加する場合は、その理由をこの README に明記すること（現状は不要なので追加していない）。

## 使い方（CLI）

```sh
# ファイルから SVG（既定）
node render_repo_map.mjs input.repo-map --format svg > out.svg

# 単体 HTML（インタラクティブ Viewer・ドラッグ可）
node render_repo_map.mjs input.repo-map --format html > out.html

# stdin から内部モデル（JSON）
cat input.repo-map | node render_repo_map.mjs - --format json
```

- `--format svg|html|json|mermaid`（既定 `svg`、`-f` も可）。
  - `svg` … 単一・自己完結の SVG（**決定的な正典**）。
  - `html` … SVG を埋め込んだ単体 HTML。凡例・クリック詳細パネル・`Ask Claude Code` / `Copy prompt`・
    ノードドラッグを含む（契約は html-viewer-contract.md）。生成直後にブラウザで開ける。
  - `json` … `parse → validate → layout` 後の内部モデル `RepoMap`（確認・デバッグ用）。
  - `mermaid` … `graph TD` への機械変換（**任意・正本にしない**。Mermaid が独自に配置するため幾何は非決定）。
- 入力はファイルパス、または `-`／省略で **stdin**。
- 出力は **stdout**、診断（`<severity> <CODE> [line n]: <message> (remedy: …)`）は **stderr**。
- 終了コード: `0` 正常 / `1` 検証エラー（**error があれば描画せず**診断を出す）/ `2` 使用法エラー（不正な `--format` など）。
- **警告**（W-*）は描画をブロックせず、stderr に報告しつつ出力する。

## 決定性

- `parse` / `validate` / `layout` / `emit` のいずれにも乱数・実行時刻・環境差を入れない。
- 並び順を決める比較はすべて全順序（最後の決め手はノードのソース順 / エッジの `index`）。
- 例外は `mermaid` のみ（レイアウトを Mermaid に委ねる）。SVG が決定的な正典。
- HTML の**ドラッグは閲覧時の操作のみ**で、出力ファイル＝リロード時の初期レイアウトは決定的レイアウトのまま。

## モジュール構成（1 責務 1 ファイル＋ facade）

| ファイル | 責務 |
|----------|------|
| `model.mjs` | 内部モデルの型・閉じた列挙（kind/relation）・補助定数（葉・依存ゼロ） |
| `diagnostics.mjs` | 診断の生成・正準書式・決定的ソート（grammar.md §7.1） |
| `parser.mjs` | 字句分類・セクション状態機械・§3.5 ラベル/パス・引用走査 → `RepoMap` |
| `validator.mjs` | §7 の意味検査（参照整合・必須キー・規模上限・警告） |
| `layout.mjs` | 決定的レイアウト（rank / 循環断ち / 最長路 / group / 座標 / エッジ経路） |
| `theme.mjs` | 固定テーマ定数（色・フォント・寸法）と決定的ラベル省略 |
| `attrs.mjs` | `data-*` 属性と DSL 抜粋の導出（SVG/HTML 共有） |
| `svg_emitter.mjs` | 単一 SVG 文字列（決定的正典） |
| `html_emitter.mjs` | 完全 Viewer（固定テンプレ＋注入 SVG＋ドラッグ） |
| `mermaid_emitter.mjs` | `graph TD` への機械変換（任意） |
| `render_repo_map.mjs` | CLI ファサード（引数解析・stdin/file・dispatch・終了コード）＋兄弟再エクスポート |

## テスト

Node.js 標準の `node:test`（ゼロインストール）。リポジトリルートから:

```sh
node --test skills/notation-render/tests/
```

少なくとも次を確認する: valid DSL のパース / invalid DSL の error / 同じ DSL から同じ layout /
同じ DSL から同じ SVG 文字列 / `@layout rank=` の反映 / 未定義ノード参照の error /
コミット済みスナップショット（[`../examples/`](../examples/)）とのバイト一致。

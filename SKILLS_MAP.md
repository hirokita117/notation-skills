# SKILLS_MAP — Skill の連携

このリポジトリの中核 Skill は、**「思想 → 生成 → 描画」**の一方向パイプラインとして連携します。**生成は対象別に 2 つ**（リポジトリ＝`repo-map-notation` / ドキュメント＝`document-map-notation`）あり、どちらも**同じ描画**（`notation-render`）に合流します。さらに、生成済み HTML をローカル Claude Code とつなぐ**アドオン**（`repo-map-interactive-viewer`）がパイプラインの外側に乗ります。各 Skill の責務と、**どの事実をどこが正本として持つか**をここで一覧します。

---

## 連携表

| 順序 | Skill | 役割 | 出力 | いつ使うか |
|------|-------|------|------|-----------|
| 0 | `notation-core` | 共通土台（記法中心設計の思想・用語・原則・検証観） | 原則 | 初回・設計判断に迷ったとき（毎回は不要） |
| 1a | `repo-map-notation` | リポジトリ構造を `repo-map v1` DSL に落とす | `repo-map v1` テキスト | 「このリポジトリを図解して」「アーキテクチャ地図」 |
| 1b | `document-map-notation` | ドキュメント内容（構造・論点・関係）を `document-map v1` DSL に落とす | `document-map v1` テキスト | 「このドキュメントを図解して」「PRD の論点マップ」「議事録を関係図に」 |
| 2 | `notation-render` | DSL **だけ**を読んで図にする（決定的・先頭行でバージョン分岐） | HTML / JSON（任意で Mermaid）。主経路は実行可能レンダラー `scripts/render_repo_map.mjs` | 「この DSL を HTML に」 |
| ＋ | `repo-map-interactive-viewer` | 生成済みインタラクティブ HTML をローカル Claude Code とつなぐ対話ビューア（**描画はしない**・DSL 正本も変えない。repo-map / document-map 両 HTML 対応） | ブリッジ起動手順・質問→回答 | 「HTML をクリックして Claude に質問したい」 |

---

## 典型フロー

```
 リポジトリ図解の依頼            ドキュメント図解の依頼
        │                              │
        ▼                              ▼
  repo-map-notation              document-map-notation
        │                              │
        │ repo-map v1 テキスト         │ document-map v1 テキスト
        │  （これが正本）              │  （これが正本）
        └──────────────┬───────────────┘
                       ▼
               notation-render          ← 先頭行でバージョン分岐 → parse → validate → layout → emit
                       │
                       ▼
                     HTML
```

- 2 つの生成 Skill は**対象が違うだけ**（リポジトリ / ドキュメント）で、出力はどちらも固定文法 DSL。`notation-render` は先頭行（`# repo-map v1` / `# document-map v1`）で対応プロファイルを選び、**同じパイプライン**で図にします。
- `notation-core` はこのパイプラインの**外側にある土台**です。原則に立ち返りたいとき、新しい記法を設計したいときに読みます。
- パイプラインは**一方向**です。`notation-render` が DSL の不足や矛盾に気づいたら、**自分で補完せず** その DSL を出した生成 Skill（`repo-map-notation` / `document-map-notation`）に差し戻します（元データの再走査はしません）。
- `repo-map-interactive-viewer` はパイプラインの**外側のアドオン**です。`notation-render` が出した**インタラクティブ HTML を入力**に、ローカル Claude Code とつないで理解を補助します。ここでの対話は読み取り専用で、**DSL 正本を変えません**。「もっと深く」は Viewer で描き足すのではなく `repo-map-notation` に戻り、スコープを絞った新 DSL を作って描き直します。

---

## 「正本」の所在（ドリフト防止）

各 Skill が同じ事実を別々に書くと、生成された DSL が描画できなくなります。そこで**共有事実は 1 箇所だけが正本を持ち、他はそこを参照**します。

| 共有事実 | 正本（ここを編集する） | 参照する側 |
|----------|------------------------|-----------|
| バージョン文字列 `repo-map v1` | `repo-map-notation/references/grammar.md` | `notation-render/references/render-contract.md` |
| `kind` 列挙（system / package / module / file-group / external / datastore） | `repo-map-notation/references/grammar.md` | `notation-render`（描画時の色・形） |
| `relation` 列挙（contains / imports / calls / deploys / reads / owns）と階層系・依存系の区別 | `repo-map-notation/references/grammar.md` | `notation-render`（実線・破線、ランク） |
| セクション構成と順序（`@meta` → `@nodes` → `@edges` → `@layout`） | `repo-map-notation/references/grammar.md` | `notation-render/references/render-contract.md` |
| label↔path の区別ルール（複数語ラベルは引用、path は直後の唯一の裸トークン） | `repo-map-notation/references/grammar.md` | `notation-render`（パーサ） |
| 検証コードと重大度・上限（ノード ≤ 40 / エッジ ≤ 80 / 有意行 ≤ 200） | `repo-map-notation/references/grammar.md` | `notation-render/references/render-contract.md`（描画前ゲート） |
| 内部モデル `RepoMap` の形 | `repo-map-notation/references/grammar.md` | `notation-render/references/render-contract.md` |
| `document-map v1` の文法・列挙（9 kind / 9 relation）・階層/依存分類・検証・内部モデル・scope メタキー `source` | `document-map-notation/references/grammar.md` | `notation-render`（`scripts/profiles.mjs` ＋ `render-contract.md`） |
| バージョン別プロファイル（列挙・色・scope キー・depth×kind・mermaid 形の切替） | `notation-render/scripts/profiles.mjs`（各 grammar.md / theme.md を写すだけ・正本は新設しない） | `notation-render`（parse/validate/layout/emit が参照） |
| document-map の kind ごとの色 | `notation-render/references/theme.md` | `notation-render`（`scripts/theme.mjs`） |
| 描画パイプライン名 `parse → validate → layout → emit` | `notation-render/references/render-contract.md` | `notation-render`（parse/validate の語彙は `notation-core` の同期ループに由来） |
| 決定的レイアウト（rank / group / 座標・寸法定数） | `notation-render/references/layout-algorithm.md` | `repo-map-notation`（サンプル描画の配置を語るとき） |
| テーマ定数（kind ごとの色・フォント・固定 hex） | `notation-render/references/theme.md` | `repo-map-notation`（サンプル描画の色を語るとき） |
| インタラクティブ HTML 契約（`data-*` スキーマ／`/api/ask` JSON 形／フォールバック／ドラッグ用属性） | `repo-map-interactive-viewer/references/html-viewer-contract.md` | `notation-render`（インタラクティブ HTML を出すとき） |
| 決定的レンダラ実装（`notation-render/scripts/*.mjs`） | **正本を新設しない**。上記 `.md`（grammar / layout-algorithm / theme / output-formats / html-viewer-contract）が正本 | スクリプト自身が上記を参照して実装 |

ルール: **各 DSL の文法・列挙・検証は、その DSL の grammar.md が唯一の正本**（`repo-map v1` = `repo-map-notation/references/grammar.md`、`document-map v1` = `document-map-notation/references/grammar.md`）。`notation-render` は「文法・列挙・検証コードは各 grammar.md を normative とする」と宣言し、再定義しない（`scripts/profiles.mjs` は各 grammar.md / theme.md の値を写すだけ）。`notation-core` は思想・用語・一般原則だけを持ち、具体値は持たない。

**`notation-render/scripts/` の実行可能レンダラーは上記 `.md` 仕様の「実装」であり、競合する正本を新設しない。** 挙動と `.md` が食い違ったら `.md` を正とし、スクリプトを直す。スクリプトは Node.js 標準ライブラリのみ・外部依存ゼロ（依存を足す場合は理由を `scripts/README.md` に明記）。

---

## バージョニング

各 DSL はバージョン文字列（先頭行 `# repo-map v1` / `# document-map v1`）で固定します。`notation-render` は先頭行を見て対応**プロファイル**（`scripts/profiles.mjs`）を選び、未知バージョンは描かず拒否します（バージョンをまたいで推測描画しない）。新しい DSL／バージョンを足すときは:

1. その DSL の `grammar.md`（正本）を更新／新設する。
2. `notation-render/scripts/profiles.mjs` にプロファイル（列挙・分類・色・scope キー・depth×kind・mermaid 形）を足し、`selectProfile` の先頭行→プロファイル分岐に登録する。
3. `notation-render` の入力契約で version 行の分岐を増やす。
4. 古いバージョンの DSL は、対応するプロファイルでのみ描画する。
5. 新しい DSL 表現・ノード定義を足したら、代表例を `gallery/` に載せる（`skills/notation-render/examples/` に `*.dsl` を置き `build-gallery.mjs` を実行）。

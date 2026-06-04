# CLAUDE.md

このファイルは、このリポジトリで作業する Claude Code 向けのガイドです。

## このリポジトリは何か

巨大リポジトリを、固定ルールの DSL **`repo-map v1`** を**正本（source of truth）**にして地図化する
Claude Code 用の **Agent Skills 集（plugin）**です。図そのものではなく「意味層（DSL）」を唯一の正本とし、
SVG / HTML はそこからの決定的な派生物として扱います。

- `skills/notation-core/` … 記法中心設計（Notation-first / MNP）の共通土台・用語・原則。
- `skills/repo-map-notation/` … リポジトリ → `repo-map v1` DSL（**DSL 生成のみ**。図は描かない）。
- `skills/notation-render/` … DSL → SVG / HTML / Mermaid（**決定的レンダリング**。入力は DSL テキストのみ）。
- `skills/repo-map-interactive-viewer/` … 生成済み HTML をローカル Claude Code とつなぐ対話ビューア。
- `gallery/` … `repo-map v1` の代表例を見比べる静的 DSL カタログ（`build-gallery.mjs` の生成物）。

全体像は [README.md](README.md) と [SKILLS_MAP.md](SKILLS_MAP.md) を参照。

## 「正本は `.md`」の原則（重要）

各 Skill は `SKILL.md`（本体）＋ `references/*.md`（詳細仕様）＋ 任意の `scripts/`（実装）の構成です。
**スクリプトは仕様の実装であり、正本は `.md`** です。挙動と `.md` が食い違ったら、`.md` を正としてスクリプトを直します。

- DSL 文法・列挙・検証 = `skills/repo-map-notation/references/grammar.md`
- レイアウト / テーマ / 出力形式 = `skills/notation-render/references/{layout-algorithm,theme,output-formats,render-contract}.md`

## よく使うコマンド

レンダラー・テストは外部依存ゼロ（Node.js 18+ 標準ライブラリのみ。`npm install` 不要）。

```sh
# DSL を描画（既定は SVG。html / json / mermaid も可）
node skills/notation-render/scripts/render_repo_map.mjs <input.dsl> --format svg > out.svg

# テスト（node 標準の node:test。リポジトリルートから）
node --test skills/notation-render/tests/

# DSL カタログ（gallery/）を再生成
node skills/notation-render/scripts/build-gallery.mjs
```

`notation-render` は決定的であることが要件です（同じ DSL なら毎回同じバイト列）。
乱数・時刻・実行環境差・LLM 判断を出力に混ぜないこと。

---

## 作業ルール（このリポジトリ固有・必ず守る）

### 1. 修正は Pull Request として出す。その際 plugin バージョンを必ず上げる

何らかの修正を行ったら、最終的なアウトプットは **Pull Request** にします。
**PR を出す時点で claude plugin のバージョンが変更されていなければ、必ず変更（bump）すること。**

- バージョンは次の **2 ファイルに重複**して書かれており、**常に同じ値に揃える**こと（片方だけの更新は不可）:
  - `.claude-plugin/plugin.json` の `"version"`
  - `.claude-plugin/marketplace.json` の `plugins[0].version`
- 採番は [semver](https://semver.org/lang/ja/)：
  - バグ修正・ドキュメント・内部リファクタ等 → **patch**（例 `1.3.1` → `1.3.2`）
  - DSL やノード定義の追加など後方互換のある機能追加 → **minor**（例 `1.3.1` → `1.4.0`）
  - DSL 文法の破壊的変更・互換性を壊す変更 → **major**（例 `1.3.1` → `2.0.0`）
- PR を作る直前に、現在の値が `main`（直近のリリース）から上がっているか確認する。
  上がっていなければ上げてからコミット・push する。

### 2. 新しい DSL 定義・ノード定義を作ったら `gallery/` に追加する

新しい `repo-map v1` の DSL 表現や、新しいノード（kind）・エッジ（relation）の定義を追加・実演したら、
代表例を **DSL カタログ（`gallery/`）に必ず載せる**こと。手順:

1. `skills/notation-render/examples/` に `*.dsl` を置く
   （任意で先頭に `# story: 表示名` / `# desc: 一行説明` コメントを付ける）。
2. `node skills/notation-render/scripts/build-gallery.mjs` を実行する。
3. `gallery/index.html` と各プレビュー（`<id>.svg` / `<id>.html`）が**再生成**される。
4. 生成された `gallery/` 配下と、新しい `.dsl` を**両方コミット**する
   （`gallery/` はコミット済みスナップショットで、テストがバイト一致を検証する）。

> DSL の**文法そのもの**を増やす場合は、まず正本 `skills/repo-map-notation/references/grammar.md` を更新し、
> 必要なら `notation-render` の実装・テストを追従させてから、上記の手順で `gallery/` に例を足す。

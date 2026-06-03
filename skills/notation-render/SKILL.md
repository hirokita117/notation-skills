---
name: notation-render
description: >
  notation（現時点は `repo-map v1` DSL）を、**DSL テキストだけ**を入力に、決定的に図へ変換する Skill。
  Render a notation DSL (currently `repo-map v1`) into a deterministic diagram — input is the DSL text ONLY.
  `parse → validate → layout → emit` の手順で、同じ DSL からは常に同じ図を出す。出力は SVG（既定・単一ファイル）、
  HTML（既定でクリック質問パネル付きのインタラクティブ Viewer・`data-*`＋凡例）、任意で Mermaid。色・フォント・配置は固定テーマと固定アルゴリズムで決まり、
  実行ごとにブレない。
  次のような発話で起動する:
  「この DSL を SVG にして」「repo-map を描画して」「notation を可視化して」「地図を HTML で見せて」
  「DSL を図にして」「repo-map v1 をレンダリングして」「この記法を絵にして」「構造図を SVG で出力」
  「出力された DSL を描いて」「同じ DSL なら同じ図にして」「凡例つきの HTML プレビューで」。
  禁止（重要・本文でも再掲）: 入力された DSL 以外（自然言語の要望・口頭のレイアウト・リポジトリの再走査）から
  図を描かないこと。DSL が無ければ描かず、不足や矛盾は `repo-map-notation` に差し戻すこと。
  同じ DSL から毎回異なるレイアウトを出さないこと。
---

# notation-render — DSL → 図（決定的レンダリング）

## 役割

入力された **notation の DSL テキストだけ**を読み、**決定的に**図へ変換する。現時点で受け付ける notation は **`repo-map v1` のみ**。設計の土台は [notation-core](../notation-core/SKILL.md)、文法・検証の正本は [repo-map-notation/references/grammar.md](../repo-map-notation/references/grammar.md)。この Skill はそれらを**再定義せず参照する**。

## 入力契約（最重要）

- **入力は DSL テキストのみ。** 受け付けるのは先頭行 `# repo-map v1` のテキスト。バージョン行で対応を分岐し、未知バージョンは描かず拒否する。
- **DSL 以外から描かない。** 自然言語の要望、口頭・チャットでのレイアウト指示、リポジトリの再走査——いずれも描画の入力にしない。図に出す情報は、すべて DSL に書かれていなければならない。
- **不足は差し戻す。** DSL に必要な情報が足りない／矛盾するときは、**自分で推測して埋めず**、[repo-map-notation](../repo-map-notation/SKILL.md) に戻して DSL を直してもらう。
- 詳細は [references/render-contract.md](references/render-contract.md)。

## パイプライン

```
parse → validate → layout → emit
```

1. **parse** — DSL を内部モデル `RepoMap` にする（[grammar.md](../repo-map-notation/references/grammar.md) §4）。
2. **validate** — 同じ検証規則を**描画前ゲート**として走らせる（[grammar.md](../repo-map-notation/references/grammar.md) §7）。**エラーがあれば描かない**（処方を報告して差し戻す）。警告は報告しつつ描く。
3. **layout** — `@layout` の rank/group を尊重し、無い／部分のところは決定的アルゴリズムで配置する（[references/layout-algorithm.md](references/layout-algorithm.md)）。
4. **emit** — 固定テーマで図を書き出す（[references/output-formats.md](references/output-formats.md)）。

## 出力の優先順位

1. **SVG**（既定）— 単一ファイル、埋め込み可能。まずこれを出す。
2. **HTML**（既定でインタラクティブ Viewer）— SVG＋凡例に、ノードクリックで質問できる固定 UI（`data-*` 属性＋質問パネル＋固定スクリプト）を載せる。決定的（同じ DSL → 同じ HTML）。`data-*` スキーマは [repo-map-interactive-viewer/references/html-viewer-contract.md](../repo-map-interactive-viewer/references/html-viewer-contract.md) を参照。Claude Code CLI 呼び出し・Python ブリッジは [`repo-map-interactive-viewer`](../repo-map-interactive-viewer/SKILL.md) の責務（ここでは出さない）。
3. **Mermaid**（任意）— `graph TD` への**機械的変換**。Mermaid は**正本にしない**（レイアウトは Mermaid 任せになり決定性の対象外）。

Figma API / Figma Skill は**使わない**。出力先として人が後から SVG/HTML を貼るのは自由だが、この Skill は Figma を描画経路にしない。詳細は [references/output-formats.md](references/output-formats.md)。

## レイアウト（要約）

- **意味は DSL の `@layout`（rank / group）を尊重**する。
- `@layout` が無い／部分的なときの既定: **ランク順のレイヤー配置（上から下）**。階層系の関係（contains/deploys/owns）からランクを決め、同じ `group` は横にクラスタする。
- **色・フォントは固定テーマ定数**（少数の hex）。ケースバイケースの美学議論はしない。
- 同じ DSL からは同じ座標・同じ色が出る（[references/layout-algorithm.md](references/layout-algorithm.md) §決定性）。

## 禁止事項（強調・再掲）

入力契約の裏返しとして、次を**してはならない**。

- ❌ **DSL なしで図を描く。** 「だいたいこんな感じで」式の自然言語から直接 SVG を起こさない。まず DSL を要求する（無ければ `repo-map-notation` へ）。
- ❌ **同じ DSL から毎回違うレイアウトを出す。** レイアウトに乱数・実行時刻・気分を持ち込まない。アルゴリズムは固定（同一 DSL → 同一 SVG）。
- ❌ **リポジトリを再走査して DSL を勝手に補完する。** 図に足りない情報は、描画側で埋めず `repo-map-notation` に差し戻す。描画側はリポジトリを読まない。

## reference 地図

| ファイル | 中身 | いつ読む |
|----------|------|----------|
| [references/render-contract.md](references/render-contract.md) | 受付 notation・バージョン分岐・パイプライン・検証ゲート | 入力の扱いを決めるとき |
| [references/layout-algorithm.md](references/layout-algorithm.md) | 決定的レイアウト＋テーマ定数（固定 hex） | 配置・色を出すとき |
| [references/output-formats.md](references/output-formats.md) | SVG / HTML / Mermaid の出し方、Figma 不使用 | 形式を選ぶとき |

## 関連スキル

- [repo-map-notation](../repo-map-notation/SKILL.md) — 入力 DSL の供給元。不足は必ずここへ差し戻す。
- [repo-map-interactive-viewer](../repo-map-interactive-viewer/SKILL.md) — 出力したインタラクティブ HTML を、ローカル Claude Code とつなぐ対話ビューア（CLI/ブリッジ側）。`data-*` の契約はここが正本。
- [notation-core](../notation-core/SKILL.md) — 「レンダラーは DSL だけを読む」「決定的であれ」という原則の出どころ。
- 連携全体は [SKILLS_MAP.md](../../SKILLS_MAP.md)。

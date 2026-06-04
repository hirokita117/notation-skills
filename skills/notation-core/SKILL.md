---
name: notation-core
description: >
  記法中心設計（Notation-first design / Mid Notation Pattern, MNP）の共通土台を提供する Skill。
  Shared principles for notation-first design: keep a DSL as the single source of truth and split
  generation from rendering. リポジトリ図解に限らず「意味層を DSL として正本化し、生成（AI・人が編集）と
  表現（描画）を分離する」設計の用語・原則・検証観を扱う。`repo-map-notation` と `notation-render` の
  土台であり、初回や設計判断に迷ったときに参照する。
  次のような発話で参照する:
  「記法の設計原則を知りたい」「DSL と描画を分けたい」「中間記法で図解したい」
  「MNP 的に状態をテキストで持ちたい」「記法中心設計とは何か」「DSL を正本にする設計にしたい」
  「意味層とレイアウトを分けたい」「AI に決まった記法で出力させたい」「同じ入力なら同じ図にしたい」
  「notation の共通ルールを決めたい」「新しい記法（DSL）を設計したい」「同期ループを設計したい」
  「自由作図をやめて決まった記法にしたい」。
  この Skill 自体は具体的な DSL 文法を定義しない（それは `repo-map-notation` の役割）。原則と用語のみを扱う。
---

# notation-core — 記法中心設計の共通土台

## これは何か

**記法中心設計（Notation-first design）**は、対象（ここではソフトウェアの構造）を、まず**短いテキストの記法 = DSL** に落とし、その DSL を**唯一の正本（source of truth）**として扱う設計の立場です。図やドキュメントは DSL からの**派生物**にすぎません。本リポジトリではこの立場を **Mid Notation Pattern（MNP）** とも呼びます。「中間（mid）」とは、生のコードと最終的な絵の**あいだ**に置く、意味だけを保持する層という意味です。

狙いは 1 つ、**認知負荷を下げること**です。巨大な対象を全部覚える代わりに、固定ルールの記法という「圧縮された地図」を読む。記法が固定なら、AI も人も同じ読み書きができ、差分も追えます。

## 3 つの層（混ぜない）

記法中心設計では、扱う情報を 3 層に分けます。**正本は意味層だけ**です。

| 層 | 役割 | 正本か |
|----|------|--------|
| 意味層（semantic） | ドメイン構造そのもの（モジュール、依存、境界） | ✅ **DSL が正本** |
| 生成層（generation） | AI または人が DSL を編集・差分更新する作業 | — （正本ではなく操作） |
| 表現層（presentation） | DSL → HTML 等への変換（決定的） | ❌ 派生物 |

この分離が崩れると正本が曖昧になります。たとえば「絵を直接いじって、それが最新」になった瞬間、テキスト DSL は正本でなくなり、地図は再び読めなくなります。**直すのは常に DSL。絵は描き直すもの。**

## 4 つの要素（データベースになぞらえて）

記法を「動く仕組み」にするには、次の 4 つが要ります。リレーショナル DB の比喩で言い換えると掴みやすいです（比喩は厳密な対応ではなく、役割の見立てです）。

- **Schema / Grammar（文法）** — どんな形のテキストが正しいかを決める定義。DB のテーブル定義に当たり、「この列にこの種類しか入らない」を保証する。
- **Parser（パーサ）** — DSL テキストを読み、プログラムが扱える**内部モデル**に変換する。DB から行を読み出してオブジェクトに載せる処理に当たる。
- **Serializer（シリアライザ）** — 内部モデルを再び DSL テキストに書き戻す。オブジェクトを行として保存し直す処理に当たる。差分更新や整形はここを通す。
- **Generation rules（生成規約）** — AI に DSL を**書かせる**ときの house style（書式と作法）。DB の比喩には無い要素で、ここでは「書き手」が大規模言語モデルなので、生成規約が事実上の **system prompt** として働き、出力が必ず文法に乗ることを担保する。

Parser と Serializer が表裏一体（読めて書き戻せる）であること、Generation rules が文法と矛盾しないことが、記法を壊れにくくします。

## 同期ループ

記法・内部モデル・AI・図のあいだは、次の一方向ループで同期します。

```
serialize → コンテキストに載せる → AI が DSL を返す → parse → validate → apply → render
   │                                                                            │
 内部モデル → DSL テキスト                                              内部モデル → 図
```

- **serialize**: 現在の内部モデルを DSL テキストに書き出す。
- **コンテキストに載せる**: その DSL を AI のコンテキストに渡す（人間が読むのもここ）。
- **AI が DSL を返す**: AI は同じ記法で、編集後の DSL（全量または差分）を返す。
- **parse → validate**: 返ってきた DSL を内部モデルにし、検証する。
- **apply**: 検証を通った変更だけを反映する。
- **render**: 内部モデルから決定的に図を描く。

ポイントは、AI に渡すのも受け取るのも**同じ記法のテキスト**だということ。自由文ではなく固定記法でやり取りするから、毎回ブレずに積み上がります。

## 原則（要約）

詳細は [references/principles.md](references/principles.md)。ここでは結論だけ。

1. **意味（semantic）とレイアウト（layout）を分ける。** 何があるかと、どこに置くかは別セクション。混ぜない。
2. **1 行 1 意味単位、行頭に種別キーワード。** 機械にも人にも読めるよう、行指向で型を先頭に置く。
3. **全量置換をデフォルトにする。** 状態は毎回まるごと出すのが基本。巨大すぎる場合だけ、**スコープ（範囲）＋深度（粒度）**で分割する。
4. **レンダラーは DSL だけを読む（自由描画禁止）。** 描画側は記法以外の情報源（自然言語の要望、元データの再走査）から図を補完しない。これは `notation-render` の中核制約であり、相互参照する → [notation-render](../notation-render/SKILL.md)。
5. **決定的であること。** 同じ DSL なら同じ図。レイアウトに乱数や実行時刻を持ち込まない。

## 検証の観点（要約）

記法は「壊れた状態」を弾けて初めて正本になります。一般的な検証カテゴリは [references/validation.md](references/validation.md) に。具体的な検証コード・しきい値（ノード数上限など）は記法ごとに決めるもので、`repo-map v1` の実体は [repo-map-notation の grammar.md](../repo-map-notation/references/grammar.md) が正本です。

## いつこの Skill を読むか（判断入口）

- **初めて**このリポジトリの記法に触れるとき。
- 新しい DSL を**設計**したいとき（4 要素と 3 層を当てはめる）。
- 描画と生成の**責務分担に迷った**とき（「これは意味層か表現層か？」）。
- 既存の `repo-map` を使うだけなら、この Skill は読まなくてよい。直接 [repo-map-notation](../repo-map-notation/SKILL.md) → [notation-render](../notation-render/SKILL.md) へ。

## reference 地図

| ファイル | 中身 | いつ読む |
|----------|------|----------|
| [references/principles.md](references/principles.md) | 上記原則の根拠と適用例 | 原則の「なぜ」を知りたいとき |
| [references/validation.md](references/validation.md) | 検証の一般分類（未定義参照・循環・孤立・深度超過・行数上限） | 記法に検証を設計するとき |

## 関連スキル

- [repo-map-notation](../repo-map-notation/SKILL.md) — この原則を `repo-map v1` という具体記法に適用したもの（DSL 生成）。
- [notation-render](../notation-render/SKILL.md) — 原則 4・5（DSL だけを読む・決定的）を体現する描画側。
- 連携全体は [SKILLS_MAP.md](../../SKILLS_MAP.md)。

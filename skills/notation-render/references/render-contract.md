# render-contract — 入力契約とパイプライン

描画側が「何を受け取り、何を受け取らないか」「どう処理するか」を定める。文法・内部モデル・検証の実体は [repo-map-notation/references/grammar.md](../../repo-map-notation/references/grammar.md) が**正本**。ここはそれを描画の文脈で参照し、再定義しない。

---

## 受け付ける入力

- **notation の DSL テキストのみ。** 現時点で受理するのは、先頭行が `# repo-map v1` のテキスト 1 つ。
- **バージョンで分岐する。** 先頭のバージョン行を見て対応を選ぶ。
  - `# repo-map v1` → この契約で処理。
  - それ以外（`v2` 等の未知バージョン、バージョン行欠如） → **描かない**。`E-BADVERSION` / `E-NOVERSION` 相当を報告し、対応バージョンの DSL を求める。将来 v2 を足すときは、この分岐に v2 用の経路を増やす（バージョンをまたいで推測描画しない）。

## 受け付けない入力（描画の材料にしないもの）

次は**描画の入力にしない**。これは [notation-core 原則 4「レンダラーは DSL だけを読む」](../../notation-core/references/principles.md) の具体化である。

- 自然言語の要望（「もっと見やすく」「青っぽく」等）。
- 口頭・チャットでのレイアウト指示（「DB を右下に」等）。レイアウトを変えたいなら DSL の `@layout` を変える。
- **リポジトリそのものの再走査。** 描画側はリポジトリを読まない。図に出る情報はすべて DSL に書かれていなければならない。

DSL に必要な情報が足りない／矛盾するときは、**描画側で推測して補完しない**。[repo-map-notation](../../repo-map-notation/SKILL.md) に差し戻し、DSL を直してもらってから描く。

---

## パイプライン: `parse → validate → layout → emit`

### 1. parse
DSL テキストを内部モデル `RepoMap` にする。形は [grammar.md §4](../../repo-map-notation/references/grammar.md)。要点:

```
RepoMap {
  version: "repo-map v1",
  meta:   { root, depth, focus?, generated },
  nodes:  Map<id, Node>,            // 挿入順 = ソース順（正準タイブレーク）
  edges:  Edge[] (each has index),  // ソース順
  layout: Map<id, { rank?, group? }>
}
```

構文エラー（字下げ不正・閉じない引用・トークン数不正など）はここで検出し、描画に進まない。

### 2. validate（描画前ゲート）
[grammar.md §7](../../repo-map-notation/references/grammar.md) の**同じ検証規則**を走らせる。生成側の自己チェックと**完全に同一**のコード・重大度・しきい値を使う。

- **エラーが 1 つでもあれば描かない。** 診断（`<severity> <CODE> [line n]: <message> (remedy: …)`）を出し、`repo-map-notation` に差し戻す。
- **警告は描画をブロックしない。** ただし必ず報告する（孤立ノード W-ORPHAN、階層循環 W-CYCLE、depth 超過 W-DEPTHEXCEED など）。
- 上限（ノード ≤ 40・エッジ ≤ 80・有意行 ≤ 200）はエラー。超過 DSL は描かず、「深度を上げる／範囲を絞る／詳細を畳む」を促す。

> なぜ描画側でも検証するか: 生成側が「正しい」と判断したものが描画側でそのまま通ることを保証するため。両者が同じゲートを通すから、生成できた DSL は必ず描ける（[notation-core/references/validation.md](../../notation-core/references/validation.md)）。

### 3. layout
検証を通った `RepoMap` から座標を決める。`@layout` の rank/group を尊重し、無い／部分のところは決定的アルゴリズムで埋める。手順とタイブレークは [layout-algorithm.md](layout-algorithm.md)。**ここで初めて座標が生まれる**（モデル自体は座標を持たない）。

### 4. emit
固定テーマで図を書き出す。既定は SVG、次に HTML、任意で Mermaid。形式ごとの規約は [output-formats.md](output-formats.md)。色・フォントは固定テーマ（[theme.md](theme.md)）、寸法・座標は固定定数（[layout-algorithm.md](layout-algorithm.md)）。

---

## 決定性の契約

**同じ DSL バイト列からは、いつ・誰が描いても同じ図が出る。**

- parse・validate・layout・emit のいずれにも**乱数・実行時刻**を入れない。
- 並び順を決める比較はすべて**全順序**（最後の決め手はノードのソース順 / エッジの index）。
- 唯一、決定性の対象外なのは Mermaid 出力（レイアウトを Mermaid 側に委ねるため）。SVG が決定的な正典であり、Mermaid は便宜的な派生にすぎない（[output-formats.md](output-formats.md)）。

## 関連
- 文法・内部モデル・検証（正本）: [repo-map-notation/references/grammar.md](../../repo-map-notation/references/grammar.md)
- レイアウト: [layout-algorithm.md](layout-algorithm.md)
- テーマ（色・フォント）: [theme.md](theme.md)
- 出力形式: [output-formats.md](output-formats.md)
- 原則: [notation-core](../../notation-core/SKILL.md)

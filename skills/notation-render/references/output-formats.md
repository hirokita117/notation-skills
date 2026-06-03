# output-formats — SVG / HTML / Mermaid

`emit` 段で出す形式を定める。優先順位は **SVG（既定）> HTML > Mermaid（任意）**。テーマ定数は [layout-algorithm.md](layout-algorithm.md)。

---

## 1. SVG（既定・正典）

- **単一ファイルの SVG** を出す。外部参照を持たず、そのまま貼り付け・埋め込みできる自己完結な 1 枚。
- 中身は [layout-algorithm.md](layout-algorithm.md) の座標とテーマで決まる: ノードは角丸の矩形（kind ごとの塗り）、ラベル＋小さい ID、エッジは直線＋矢頭（階層=実線・依存=破線）、focus は amber の枠。
- `viewBox` はキャンバス幅・高さ（§座標）に合わせる。背景は `#FFFFFF`。
- **これが決定的な正典**である。同じ DSL からは同じ SVG（同じ座標・同じ色）が出る。

## 2. HTML（プレビュー用）

- 上記 SVG を**そのまま埋め込み**、**凡例**を添えた 1 枚の HTML。レビューや共有のプレビュー向け。
- **凡例（固定マークアップ）**:
  - kind 6 種の色見本と名前（system / package / module / file-group / external / datastore）。順序は [grammar.md §5](../../repo-map-notation/references/grammar.md) の列挙順に固定。
  - 線種の説明: 「実線 = 構造（contains / deploys / owns）」「破線 = 依存（imports / calls / reads）」。
- 凡例は DSL に依存しない固定要素（色・文言はテーマ定数どおり）。SVG 本体と凡例以外の装飾は足さない。

## 3. Mermaid（任意・正本にしない）

`repo-map v1` → Mermaid `graph TD` への**機械的・決定的**変換。Mermaid はレイアウトを自前で行うため**幾何は決定的でなく**、あくまで便宜的な派生。**SVG が正典で、Mermaid を正本にしない。**

**手順:**

1. 先頭に `graph TD`。
2. ノード宣言を**ノードのソース順**で出す。Mermaid の id は repo-map の id の `.` / `-` を `_` に置換したもの（固定の対応表を作り、エッジで再利用）。表示テキストは `label`。kind ごとの形:

   | kind | Mermaid の形 | 例 |
   |------|--------------|----|
   | system | `[[ ]]`（二重枠） | `monorepo[[Acme Platform]]` |
   | package | `[ ]`（矩形） | `web[Web App]` |
   | module | `( )`（角丸） | `tokens(Token Library)` |
   | file-group | `([ ])`（スタジアム） | `handlers([HTTP Handlers])` |
   | external | `{{ }}`（六角形） | `email{{Email Provider}}` |
   | datastore | `[( )]`（円筒） | `db[(Postgres)]` |

3. エッジを **`edge.index` 順**で出す。relation ごとの矢印:

   | relation | Mermaid | 種別 |
   |----------|---------|------|
   | contains | `-->|contains|` | 構造（実線） |
   | deploys | `-->|deploys|` | 構造 |
   | owns | `-->|owns|` | 構造 |
   | imports | `-.->|imports|` | 依存（点線） |
   | calls | `-.->|calls|` | 依存 |
   | reads | `-.->|reads|` | 依存 |

   構造は実線、依存は点線——SVG のテーマと読み味をそろえる。

4. ランク / group / focus / 色は既定では持ち込まない。`meta.focus` があれば固定スニペット（`classDef focus ...` と `class <focusId> focus`）を 1 つだけ足す。`@layout` は無視する（Mermaid が独自に配置する）。ここだけは SVG と幾何が一致しない——**決定的な成果物は SVG であって Mermaid ではない**、と明示する。

例 A（[examples.md](../../repo-map-notation/references/examples.md)）の冒頭:

```text
graph TD
  monorepo[[Acme Platform]]
  web[Web App]
  ...
  monorepo -->|contains| web
  web -.->|imports| core
  ...
```

---

## Figma について

- **Figma API / Figma Skill は描画経路に使わない。** この Skill は DSL から SVG / HTML / Mermaid を出すまでを責務とする。
- 出力した SVG / HTML を、人が後から Figma などのキャンバスに**貼る**のは自由。だが、それは「人が貼る」工程であって、この Skill が Figma を呼ぶわけではない。Figma を正本や描画先として組み込まない。

## 関連
- レイアウトとテーマ: [layout-algorithm.md](layout-algorithm.md)
- 入力契約: [render-contract.md](render-contract.md)
- 入力 DSL の例: [repo-map-notation/references/examples.md](../../repo-map-notation/references/examples.md)

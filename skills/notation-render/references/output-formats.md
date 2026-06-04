# output-formats — SVG / HTML / Mermaid

`emit` 段で出す形式を定める。優先順位は **SVG（既定）> HTML > Mermaid（任意）**。座標は [layout-algorithm.md](layout-algorithm.md)、テーマ定数は [theme.md](theme.md)。

---

## 1. SVG（既定・正典）

- **単一ファイルの SVG** を出す。外部参照を持たず、そのまま貼り付け・埋め込みできる自己完結な 1 枚。
- 中身は [layout-algorithm.md](layout-algorithm.md) の座標と [theme.md](theme.md) のテーマで決まる: ノードは角丸の矩形（kind ごとの塗り）、ラベル＋小さい ID、エッジは直線＋矢頭（階層=実線・依存=破線）、focus は amber の枠。
- `viewBox` はキャンバス幅・高さ（§座標）に合わせる。背景は `#FFFFFF`。
- **これが決定的な正典**である。同じ DSL からは同じ SVG（同じ座標・同じ色）が出る。

## 2. HTML（既定でインタラクティブ Viewer）

HTML は **インタラクティブ Viewer を既定**として出す。SVG（§1）を埋め込み、固定の凡例に加えて、
ノードクリックで詳細を見て質問できる最小 UI を**固定テンプレート**として載せた 1 枚の HTML。
中身は次の 4 つ:

1. **SVG 本体**＋各ノード `<g class="node">` への `data-*` 属性（`data-node-id` / `data-label` /
   `data-kind` / `data-path` / `data-related-edges` / `data-dsl-excerpt`）。属性値は **DSL から
   決定的に導出**する。スキーマと導出規則は
   [repo-map-interactive-viewer/references/html-viewer-contract.md](../../repo-map-interactive-viewer/references/html-viewer-contract.md)
   を正本として参照する（ここでは再定義しない）。
2. **凡例（固定マークアップ・DSL 非依存）**:
   - kind 6 種の色見本と名前（system / package / module / file-group / external / datastore）。順序は [grammar.md §5](../../repo-map-notation/references/grammar.md) の列挙順に固定。
   - 線種の説明: 「実線 = 構造（contains / deploys / owns）」「破線 = 依存（imports / calls / reads）」。
3. **質問サイドパネル（固定マークアップ）**: クリックしたノードの id / label / kind / path /
   related edges / DSL excerpt と、質問入力欄＋`Ask Claude Code`／`Copy prompt for Claude Code` ボタン。
   bridge モードではさらに **model / effort 選択 `<select>`**（先頭が `(default)`。選択肢は `/api/health` の
   `availableModels` / `availableEfforts` から動的に埋め、初期選択は `defaultModel` / `defaultEffort`。
   copy フォールバック時は非表示）、**送信中スピナー（CSS アニメーションのみ）**、回答を **Markdown として
   描画する領域** を持つ。
4. **固定の inline スクリプト**: クリック→パネル表示、`127.0.0.1` 配信時は `/api/ask` に POST（`model`/`effort` は
   許可リスト内・空なら省略して付与）、それ以外（`file://` 等）は **プロンプトコピー方式にフォールバック**
   （クリップボード不可なら textarea 表示）。bridge モードでは質問は同じ会話として継続し、任意で「新しい会話」
   （`/api/reset`）UI を含めてよい（契約上 optional・無くても適合）。回答 Markdown は **インライン実装の自己完結
   レンダラ**（CDN/外部ライブラリ不使用・HTML エスケープ後にサブセット描画）で表示し、送信中はスピナーを出して
   完了/失敗で隠す。**本物のトークンストリーミングはしない**（将来オプション）。リクエスト JSON 形・health キーは
   [html-viewer-contract.md](../../repo-map-interactive-viewer/references/html-viewer-contract.md) を正本として参照する。

**決定性は保つ。** パネル・スクリプト・CSS・凡例はすべて**固定テンプレート**（テーマ定数どおり）で、
`data-*` の値だけが DSL から決まる。model / effort セレクトの**選択肢は実行時に `/api/health` から充填**し
ファイルには焼かないので、HTML ファイル本体（markup / CSS / スクリプト / Markdown レンダラ）は固定のまま。
よって **同じ DSL → 同じ HTML**。乱数・時刻・気分は持ち込まない。
SVG（§1）は引き続き**決定的な正典**で、HTML はそれを使う派生物。

HTML Viewer は閲覧時に**ノードのドラッグ移動**にも対応してよい（掴んで動かすと接続線とラベル・ID が追従する）。これは view-time の表示操作のみで、`data-*` の導出にも出力ファイルの決定性にも影響しない（リロードで初期レイアウトに戻る）。属性スキーマは [html-viewer-contract.md](../../repo-map-interactive-viewer/references/html-viewer-contract.md) の「ドラッグ用属性」を参照。

**責務の外**: Claude Code CLI 呼び出し・Python ブリッジ本体・起動手順は **この Skill の責務ではない**。
それらは [`repo-map-interactive-viewer`](../../repo-map-interactive-viewer/SKILL.md) が担当する。
ここは「契約どおりの HTML を決定的に出す」までで止める。最小実装例は
[repo-map-interactive-viewer/examples/repo-map.html](../../repo-map-interactive-viewer/examples/repo-map.html)。

**プレーン版**: パネル・スクリプト無しの「SVG＋凡例だけ」の静的 HTML が欲しいと**明示要求された場合のみ**、
上記 1〜2 だけを出す（`data-*` は付けても害はないが、UI は足さない）。

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
- レイアウト（座標・帯順）: [layout-algorithm.md](layout-algorithm.md)
- テーマ（色・フォント）: [theme.md](theme.md)
- 入力契約: [render-contract.md](render-contract.md)
- 入力 DSL の例: [repo-map-notation/references/examples.md](../../repo-map-notation/references/examples.md)

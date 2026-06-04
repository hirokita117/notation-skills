# html-viewer-contract — インタラクティブ HTML の契約（正本）

このファイルは、`notation-render` が出す **インタラクティブ repo-map HTML** と、本 Skill の
**Python ブリッジ**が守るべき取り決めの **正本** です。`notation-render` は HTML を出すときに
この契約を **参照** する（再定義しない）。値の導出規則（id/kind/label/path/edges）は
[`repo-map-notation/references/grammar.md`](../../repo-map-notation/references/grammar.md) に従う。

> 位置づけ: HTML / SVG は DSL の **派生物**。ここで決めるのは「描画済み HTML に、理解補助のための
> メタデータと最小 UI をどう載せるか」だけ。意味の正本は常に DSL。

---

## 1. ノードのメタデータ（`data-*`）

SVG の各ノード（`<g class="node">`）に、DSL から **決定的に**導出した属性を付ける。

| 属性 | 由来（DSL） | 例 |
|------|-------------|----|
| `data-node-id` | ノード `id` | `web` |
| `data-label` | ノード `label`（引用は外した生の値） | `Web App` |
| `data-kind` | ノード `kind` | `package` |
| `data-path` | ノード `path`（無ければ空文字） | `apps/web` |
| `data-related-edges` | そのノードに接続する全エッジ | 下記 |
| `data-dsl-excerpt` | そのノードの DSL 抜粋 | 下記 |

### `data-related-edges`

`from == id` または `to == id` のエッジを **`edge.index`（ソース）順**に並べ、各行
`from SP to SP relation` を **改行**で連結した文字列。属性内では改行を `&#10;`、引用を `&quot;`
でエスケープする。

例（`core`）:

```
monorepo core contains
web core imports
core db reads
```

### `data-dsl-excerpt`

そのノードを理解するのに必要な最小の DSL 断片:

1. ノード定義行（`id SP kind SP label [SP path]`）
2. 続けて、そのノードの related edges 行（`edge.index` 順）

例（`web`）:

```
web package "Web App" apps/web
monorepo web contains
web core imports
```

> いずれも DSL から一意に決まる（同じ DSL → 同じ属性値）。レイアウト座標や色はテーマ定数で決まり、
> メタデータには**意味づけを足さない**。

### ノード/エッジのドラッグ用属性（任意拡張・view-time のみ）

閲覧時にノードを掴んで動かせるようにするため、出力 SVG は次の**任意・加算的**属性を付けてよい。

- 各ノード `<g class="node">`: `data-x` / `data-y`（決定的レイアウトの初期整数座標）。位置は `transform="translate(x,y)"` で与える（ラベル・ID は `<g>` 内に置くのでノードと一緒に動く）。
- 各エッジ `<line>`: `class="edge"` と `data-from` / `data-to` / `data-rel`（接続先と relation）。ドラッグ時に線端を再計算するため。

いずれも **DSL から決定的に導出**され（同じ DSL → 同じ属性値）、未知属性は既存コンシューマ（ブリッジ等）が無視するので**後方互換**。**ドラッグは view-time の表示操作のみで、出力ファイル＝リロード時の初期レイアウトを一切変えない**（決定性は壊さない）。DSL 文法は不変。

### ドキュメントの DSL 正本パス（`data-repo-map-dsl`・任意）

ルート要素 `<html>` に、入力 DSL 正本ファイルの**絶対パス**を任意属性 `data-repo-map-dsl` として
載せてよい（`notation-render` が生成時に CLI 入力ファイルパスを `realpathSync` で解決して付与。
stdin など不明時は **属性を出さない**）。copy / `file://` モードの `buildPrompt` はこれを読み、
プロンプトの `repo-map DSL file:` 行に使う（未付与なら `(未指定)`）。

絶対パスにするのは cwd に依存せず解決できるため（Viewer を貼り付ける Claude セッションの作業ディレクトリは
repo-root とは限らない）。属性は**任意・加算的**で、無くても既存コンシューマは無視する（後方互換）。
**ブリッジ方式ではこの属性は使わない**（サーバが `--dsl` から注入する。§2 と
[bridge-claude-invocation.md](bridge-claude-invocation.md)）。同一ファイルでもブリッジ（`--dsl`）と
copy（render 入力）で経路次第で表記が異なり得るが、どちらも絶対パスで cwd 非依存に解決できる。

---

## 2. ブリッジ API

### `GET /` ・ `GET /repo-map.html`
配信中の生成済み HTML を返す（`text/html`）。

### `GET /api/health`
```json
{ "ok": true, "repoRoot": "...", "html": "...", "dsl": "... or null",
  "claude": true, "permissionMode": "plan", "allowedTools": "Read,Glob,Grep",
  "sessionContinuity": true, "sessionId": "... or null", "remoteShutdown": true,
  "availableModels": ["opus","sonnet","haiku"],
  "availableEfforts": ["low","medium","high","xhigh","max"],
  "defaultModel": "sonnet or null", "defaultEffort": "medium or null" }
```

`sessionContinuity` は継続が有効か、`sessionId` は進行中の会話 ID（未開始なら `null`）。
どちらも **best-effort**（表示用。厳密な同期は保証しない）。
`remoteShutdown` は HTML からのブリッジ停止（`POST /api/shutdown`）が有効か。
HTML はこれが `false` でないときだけ停止ボタンを出す。
`availableModels` はサーバ `--models` 由来のモデル許可リスト、`availableEfforts` は CLI 固定の effort 列挙。
`defaultModel` / `defaultEffort` は UI セレクトの初期選択（`null` なら `(default)`）。HTML はこれらでセレクトを構築する。

### `POST /api/ask`
リクエスト JSON（HTML から送るのは固定フィールド＋許可リストで縛った任意の `model`/`effort` のみ）:

```json
{
  "question": "この package は何に使われていますか？",
  "nodeId": "web",
  "label": "Web App",
  "kind": "package",
  "path": "apps/web",
  "relatedEdges": "monorepo web contains\nweb core imports",
  "dslExcerpt": "web package \"Web App\" apps/web\nmonorepo web contains\nweb core imports",
  "model": "opus",
  "effort": "high"
}
```

`model` / `effort` は **任意・許可リスト限定**。`model` は `/api/health` の `availableModels` のいずれか、
`effort` は `low/medium/high/xhigh/max` のいずれか。**省略または空文字なら対応する CLI フラグを付けない**（`(default)`）。
許可外の値は `400` ＋ `ok:false`。これら 2 つ以外の未知キーは従来どおり無視。これは「固定フィールドのみ」
契約の **意図的で限定的な緩和**（2 列挙フィールド）であり、セッション ID 不変条件には影響しない
（client の `sessionId`/`session_id` は依然無視）。詳細は [security.md](security.md)。

成功レスポンス:

```json
{ "ok": true, "answer": "…日本語の回答…", "raw": { /* claude --output-format json の生データ */ } }
```

`answer` は **Markdown**。HTML 側はそれを**自己完結のインラインレンダラ**（CDN/外部ライブラリ不使用・
HTML エスケープ後にサブセットを描画）で HTML 描画する。失敗レスポンスの `error`/`detail` は素のテキストで表示する。

失敗レスポンス（HTML 側でそのまま表示できる）:

```json
{ "ok": false, "error": "わかりやすい日本語メッセージ", "detail": "stderr 抜粋など（任意）" }
```

- `question` は **必須・非空**。欠如/空は `400` ＋ `ok:false`。
- `path` は repo-root 配下のみ許可（外なら拒否）。
- ボディ上限・各フィールド長上限あり（[security.md](security.md)）。
- **client が送った `sessionId` / `session_id` は無視する**。会話 ID はサーバ生成（後述）。
- **client は DSL 正本パスを送れない**（`dslFile` / `dslPath` 等の未知キーは従来どおり無視）。
  プロンプトの `repo-map DSL file:` 行は、ブリッジが起動時 `--dsl` の絶対パスを**サーバ側で注入**する
  （リクエスト JSON は不変・新フィールドなし。[security.md](security.md)）。

### `POST /api/reset`
進行中の会話を破棄し、次の質問から新しい Claude 会話を始める。リクエストボディは無視（送っても可・上限ガードあり）。

```json
{ "ok": true, "sessionContinuity": true }
```

冪等。実行中の `/api/ask` に**ブロックされず即返る**（リセットが進行中 ask に勝つ）。

### `POST /api/shutdown`（任意・localhost 限定）
ブリッジ自身を停止する。`200` を返してから別スレッドで停止し、`Ctrl+C` と同じ通常停止経路
（`server_close`）を通る。リクエストボディは無視（送っても可・上限ガードあり）。

```json
{ "ok": true, "message": "ブリッジを停止します。" }
```

`--no-remote-shutdown` で無効化でき、その場合は `403` ＋ `ok:false` を返す（`/api/health` の
`remoteShutdown` も `false`）。停止後はブラウザのタブクローズを **best-effort** で試みる
（`window.close()`。多くのブラウザはスクリプトが開いていないタブを閉じないため、HTML 側は
「停止しました。閉じてかまいません」のオーバーレイで明示的な無効状態を示す）。

### セッション継続（重要）

- 同一ブリッジ起動中の質問は、既定で **1 つの Claude 会話として継続**する。
- 継続は **サーバ管理**: ブリッジが UUID を 1 本生成し、初回 `--session-id <uuid>`、以降 `--resume <uuid>`
  で `claude -p` を呼ぶ。`claude` は質問のたびに起動・即終了で常駐しない。
- **リクエスト JSON は不変**（送るのは従来の固定フィールドのみ）。会話 ID は HTML から設定・注入できない
  （`/api/reset` で**リセットを起動できる**だけ）。これがセキュリティ不変条件。
- 継続は `--no-session-continuity` 起動で無効化でき、その場合は質問ごとに独立した会話になる。

---

## 3. モード判定とフォールバック

HTML 側 JS は配信元で挙動を切り替える:

- **bridge モード**: `location.protocol` が `http(s):` かつ host が `127.0.0.1` / `localhost`
  → **Ask** で `/api/ask` に POST し、回答をパネルに表示。
- **copy フォールバック**: `file://` で開いた、または bridge に接続できない
  → **プロンプトを生成**してクリップボードへ。`navigator.clipboard` が使えない場合は
  `<textarea>` にプロンプトを表示して手動コピーさせる。

HTML 側 `buildPrompt` は、ブリッジ側 `build_prompt`（[bridge-claude-invocation.md](bridge-claude-invocation.md)）と
**同じ体裁**のプロンプトを作る。どちらの方式でも同じ内容が Claude Code に渡る。

---

## 4. UI 要件（最小）

図エリアは質問パネルの上に配置する。ノードのドラッグ移動で使える面積を確保するため、SVG 本体を含む
`.diagram-pane` は `resize` 可能なスクロール領域として、ユーザーが必要に応じて広げられるようにする。
凡例は `.diagram-pane` の外側に置き、縦方向に図エリアを広げたときに SVG の描画可能範囲を圧迫しない。

閲覧時の HTML は、`.diagram-pane` の表示サイズに合わせて SVG の
`width` / `height` / `viewBox` と背景 rect を広げてよい。この拡張は view-time の表示操作のみで、
初期レイアウト座標・DSL・`data-*` 導出・出力 HTML の決定性には影響しない。キャンバスの下限は
決定的レイアウトで計算された初期 SVG サイズであり、表示領域に合わせて必要な方向へ広がる。
ノードをドラッグするときは現在の SVG キャンバスを壁として扱い、ノード矩形が左上 `0,0` から
右下 `canvas - node size` の範囲を超えないように制限する。ドラッグ操作だけでキャンバスを広げない。

ノードクリック時にパネルへ表示する:

- node id / label / kind / path / related edges / DSL excerpt
- 質問入力欄（textarea）
- **Ask Claude Code** ボタン（bridge モード）
- **Copy prompt for Claude Code** ボタン（常時）

任意（optional・bridge モードのみ。無くても契約適合）:

- **新しい会話**ボタン（`POST /api/reset`）と、会話継続の状態インジケータ。
  リクエスト JSON は不変なので、付けても付けなくても既存の生成 HTML はそのまま動く。
- 表示の同期は `GET /api/health` の `sessionContinuity` / `sessionId` を参照してよい（best-effort）。
- **model / effort 選択 `<select>`**（`/api/health` の `availableModels` / `availableEfforts` から構築、
  初期選択は `defaultModel` / `defaultEffort`。copy モードでは非表示）。送信中の **ローディング表示（スピナー等）**。
- 回答の **Markdown 描画**（自己完結インラインレンダラ・CDN 不使用）。最小実装は example 参照。
- **ブリッジ停止ボタン**（`POST /api/shutdown`・bridge モードのみ・`/api/health` の `remoteShutdown` が
  `false` でないとき表示）。押下後はタブクローズを best-effort で試み、閉じられない場合は停止オーバーレイを出す。

凡例（kind の色・線種）は DSL 非依存の固定マークアップ。最小実装の参照は
[`../examples/repo-map.html`](../examples/repo-map.html)。

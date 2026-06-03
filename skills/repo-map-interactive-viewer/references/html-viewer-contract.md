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

---

## 2. ブリッジ API

### `GET /` ・ `GET /repo-map.html`
配信中の生成済み HTML を返す（`text/html`）。

### `GET /api/health`
```json
{ "ok": true, "repoRoot": "...", "html": "...", "dsl": "... or null",
  "claude": true, "permissionMode": "plan", "allowedTools": "Read,Glob,Grep",
  "sessionContinuity": true, "sessionId": "... or null" }
```

`sessionContinuity` は継続が有効か、`sessionId` は進行中の会話 ID（未開始なら `null`）。
どちらも **best-effort**（表示用。厳密な同期は保証しない）。

### `POST /api/ask`
リクエスト JSON（HTML から送る固定フィールドのみ）:

```json
{
  "question": "この package は何に使われていますか？",
  "nodeId": "web",
  "label": "Web App",
  "kind": "package",
  "path": "apps/web",
  "relatedEdges": "monorepo web contains\nweb core imports",
  "dslExcerpt": "web package \"Web App\" apps/web\nmonorepo web contains\nweb core imports"
}
```

成功レスポンス:

```json
{ "ok": true, "answer": "…日本語の回答…", "raw": { /* claude --output-format json の生データ */ } }
```

失敗レスポンス（HTML 側でそのまま表示できる）:

```json
{ "ok": false, "error": "わかりやすい日本語メッセージ", "detail": "stderr 抜粋など（任意）" }
```

- `question` は **必須・非空**。欠如/空は `400` ＋ `ok:false`。
- `path` は repo-root 配下のみ許可（外なら拒否）。
- ボディ上限・各フィールド長上限あり（[security.md](security.md)）。
- **client が送った `sessionId` / `session_id` は無視する**。会話 ID はサーバ生成（後述）。

### `POST /api/reset`
進行中の会話を破棄し、次の質問から新しい Claude 会話を始める。リクエストボディは無視（送っても可・上限ガードあり）。

```json
{ "ok": true, "sessionContinuity": true }
```

冪等。実行中の `/api/ask` に**ブロックされず即返る**（リセットが進行中 ask に勝つ）。

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

HTML 側 `buildPrompt` は、ブリッジ側 `build_prompt`（[local-bridge.md](local-bridge.md)）と
**同じ体裁**のプロンプトを作る。どちらの方式でも同じ内容が Claude Code に渡る。

---

## 4. UI 要件（最小）

ノードクリック時にパネルへ表示する:

- node id / label / kind / path / related edges / DSL excerpt
- 質問入力欄（textarea）
- **Ask Claude Code** ボタン（bridge モード）
- **Copy prompt for Claude Code** ボタン（常時）

任意（optional・bridge モードのみ。無くても契約適合）:

- **新しい会話**ボタン（`POST /api/reset`）と、会話継続の状態インジケータ。
  リクエスト JSON は不変なので、付けても付けなくても既存の生成 HTML はそのまま動く。
- 表示の同期は `GET /api/health` の `sessionContinuity` / `sessionId` を参照してよい（best-effort）。

凡例（kind の色・線種）は DSL 非依存の固定マークアップ。最小実装の参照は
[`../examples/repo-map.html`](../examples/repo-map.html)。

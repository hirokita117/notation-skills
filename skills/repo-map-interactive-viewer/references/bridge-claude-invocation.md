# bridge-claude-invocation — プロンプト整形と claude 呼び出し

本体: プロンプト整形（`build_prompt`）は [`../scripts/bridge_prompt.py`](../scripts/bridge_prompt.py)、
argv 組み立て・呼び出し（`build_claude_argv` / `run_claude`）は [`../scripts/bridge_claude.py`](../scripts/bridge_claude.py)。
`/api/ask` で受けたノード情報＋質問を、日本語プロンプトに整形（`build_prompt`）し、安全寄りの固定フラグで
`claude` の argv を組み立てて（`build_claude_argv`）呼び出すまでの規則。起動引数・エンドポイント一覧は
[local-bridge.md](local-bridge.md)、リクエスト/レスポンスの JSON 形は
[html-viewer-contract.md](html-viewer-contract.md) を正本とする。

---

## プロンプト整形（`build_prompt`）

`/api/ask` の入力から、次の体裁の日本語プロンプトを生成して `claude -p` に渡す:

```
あなたはローカルリポジトリ理解を支援するアシスタントです。
対象リポジトリは現在のworking directoryです。

ユーザーは repo-map HTML Viewer 上で次のノードを見ています。

node id: <nodeId>
label: <label>
kind: <kind>
path: <path>
related edges:
<relatedEdges>

repo-map DSL file: <dslFile>
DSL excerpt:
<dslExcerpt>

ユーザーの質問:
<question>

回答方針:
- まず repo-map DSL 上の意味を説明してください。
- repo-map DSL file が指定されているときは、まずそのファイルを Read して excerpt と整合を確認してください。
- DSL ファイルパスが未指定のときは excerpt を正としてください。
- 必要なら Read / Glob / Grep で実ファイルを確認してください。
- 推測と確認済み事実を分けてください。
- ファイル編集、生成、削除はしないでください。
- 最後に「次に読むとよいファイル」を挙げてください。
- 回答は日本語を基本にしてください。
```

`repo-map DSL file:` は repo-map DSL 正本ファイルの**絶対パス**。ブリッジ方式では **サーバが
起動時 `--dsl`（`BridgeConfig.dsl`・realpath 済みの絶対パス）から注入**する（client からは受け取らない）。
`--dsl` 省略時は `(未指定)`。絶対パスにするのは、Claude の cwd（=repo_root）に依存せず確実に解決できるため。

HTML 側 `buildPrompt`（copy 方式）も同じ体裁を作るので、どちらの方式でも同じ内容になる。copy 方式では
`<html data-repo-map-dsl>` に埋め込まれた絶対パス（`notation-render` が生成時に付与）を使う（[html-viewer-contract.md](html-viewer-contract.md) §1）。

---

## claude 呼び出し（`build_claude_argv`）

安全寄りの固定フラグセットで argv を組み立て、`subprocess.run(..., cwd=repo_root, shell=False)`
で実行する（`shell=True` は使わない）:

```
# 初回（新しい会話）
claude -p --output-format json --permission-mode plan --session-id <uuid> <prompt> --allowedTools Read,Glob,Grep
# 2 回目以降（同じ会話を継続）
claude -p --output-format json --permission-mode plan --resume <uuid> <prompt> --allowedTools Read,Glob,Grep
# model / effort を選択した場合（--model の直後に追加）
claude -p --output-format json --permission-mode plan --model opus --effort high --session-id <uuid> <prompt> --allowedTools Read,Glob,Grep
```

`--claude-model`（起動時）または `/api/ask` の per-request `model` 指定時は `--model <model>` を、
per-request `effort` 指定時は `--effort <level>` を **`--model` の直後**（prompt 位置引数より前・session フラグの前）に追加する。
`--effort` の許可値は **`low/medium/high/xhigh/max`**（CLI v2.1.161 で確認。`--print`=`-p` 併用が前提）。許可外の
`model`/`effort` は API 層（`validate_ask_payload`）が許可リストで `400` 拒否するため、不正値は subprocess に到達しない。
`--allowedTools` は可変長オプションなので、prompt 位置引数を飲み込まないよう **カンマ形の単一値で最後**に置く。
session フラグは prompt より前に置く。

- `claude` が見つからない → `{ok:false, error:"claude コマンドが見つかりません…"}`。
- 非ゼロ終了 / 未対応フラグ stderr / タイムアウト → `{ok:false, error, detail}` を HTML に返す。
- `--output-format json` の出力から `result` フィールドを取り出して `answer` にする。

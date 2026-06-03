# local-bridge — Python ローカルブリッジの使い方

本体: [`../scripts/repo_map_local_bridge.py`](../scripts/repo_map_local_bridge.py)（標準
ライブラリのみ）。生成済み repo-map HTML を 127.0.0.1 限定で配信し、HTML からの質問を
`claude -p` に橋渡しする **ローカル補助プロセス**。描画はしない。DSL 正本は変更しない。

---

## 起動引数

| 引数 | 必須 | 既定 | 説明 |
|------|------|------|------|
| `--repo-root` | ✅ | — | 対象リポジトリのルート。`claude` の **cwd** になり、パス・ジェイルの基準にもなる。 |
| `--html` | ✅ | — | 配信する生成済み repo-map HTML のパス。 |
| `--dsl` | | なし | repo-map DSL 正本のパス（**repo-root 配下のみ**）。`/api/health` 表示などに使う。 |
| `--port` | | `17333` | 待受ポート。 |
| `--claude-bin` | | `claude` | `claude` 実行ファイル名/パス。 |
| `--claude-model` | | なし | `claude --model` に渡すモデル名（高速モデル指定など）。未指定なら CLI 既定。 |
| `--allowed-tools` | | `Read,Glob,Grep` | `claude --allowedTools` の値。 |
| `--permission-mode` | | `plan` | `claude --permission-mode`。 |
| `--timeout` | | `180` | `claude` 呼び出しのタイムアウト秒。 |
| `--no-session-continuity` | | （継続ON） | 会話継続を無効化し、質問ごとに独立した `claude` 起動に戻す。`claude --no-session-persistence` とは別物。 |

> インストール済み Claude Code CLI（v2.1.161 で確認）の正しいフラグは **`--allowedTools`**
> （`--tools` ではない）。`--max-turns` は当該バージョン未対応のため既定では付けない。CLI が
> 対応したら `claude` 側設定や将来の引数追加で足せる。

### 起動例

```
python3 scripts/repo_map_local_bridge.py \
  --repo-root /path/to/your/repo \
  --html      /path/to/generated/repo-map.html \
  --dsl       /path/to/your/repo/repo-map.dsl \
  --port      17333
```

macOS は [`../scripts/open_repo_map_viewer.command`](../scripts/open_repo_map_viewer.command)
をダブルクリックでも起動可（python3→python 探索、ブラウザ自動起動、Ctrl+C 停止）。
引数・環境変数（`REPO_MAP_HTML` / `REPO_MAP_REPO_ROOT` / `REPO_MAP_DSL` / `REPO_MAP_PORT`）
未指定なら同梱 example のデモを開く。

---

## エンドポイント

| メソッド | パス | 役割 |
|----------|------|------|
| GET | `/`, `/repo-map.html` | 配信中の HTML を返す |
| GET | `/api/health` | 状態（repoRoot/html/dsl/claude 有無/フラグ/セッション）を JSON で返す |
| POST | `/api/ask` | 質問を受けて `claude -p` を呼び、回答を JSON で返す（会話は継続） |
| POST | `/api/reset` | 進行中の会話を破棄し、次の質問から新しい会話を始める。即返る（実行中 ask にブロックされない） |

リクエスト/レスポンスの形は [html-viewer-contract.md](html-viewer-contract.md) を正本とする。

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

DSL excerpt:
<dslExcerpt>

ユーザーの質問:
<question>

回答方針:
- まず repo-map DSL 上の意味を説明してください。
- 必要なら Read / Glob / Grep で実ファイルを確認してください。
- 推測と確認済み事実を分けてください。
- ファイル編集、生成、削除はしないでください。
- 最後に「次に読むとよいファイル」を挙げてください。
- 回答は日本語を基本にしてください。
```

HTML 側 `buildPrompt`（copy 方式）も同じ体裁を作るので、どちらの方式でも同じ内容になる。

---

## claude 呼び出し（`build_claude_argv`）

安全寄りの固定フラグセットで argv を組み立て、`subprocess.run(..., cwd=repo_root, shell=False)`
で実行する（`shell=True` は使わない）:

```
# 初回（新しい会話）
claude -p --output-format json --permission-mode plan --session-id <uuid> <prompt> --allowedTools Read,Glob,Grep
# 2 回目以降（同じ会話を継続）
claude -p --output-format json --permission-mode plan --resume <uuid> <prompt> --allowedTools Read,Glob,Grep
```

`--claude-model` 指定時は `--model <model>` を追加。`--allowedTools` は可変長オプションなので、
prompt 位置引数を飲み込まないよう **カンマ形の単一値で最後**に置く。session フラグは prompt より前に置く。

- `claude` が見つからない → `{ok:false, error:"claude コマンドが見つかりません…"}`。
- 非ゼロ終了 / 未対応フラグ stderr / タイムアウト → `{ok:false, error, detail}` を HTML に返す。
- `--output-format json` の出力から `result` フィールドを取り出して `answer` にする。

## セッション継続（`/api/ask` ↔ `/api/reset`）

同一起動中の質問を 1 つの Claude 会話として継続する。`claude` は毎回起動・即終了で **常駐しない**。

- **ID はサーバ生成**: ブリッジが `uuid.uuid4()` を 1 本持ち、初回 `--session-id`、以降 `--resume`。
  HTML からは設定・注入できない（`/api/ask` は client の `sessionId`/`session_id` を無視）。
- **resume 失敗時**は新 UUID で fresh 起動を 1 回だけ再試行し、`ok:true`（会話リセット扱い）で返す。
  ハードエラーにはしない。空 ID で `--resume` を出して対話ピッカーに落ちないよう、非空のときだけ付ける。
- **直列化**: `claude_lock` で subprocess を直列化し、同一セッション ID への同時書き込み破損を防ぐ
  （単一ユーザー前提なので待ちは稀）。`state_lock` は session_id/epoch の短時間保護で、`/api/reset` は
  これだけを取って即返る。`session_epoch` により、reset が実行中 ask に勝つ（古い ask は ID を上書きしない）。
- **無効化**: `--no-session-continuity` で質問ごと独立に戻る。`claude --no-session-persistence` は
  resume と非互換なので **使わない**。

詳細な安全方針は [security.md](security.md)。

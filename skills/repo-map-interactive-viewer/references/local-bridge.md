# local-bridge — Python ローカルブリッジの使い方

本体: [`../scripts/repo_map_local_bridge.py`](../scripts/repo_map_local_bridge.py)（標準
ライブラリのみ）。生成済み repo-map HTML を 127.0.0.1 限定で配信し、HTML からの質問を
`claude -p` に橋渡しする **ローカル補助プロセス**。描画はしない。DSL 正本は変更しない。

このファイルは **起動・運用**（起動引数・起動例・エンドポイント一覧）を扱う。内部挙動の詳細は
別ファイルへ: プロンプト整形と claude 呼び出しは
[bridge-claude-invocation.md](bridge-claude-invocation.md)、会話継続と起動時 reclaim は
[bridge-session-and-reclaim.md](bridge-session-and-reclaim.md)。

---

## 起動引数

| 引数 | 必須 | 既定 | 説明 |
|------|------|------|------|
| `--repo-root` | ✅ | — | 対象リポジトリのルート。`claude` の **cwd** になり、パス・ジェイルの基準にもなる。 |
| `--html` | ✅ | — | 配信する生成済み repo-map HTML のパス。 |
| `--dsl` | | なし | DSL 正本のパス（`repo-map` / `document-map`・**repo-root 配下のみ**）。`/api/health` 表示・プロンプト注入・notation 自動判定に使う。 |
| `--notation` | | （`--dsl` から自動判定） | プロンプト体裁（`repo-map` / `document-map`）。明示が無ければ `--dsl` の先頭行で判定（`# document-map v1` → document-map、それ以外 → repo-map）。 |
| `--port` | | `17333` | 待受ポート。 |
| `--claude-bin` | | `claude` | `claude` 実行ファイル名/パス。 |
| `--claude-model` | | なし | `claude --model` に渡すモデル名（プロセス全体の強制指定）。per-request の `model` が無いときのフォールバック。 |
| `--models` | | `opus,sonnet,haiku` | UI のモデル選択肢（カンマ区切り許可リスト。`/api/health` で公開。空なら選択肢なし）。 |
| `--default-model` | | `sonnet` | UI で初期選択するモデル（`--models` のいずれか。外れていれば `(default)` に戻す）。 |
| `--default-effort` | | `medium` | UI で初期選択する reasoning effort（`low/medium/high/xhigh/max`）。 |
| `--allowed-tools` | | `Read,Glob,Grep` | `claude --allowedTools` の値。 |
| `--permission-mode` | | `plan` | `claude --permission-mode`。 |
| `--timeout` | | `180` | `claude` 呼び出しのタイムアウト秒。 |
| `--no-session-continuity` | | （継続ON） | 会話継続を無効化し、質問ごとに独立した `claude` 起動に戻す。`claude --no-session-persistence` とは別物。 |
| `--no-reclaim` | | （掃除ON） | 起動時に同ポートの古い repo-map ブリッジを自動停止**しない**。既定は ON（前回 Ctrl+C せず閉じて残った自分のブリッジを掃除してから bind）。 |
| `--no-remote-shutdown` | | （停止ON） | HTML からの `POST /api/shutdown` でブリッジを停止する機能を**無効化**する。既定は ON。無効時は HTML に停止ボタンが出ず、要求は `403`。 |

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
| GET | `/api/health` | 状態（service/pid/repoRoot/html/dsl/claude 有無/フラグ/セッション）を JSON で返す。`service`/`pid` は後続インスタンスの reclaim（本人確認）に使う |
| POST | `/api/ask` | 質問を受けて `claude -p` を呼び、回答を JSON で返す（会話は継続） |
| POST | `/api/reset` | 進行中の会話を破棄し、次の質問から新しい会話を始める。即返る（実行中 ask にブロックされない） |
| POST | `/api/shutdown` | ブリッジを停止する。`200` を返してから別スレッドで `Ctrl+C` と同じ通常停止経路（`server_close`）を通る。`--no-remote-shutdown` で無効化（その場合 `403`） |

リクエスト/レスポンスの形は [html-viewer-contract.md](html-viewer-contract.md) を正本とする。

> `/api/shutdown` で停止すると `serve_forever` が抜けて Python プロセスが正常終了するため、
> ランチャー（`.command`）の `wait "$BRIDGE_PID"` も正常終了する（trap は INT/TERM 用で発火しない）。
> HTML 側はその後ブラウザのタブクローズを best-effort で試みる（[html-viewer-contract.md](html-viewer-contract.md) §2）。

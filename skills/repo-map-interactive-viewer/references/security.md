# security — ローカルブリッジの安全方針

このブリッジは **個人ローカル用途専用**。外部サーバではない。社内 Git・外部サービスへ何も
アップロードしない。設計上、次を保証する。

---

## 1. ネットワークはローカル限定

- **bind は `127.0.0.1` のみ**（`0.0.0.0` にはしない）。同一マシン以外から到達しない。
- **`Host` ヘッダ許可リスト**（`127.0.0.1` / `localhost`）。それ以外の Host は `403`。
  ブラウザ経由の DNS リバインディングを抑止する。

## 2. 任意コマンド実行をさせない

- **`shell=True` を使わない。** `claude` は **argv のリスト**で `subprocess.run` する。
- **HTML から渡せるのは固定 JSON フィールド**（question / nodeId / label / kind / path /
  relatedEdges / dslExcerpt）**＋ サーバ許可リストで縛った 2 つの列挙フィールド `model` / `effort`** のみ。
  ツール名・任意の CLI フラグ・コマンド文字列は **一切渡せない**。
- **`model` / `effort` は値であってフラグではない。** client は `"opus"` / `"high"` のような *値* を送り、
  ブリッジがサーバ定義の許可リスト（`--models` 由来の `allowed_models`、CLI 固定の `low/medium/high/xhigh/max`）と
  **完全一致**で照合する。許可外は `400` で拒否し subprocess を起動しない。許可された値だけが
  `["--model", v]` / `["--effort", v]` の **単一 argv 要素**として渡る（`shell=True` は依然使わない）。
  これは「HTML からフラグを渡せない」不変条件の **限定的で意図的な緩和**であり、2 列挙フィールドに閉じている。
  **新しいツール・権限は増えない**（`--permission-mode plan` ＋ `--allowedTools` は不変）。
- **`claude` の argv はブリッジ側が固定フラグで組み立てる。** 呼び出しは安全寄り:
  `--permission-mode plan` ＋ `--allowedTools Read,Glob,Grep`。
- **セッション ID はサーバ生成（`uuid4`）。** HTML からは設定・注入できない。`/api/ask` は client の
  `sessionId` / `session_id` を無視し、`--session-id` / `--resume` には**ブリッジ自身が生成した ID のみ**を渡す。
  HTML にできるのは `/api/reset`（パラメータ無し）の起動だけ。「HTML からフラグを渡せない」不変条件は保たれる。
- **`--dangerously-skip-permissions` は使わない。** `--no-session-persistence` も使わない（resume と非互換）。
- 回答方針プロンプトでも「ファイル編集・生成・削除をしない」と明示する（多層防御）。

## 3. パスはリポジトリルートに閉じ込める

- リクエストの `path`、起動時の `--dsl` は **`os.path.realpath` で `--repo-root` 配下に
  ジェイル**する。`..` などで外へ出る指定は **拒否**。
- **配信するのは設定済み `--html` のみ**。リクエストの任意パスをファイルとして配信しない
  （`/`・`/repo-map.html` 以外の GET は `404`）。
- `claude` の cwd は `--repo-root`。調査対象は対象リポジトリに自然に閉じる。

## 4. 入力サイズの上限

- リクエストボディ上限（既定 256KiB 超は `413`）。
- `question` ・各フィールドに長さ上限（クリップ）。

## 5. 起動時 reclaim は『自分のブリッジ』しか止めない

- 起動時に同ポートを点検し、残った**自分の**古いブリッジだけを停止する（`reclaim_port`）。
  本人確認は `GET /api/health` の `Server` ヘッダ（`repo-map-local-bridge/…`）または
  `service == "repo-map-local-bridge"` で行い、PID も同じ health の `pid` から得る。
- **無条件 kill はしない。** ポートを握っているのが別アプリ（本人確認に通らない応答、または
  応答はあるが PID 不明）なら**停止せず起動を中止**し、別ポートを促す。`lsof` 等で「ポートの
  占有者」を機械的に kill する実装には**しない**（別アプリの巻き添えを避けるため）。
- 停止は `SIGTERM` →（数秒で解放されなければ）`SIGKILL`。`--no-reclaim` で無効化できる。
- 対象は**ポートを握ったまま動き続ける孤児プロセス**であって、defunct（ゾンビ）ではない。

## 6. 想定する脅威と非対応

- 想定: 同一マシン上の悪意あるページが localhost API を叩く → Host チェック＋固定フラグ＋
  ジェイルで影響を限定。
- `/api/reset` は同一マシンの悪意あるページが会話をリセットし得る（低リスク・上記の脅威モデルの範囲内。
  会話の中身は漏れず、ファイルへの影響もない）。
- `/api/shutdown` も同様に、同一マシンの localhost ページがブリッジを停止し得る。影響は **DoS 相当
  （再起動で復旧。データやファイルへの影響はない）** で、loopback bind ＋ Host チェックの内側。
  気にするなら `--no-remote-shutdown` で無効化でき、その場合 HTML も停止ボタンを出さず要求は `403`。
- `model` / `effort` を client が選べる点も、列挙許可リストで縛られているため任意実行に繋がらない。
  悪用しても「より高価なモデルで計算を浪費する」程度で、同一マシン脅威モデルの範囲内。
- **非対応（設計外）**: リモート公開、マルチユーザー、認証つき共有。これらが必要なら別設計にする。
  このブリッジは loopback 限定の個人補助に徹する。

---

これらは [`../scripts/repo_map_local_bridge.py`](../scripts/repo_map_local_bridge.py) に実装され、
[`../tests/test_local_bridge.py`](../tests/test_local_bridge.py) で検証する
（Host 拒否・パス拒否・入力バリデーション・claude 未検出時の挙動など）。

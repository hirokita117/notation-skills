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
- **HTML から渡せるのは固定 JSON フィールドのみ**（question / nodeId / label / kind / path /
  relatedEdges / dslExcerpt）。ツール名・CLI フラグ・コマンド文字列は **一切渡せない**。
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

## 5. 想定する脅威と非対応

- 想定: 同一マシン上の悪意あるページが localhost API を叩く → Host チェック＋固定フラグ＋
  ジェイルで影響を限定。
- `/api/reset` は同一マシンの悪意あるページが会話をリセットし得る（低リスク・上記の脅威モデルの範囲内。
  会話の中身は漏れず、ファイルへの影響もない）。
- **非対応（設計外）**: リモート公開、マルチユーザー、認証つき共有。これらが必要なら別設計にする。
  このブリッジは loopback 限定の個人補助に徹する。

---

これらは [`../scripts/repo_map_local_bridge.py`](../scripts/repo_map_local_bridge.py) に実装され、
[`../tests/test_local_bridge.py`](../tests/test_local_bridge.py) で検証する
（Host 拒否・パス拒否・入力バリデーション・claude 未検出時の挙動など）。

# bridge-session-and-reclaim — 会話継続と起動時 reclaim

本体: セッション継続（`/api/ask` ↔ `/api/reset`・`BridgeServer`）は [`../scripts/bridge_http.py`](../scripts/bridge_http.py)、
起動時 reclaim（`reclaim_port`）は [`../scripts/bridge_reclaim.py`](../scripts/bridge_reclaim.py)。ブリッジの 2 つの
ランタイム挙動 — 同一起動中の質問を 1 つの Claude 会話として継続する仕組みと、起動時に古い自分の
ブリッジを掃除してポートを空ける仕組み。起動引数・エンドポイント一覧は [local-bridge.md](local-bridge.md)、
安全方針は [security.md](security.md) を参照。

---

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

## 起動時のポート確保（reclaim）

ターミナルを Ctrl+C せずに閉じる等で、前回のブリッジが**孤児プロセス**としてポートを
握ったまま残ることがある。起動時、新しいブリッジは bind の前に同ポートを点検し、
**「自分のブリッジ」だけ**を停止してポートを空ける（`reclaim_port`）。

- **本人確認**: `GET /api/health` を叩き、`Server` ヘッダ（全バージョンで
  `repo-map-local-bridge/…`）または health JSON の `service == "repo-map-local-bridge"` で
  自分のブリッジか判定する。PID は同じ health の `pid` から取得する。
- **停止手順**: `SIGTERM` → 数秒待ってポートが解放されなければ `SIGKILL`。新ブリッジは
  `SIGTERM` を捕まえて `server_close()` まで通す（穏当に終了）。
- **別アプリは触らない**: ポートを握っているのが repo-map ブリッジでなければ**停止せず**、
  「別ポートを指定して」と促して**起動を中止**する（無条件な kill はしない）。PID 不明の
  古いブリッジも安全側で中止し、`pkill -f repo_map_local_bridge` を案内する。
- **無効化**: `--no-reclaim` で点検・掃除をスキップ（ポートが塞がっていれば bind 失敗で中止）。

> これは「閉じ忘れて孤児化したブリッジ」を次回起動が自動で片付けるための仕組み。
> ゾンビ（defunct）ではなく**ポートを握ったまま動き続ける孤児**を対象にする。

詳細な安全方針は [security.md](security.md)。

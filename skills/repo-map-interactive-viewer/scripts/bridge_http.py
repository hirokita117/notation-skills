"""repo-map ローカルブリッジ — HTTP ハンドラとサーバ（会話セッション状態を保持）。

127.0.0.1 限定で HTML を配信し、/api/ask（質問→claude）, /api/reset（会話リセット）,
/api/shutdown（停止）, /api/health（本人確認用メタ）を捌く。会話セッション（サーバ生成 UUID）は
BridgeServer が保持し、reset と実行中 ask の競合は session_epoch で解く。リクエスト/レスポンスの
JSON 形は references/html-viewer-contract.md、継続/停止の挙動は references/bridge-session-and-reclaim.md。

注意（テストの monkeypatch 経路）: claude 呼び出しは `bridge_claude.run_claude` を **module 修飾で**
呼ぶ。これにより、テストが `bridge.bridge_claude.run_claude` を差し替えると実 claude を呼ばずに
セッション継続のロジックだけを検証できる（bare import にすると差し替えが効かない）。
"""

from __future__ import annotations

import json
import os
import sys
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import bridge_claude
from bridge_claude import resolve_claude
from bridge_config import ALLOWED_EFFORTS, ALLOWED_HOSTS, MAX_BODY_BYTES, SERVICE_ID
from bridge_prompt import build_prompt
from bridge_validation import validate_ask_payload


# --- HTTP ハンドラ -----------------------------------------------------------

class BridgeHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = SERVICE_ID + "/1.0"   # Server ヘッダ＝本人確認シグネチャ（reclaim が参照）

    # 便宜アクセサ
    @property
    def config(self):
        return self.server.bridge_config  # type: ignore[attr-defined]

    # --- ルーティング ---

    def do_GET(self):  # noqa: N802 (http.server の規約)
        if not self._check_host():
            return
        path = urlparse(self.path).path
        if path in ("/", "/repo-map.html", "/index.html"):
            self._serve_html()
        elif path == "/api/health":
            self._serve_health()
        elif path in ("/api/ask", "/api/reset", "/api/shutdown"):
            self._send_json(405, {"ok": False, "error": "method not allowed (use POST)"})
        else:
            self._send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self):  # noqa: N802
        if not self._check_host():
            return
        path = urlparse(self.path).path
        if path == "/api/ask":
            self._handle_ask()
        elif path == "/api/reset":
            self._handle_reset()
        elif path == "/api/shutdown":
            self._handle_shutdown()
        else:
            self._send_json(404, {"ok": False, "error": "not found"})

    # --- ハンドラ本体 ---

    def _serve_html(self):
        try:
            with open(self.config.html, "rb") as fh:
                body = fh.read()
        except OSError as exc:
            self._send_json(500, {"ok": False, "error": "HTML を読めません。", "detail": str(exc)})
            return
        self._send_bytes(200, "text/html; charset=utf-8", body)

    def _serve_health(self):
        # セッション欄はロックなしの best-effort 読み（表示用なので多少 stale でも可）。
        # service / pid は、新インスタンスが起動時に「自分のブリッジ」を本人確認し
        # 安全に停止する（reclaim_port）ために使う。
        self._send_json(200, {
            "ok": True,
            "service": SERVICE_ID,
            "pid": os.getpid(),
            "repoRoot": self.config.repo_root,
            "html": self.config.html,
            "dsl": self.config.dsl,
            "claude": bool(resolve_claude(self.config.claude_bin)),
            "permissionMode": self.config.permission_mode,
            "allowedTools": self.config.allowed_tools,
            "sessionContinuity": getattr(self.server, "session_continuity", True),
            "sessionId": getattr(self.server, "session_id", None),
            "remoteShutdown": getattr(self.server, "remote_shutdown", True),
            "availableModels": list(self.config.allowed_models),
            "availableEfforts": list(ALLOWED_EFFORTS),
            "defaultModel": self.config.default_model,
            "defaultEffort": self.config.default_effort,
        })

    def _handle_ask(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            self._send_json(400, {"ok": False, "error": "空のリクエストです。"})
            return
        if length > MAX_BODY_BYTES:
            # 本文を読まずに返すため、残バイトを次のリクエストと誤読しないよう接続を閉じる
            self.close_connection = True
            self._send_json(413, {"ok": False, "error": "リクエストが大きすぎます。"})
            return
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self._send_json(400, {"ok": False, "error": "JSON を解釈できません。"})
            return

        cleaned, error = validate_ask_payload(payload, self.config)
        if error:
            self._send_json(400, {"ok": False, "error": error})
            return

        # DSL 正本のパスはサーバ設定（--dsl・起動時 realpath 済みの絶対パス）から注入する。
        # client は dsl パスを送れない（validate_ask_payload が固定フィールドだけに刈り込む）。
        # config.dsl が None のときは build_prompt 内の line() が「(未指定)」に吸収する。
        prompt = build_prompt(cleaned, dsl_file=self.config.dsl)
        result = self._run_claude_with_session(
            prompt, model=cleaned.get("model"), effort=cleaned.get("effort")
        )
        status = 200 if result.get("ok") else 502
        self._send_json(status, result)

    def _run_claude_with_session(self, prompt: str, *, model: str | None = None,
                                 effort: str | None = None) -> dict:
        """セッション継続を管理しつつ claude を呼ぶ。

        - 継続 OFF: 毎回まっさらな claude（従来挙動）。
        - 継続 ON: サーバ生成 UUID を持ち回り、初回 --session-id / 以降 --resume。
          既存会話の resume に失敗したら、新 UUID で fresh 起動を 1 回だけ再試行する
          （ハードエラーにせず、会話がリセットされた扱いで ok:true を返し得る）。

        claude_lock で subprocess を直列化し、同一セッション ID への同時書き込みによる
        破損を防ぐ（単一ユーザー前提なので待ちは稀）。state_lock は session_id/epoch の
        読み書きのみを保護する短時間ロックで、/api/reset がここにブロックされないようにする。

        run_claude は bridge_claude モジュール修飾で呼ぶ（テストの差し替え経路を生かすため）。
        """
        srv = self.server
        if not getattr(srv, "session_continuity", True):
            with srv.claude_lock:
                return bridge_claude.run_claude(prompt, self.config, model=model, effort=effort)

        with srv.claude_lock:
            with srv.state_lock:
                sid = srv.session_id
                start_epoch = srv.session_epoch
            is_new = sid is None
            if is_new:
                sid = str(uuid.uuid4())
            result = bridge_claude.run_claude(prompt, self.config, model=model, effort=effort,
                                              session_id=sid, resume=not is_new)
            if not result.get("ok") and not is_new:
                # 既存会話の resume に失敗 → 新しい会話として 1 回だけやり直す
                sid = str(uuid.uuid4())
                result = bridge_claude.run_claude(prompt, self.config, model=model, effort=effort,
                                                  session_id=sid, resume=False)
            with srv.state_lock:
                if srv.session_epoch == start_epoch:  # 途中で reset されていなければ反映
                    srv.session_id = sid if result.get("ok") else None
            return result

    def _handle_reset(self):
        """会話をリセットし、次の質問から新しい Claude 会話を始める。

        state_lock のみを取得して即返すので、実行中の ask（claude_lock 保持）に
        ブロックされない。session_epoch を進めるため、進行中の ask は完了時に自分の
        session_id を反映しない（reset を優先する）。
        """
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY_BYTES:
            self.close_connection = True
            self._send_json(413, {"ok": False, "error": "リクエストが大きすぎます。"})
            return
        if length > 0:
            self.rfile.read(length)  # ボディは使わないが、接続を汚さないよう読み捨てる
        srv = self.server
        with srv.state_lock:
            srv.session_id = None
            srv.session_epoch += 1
        self._send_json(200, {"ok": True, "sessionContinuity": getattr(srv, "session_continuity", True)})

    def _handle_shutdown(self):
        """ブラウザからの要求でブリッジを停止する（localhost 限定・Host 検査済み）。

        --no-remote-shutdown で無効化できる（その場合 403）。レスポンスを返してから
        別スレッドで server.shutdown() を呼び、serve() の finally（server_close）を
        通常停止経路で通す。同じスレッドで shutdown() するとレスポンスを返せず、
        serve_forever の停止待ちでデッドロックし得るため、必ず別スレッドにする。
        """
        srv = self.server
        if not getattr(srv, "remote_shutdown", True):
            self._send_json(403, {"ok": False, "error": "リモート停止は無効です（--no-remote-shutdown）。"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY_BYTES:
            self.close_connection = True
            self._send_json(413, {"ok": False, "error": "リクエストが大きすぎます。"})
            return
        if length > 0:
            self.rfile.read(length)  # ボディは使わないが、接続を汚さないよう読み捨てる
        self._send_json(200, {"ok": True, "message": "ブリッジを停止します。"})
        self.wfile.flush()           # 停止前にレスポンスを確実に送り切る
        threading.Thread(target=srv.shutdown, daemon=True).start()

    # --- 補助 ---

    def _check_host(self) -> bool:
        host = self.headers.get("Host", "")
        hostname = host.split(":")[0].strip().lower()
        if hostname and hostname not in ALLOWED_HOSTS:
            self._send_json(403, {"ok": False, "error": "forbidden host"})
            return False
        return True

    def _send_json(self, status: int, obj: dict):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self._send_bytes(status, "application/json; charset=utf-8", body)

    def _send_bytes(self, status: int, content_type: str, body: bytes):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def log_message(self, fmt, *args):  # ログは stderr に簡潔に
        sys.stderr.write("[bridge] %s\n" % (fmt % args))


# --- サーバ（会話セッション状態を保持） --------------------------------------

class BridgeServer(ThreadingHTTPServer):
    """ThreadingHTTPServer に Claude 会話セッションの状態を持たせたもの。

    session_id はサーバ生成の UUID（HTML からは設定・注入できない）。claude_lock は
    subprocess の直列化用、state_lock は session_id/epoch の短時間保護用。session_epoch は
    reset と実行中 ask の競合を解く世代番号（reset で +1 され、古い ask の上書きを無効化する）。
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.state_lock = threading.Lock()
        self.claude_lock = threading.Lock()
        self.session_id = None
        self.session_epoch = 0
        self.session_continuity = True
        self.remote_shutdown = True

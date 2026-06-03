#!/usr/bin/env python3
"""repo-map ローカルブリッジ — 生成済み repo-map HTML Viewer とローカル Claude Code をつなぐ。

責務（repo-map-interactive-viewer Skill の一部）:
  * 生成済みの repo-map HTML を 127.0.0.1 限定で配信する。
  * HTML から送られたノード情報＋質問を Claude Code 用プロンプトに整形する。
  * `claude -p` を subprocess で呼び、回答を JSON で返す。
  * 同一起動中の質問を 1 つの Claude 会話として継続する（サーバ生成 UUID を持ち回り、
    1 ターン目 --session-id、以降 --resume）。claude は毎回起動・即終了で常駐しない。

設計上の境界:
  * 描画はしない（notation-render の責務）。HTML は受け取って配信するだけ。
  * DSL 正本は書き換えない。これは読み取り専用の理解補助プロセス。

セキュリティ（references/security.md と対応）:
  * bind は 127.0.0.1 のみ。Host ヘッダも 127.0.0.1 / localhost に限定。
  * shell=True は使わない（argv リストで subprocess.run）。
  * HTML からは固定 JSON フィールドのみ受け取り、ツール/フラグ/コマンドは渡せない。
  * `claude` の argv はブリッジ側が固定フラグセットで組み立てる。
  * セッション ID はサーバ生成（uuid4）。HTML からは設定・注入できない（reset 起動のみ可）。
  * パス系フィールドは repo-root 配下に realpath ジェイルする。
  * --dangerously-skip-permissions は使わない。--no-session-persistence も使わない（resume と非互換）。

標準ライブラリのみ。Python 3 系（python3 / python）で動く。
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import threading
import uuid
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

# --- 既定値 -----------------------------------------------------------------

DEFAULT_PORT = 17333
DEFAULT_ALLOWED_TOOLS = "Read,Glob,Grep"
DEFAULT_PERMISSION_MODE = "plan"
DEFAULT_CLAUDE_TIMEOUT = 180.0  # 秒
DEFAULT_MODELS = "opus,sonnet,haiku"  # UI のモデル選択肢（カンマ区切り許可リスト）
DEFAULT_MODEL = "sonnet"              # UI 初期選択モデル（応答速度優先の既定）
DEFAULT_EFFORT = "medium"             # UI 初期選択 effort
# claude CLI 固定の effort 列挙（v2.1.161 で確認）。デプロイ設定ではないのでモジュール定数。
ALLOWED_EFFORTS = ("low", "medium", "high", "xhigh", "max")

MAX_BODY_BYTES = 256 * 1024
MAX_QUESTION = 8_000
MAX_FIELD = 20_000

ALLOWED_HOSTS = {"127.0.0.1", "localhost"}


@dataclass
class BridgeConfig:
    repo_root: str
    html: str
    dsl: str | None
    port: int
    claude_bin: str
    claude_model: str | None
    allowed_tools: str
    permission_mode: str
    timeout: float
    session_continuity: bool = True
    allowed_models: tuple[str, ...] = ()       # UI セレクトの許可リスト（--models 由来）
    default_model: str | None = None           # UI 初期選択モデル（allowed_models のいずれか）
    default_effort: str | None = None          # UI 初期選択 effort（ALLOWED_EFFORTS のいずれか）


# --- パス・ジェイル ----------------------------------------------------------

def within_repo_root(path: str, repo_root: str) -> bool:
    """path が repo_root 配下に収まっているか（`..` 抜けを realpath で弾く）。"""
    root = os.path.realpath(repo_root)
    candidate = path if os.path.isabs(path) else os.path.join(root, path)
    real = os.path.realpath(candidate)
    return real == root or real.startswith(root + os.sep)


# --- プロンプト生成（純粋関数・テスト対象） ----------------------------------

def build_prompt(payload: dict) -> str:
    """HTML から受け取ったノード情報＋質問を Claude Code 用プロンプトに整形する。"""

    def line(value) -> str:
        text = (value or "").strip() if isinstance(value, str) else ""
        return text if text else "(未指定)"

    def block(value) -> str:
        text = (value or "").strip() if isinstance(value, str) else ""
        return text if text else "(なし)"

    question = (payload.get("question") or "").strip() if isinstance(payload.get("question"), str) else ""

    return (
        "あなたはローカルリポジトリ理解を支援するアシスタントです。\n"
        "対象リポジトリは現在のworking directoryです。\n"
        "\n"
        "ユーザーは repo-map HTML Viewer 上で次のノードを見ています。\n"
        "\n"
        f"node id: {line(payload.get('nodeId'))}\n"
        f"label: {line(payload.get('label'))}\n"
        f"kind: {line(payload.get('kind'))}\n"
        f"path: {line(payload.get('path'))}\n"
        "related edges:\n"
        f"{block(payload.get('relatedEdges'))}\n"
        "\n"
        "DSL excerpt:\n"
        f"{block(payload.get('dslExcerpt'))}\n"
        "\n"
        "ユーザーの質問:\n"
        f"{question}\n"
        "\n"
        "回答方針:\n"
        "- まず repo-map DSL 上の意味を説明してください。\n"
        "- 必要なら Read / Glob / Grep で実ファイルを確認してください。\n"
        "- 推測と確認済み事実を分けてください。\n"
        "- ファイル編集、生成、削除はしないでください。\n"
        "- 最後に「次に読むとよいファイル」を挙げてください。\n"
        "- 回答は日本語を基本にしてください。\n"
    )


# --- claude 呼び出し ---------------------------------------------------------

def build_claude_argv(
    executable: str,
    prompt: str,
    *,
    permission_mode: str = DEFAULT_PERMISSION_MODE,
    allowed_tools: str = DEFAULT_ALLOWED_TOOLS,
    model: str | None = None,
    effort: str | None = None,
    session_id: str | None = None,
    resume: bool = False,
) -> list[str]:
    """安全寄りの固定フラグセットで claude の argv を組み立てる。

    --allowedTools は可変長オプションなので、prompt 位置引数を飲み込まないよう
    カンマ形の単一値で最後に置く。--dangerously-skip-permissions は決して付けない。
    model / effort が指定されれば --model / --effort を session フラグの前に付ける
    （いずれも値必須の単一フラグ。許可リスト検証は API 層で済んでいる前提）。

    session_id を渡すと会話を継続する: 初回は --session-id（その UUID で新規会話）、
    以降は resume=True で --resume（既存会話を継続）。session_id が空のときは
    どちらも付けない（bare --resume は対話ピッカーで hang し得るため絶対に出さない）。
    """
    argv = [
        executable,
        "-p",
        "--output-format", "json",
        "--permission-mode", permission_mode,
    ]
    if model:
        argv += ["--model", model]
    if effort:
        argv += ["--effort", effort]
    if session_id:
        argv += (["--resume", session_id] if resume else ["--session-id", session_id])
    argv += [prompt, "--allowedTools", allowed_tools]
    return argv


def resolve_claude(claude_bin: str) -> str | None:
    """claude 実行ファイルを解決する。見つからなければ None。"""
    found = shutil.which(claude_bin)
    if found:
        return found
    if os.path.isabs(claude_bin) and os.path.isfile(claude_bin) and os.access(claude_bin, os.X_OK):
        return claude_bin
    return None


def parse_claude_output(stdout: str):
    """`claude --output-format json` の出力から回答テキストを取り出す。"""
    text = (stdout or "").strip()
    if not text:
        return "", None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return text, None
    if isinstance(data, dict):
        for key in ("result", "text", "response"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value, data
        return json.dumps(data, ensure_ascii=False), data
    return text, data


def run_claude(
    prompt: str,
    config: BridgeConfig,
    *,
    model: str | None = None,
    effort: str | None = None,
    session_id: str | None = None,
    resume: bool = False,
) -> dict:
    """claude を呼んで {ok, answer, raw} か {ok:false, error, detail} を返す。

    model / effort / session_id / resume は build_claude_argv へ素通し。model 未指定なら
    config.claude_model にフォールバック。effort はリクエスト指定のみ（既定の暗黙注入はしない）。
    返り値の形は継続有無に関わらず一定（セッション状態はサーバ側 BridgeServer が保持・管理する）。
    """
    executable = resolve_claude(config.claude_bin)
    if not executable:
        return {
            "ok": False,
            "error": "claude コマンドが見つかりません。Claude Code CLI をインストールするか、"
                     "--claude-bin で実行パスを指定してください。",
            "detail": f"claude_bin={config.claude_bin!r}",
        }

    argv = build_claude_argv(
        executable,
        prompt,
        permission_mode=config.permission_mode,
        allowed_tools=config.allowed_tools,
        model=model if model else config.claude_model,
        effort=effort,
        session_id=session_id,
        resume=resume,
    )

    try:
        proc = subprocess.run(
            argv,
            cwd=config.repo_root,
            capture_output=True,
            text=True,
            timeout=config.timeout,
        )
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "error": "claude の応答がタイムアウトしました。",
            "detail": f"timeout={config.timeout}s",
        }
    except OSError as exc:
        return {"ok": False, "error": "claude の起動に失敗しました。", "detail": str(exc)}

    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        return {
            "ok": False,
            "error": "claude がエラーを返しました（未対応フラグ・認証切れ・権限などの可能性）。",
            "detail": detail[:4000],
        }

    answer, raw = parse_claude_output(proc.stdout)
    return {"ok": True, "answer": answer, "raw": raw}


# --- 入力バリデーション ------------------------------------------------------

def _clip_str(value, limit: int = 4_000) -> str:
    if not isinstance(value, str):
        return ""
    return value[:limit]


def validate_ask_payload(payload, config: BridgeConfig):
    """(cleaned, error) を返す。error が None なら cleaned が使える。"""
    if not isinstance(payload, dict):
        return None, "JSON オブジェクトを送ってください。"

    question = payload.get("question")
    if not isinstance(question, str) or not question.strip():
        return None, "question は必須です（空にできません）。"

    cleaned = {
        "question": question.strip()[:MAX_QUESTION],
        "nodeId": _clip_str(payload.get("nodeId")),
        "label": _clip_str(payload.get("label")),
        "kind": _clip_str(payload.get("kind")),
        "path": _clip_str(payload.get("path")),
        "relatedEdges": _clip_str(payload.get("relatedEdges"), MAX_FIELD),
        "dslExcerpt": _clip_str(payload.get("dslExcerpt"), MAX_FIELD),
    }

    path = cleaned["path"].strip()
    if path and not within_repo_root(path, config.repo_root):
        return None, "path がリポジトリルート外を指しています（拒否）。"

    # model / effort は任意・許可リスト限定。空/空白は「(default)＝フラグ省略」として None 扱い。
    # client が送るのは「値」であってフラグではない。サーバ許可リストと完全一致照合し、外れは拒否。
    model = (payload.get("model") or "").strip() if isinstance(payload.get("model"), str) else ""
    if model:
        if model not in config.allowed_models:
            return None, "model が許可リストにありません（拒否）。"
        cleaned["model"] = model
    else:
        cleaned["model"] = None

    effort = (payload.get("effort") or "").strip() if isinstance(payload.get("effort"), str) else ""
    if effort:
        if effort not in ALLOWED_EFFORTS:
            return None, "effort が許可された値ではありません（low/medium/high/xhigh/max）。"
        cleaned["effort"] = effort
    else:
        cleaned["effort"] = None

    return cleaned, None


# --- HTTP ハンドラ -----------------------------------------------------------

class BridgeHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "repo-map-local-bridge/1.0"

    # 便宜アクセサ
    @property
    def config(self) -> BridgeConfig:
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
        elif path in ("/api/ask", "/api/reset"):
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
        self._send_json(200, {
            "ok": True,
            "repoRoot": self.config.repo_root,
            "html": self.config.html,
            "dsl": self.config.dsl,
            "claude": bool(resolve_claude(self.config.claude_bin)),
            "permissionMode": self.config.permission_mode,
            "allowedTools": self.config.allowed_tools,
            "sessionContinuity": getattr(self.server, "session_continuity", True),
            "sessionId": getattr(self.server, "session_id", None),
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

        prompt = build_prompt(cleaned)
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
        """
        srv = self.server
        if not getattr(srv, "session_continuity", True):
            with srv.claude_lock:
                return run_claude(prompt, self.config, model=model, effort=effort)

        with srv.claude_lock:
            with srv.state_lock:
                sid = srv.session_id
                start_epoch = srv.session_epoch
            is_new = sid is None
            if is_new:
                sid = str(uuid.uuid4())
            result = run_claude(prompt, self.config, model=model, effort=effort,
                                session_id=sid, resume=not is_new)
            if not result.get("ok") and not is_new:
                # 既存会話の resume に失敗 → 新しい会話として 1 回だけやり直す
                sid = str(uuid.uuid4())
                result = run_claude(prompt, self.config, model=model, effort=effort,
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


# --- 起動 --------------------------------------------------------------------

def parse_args(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="repo_map_local_bridge.py",
        description="生成済み repo-map HTML とローカル Claude Code をつなぐ localhost ブリッジ。",
    )
    parser.add_argument("--repo-root", required=True, help="対象リポジトリのルート（claude の cwd）")
    parser.add_argument("--html", required=True, help="配信する生成済み repo-map HTML のパス")
    parser.add_argument("--dsl", default=None, help="（任意）repo-map DSL 正本のパス。repo-root 配下のみ")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"待受ポート（既定 {DEFAULT_PORT}）")
    parser.add_argument("--claude-bin", default="claude", help="claude 実行ファイル名/パス")
    parser.add_argument("--claude-model", default=None, help="（任意）claude --model に渡すモデル名（高速化用など）")
    parser.add_argument("--models", default=DEFAULT_MODELS,
                        help=f"UI のモデル選択肢（カンマ区切り許可リスト。既定 {DEFAULT_MODELS}）。空なら選択肢を出さない。")
    parser.add_argument("--default-model", default=DEFAULT_MODEL,
                        help=f"UI で初期選択するモデル（--models のいずれか。既定 {DEFAULT_MODEL}）。外れていれば (default) に戻す。")
    parser.add_argument("--default-effort", default=DEFAULT_EFFORT, choices=list(ALLOWED_EFFORTS),
                        help=f"UI で初期選択する reasoning effort（low/medium/high/xhigh/max。既定 {DEFAULT_EFFORT}）。")
    parser.add_argument("--allowed-tools", default=DEFAULT_ALLOWED_TOOLS,
                        help=f"claude --allowedTools の値（既定 {DEFAULT_ALLOWED_TOOLS}）")
    parser.add_argument("--permission-mode", default=DEFAULT_PERMISSION_MODE,
                        help=f"claude --permission-mode（既定 {DEFAULT_PERMISSION_MODE}）")
    parser.add_argument("--timeout", type=float, default=DEFAULT_CLAUDE_TIMEOUT,
                        help=f"claude 呼び出しのタイムアウト秒（既定 {DEFAULT_CLAUDE_TIMEOUT}）")
    parser.add_argument("--no-session-continuity", action="store_true",
                        help="会話継続を無効化し、質問ごとに独立した claude 起動に戻す"
                             "（既定は継続 ON。claude --no-session-persistence とは別物）")
    return parser.parse_args(argv)


def build_config(args: argparse.Namespace) -> BridgeConfig:
    repo_root = os.path.realpath(args.repo_root)
    if not os.path.isdir(repo_root):
        raise SystemExit(f"--repo-root がディレクトリではありません: {args.repo_root}")

    html_path = os.path.realpath(args.html)
    if not os.path.isfile(html_path):
        raise SystemExit(f"--html がファイルではありません: {args.html}")

    dsl_path = None
    if args.dsl:
        dsl_path = os.path.realpath(args.dsl)
        if not within_repo_root(dsl_path, repo_root):
            raise SystemExit("--dsl がリポジトリルート外を指しています（拒否）。")

    allowed_models = tuple(m.strip() for m in (args.models or "").split(",") if m.strip())
    default_model = args.default_model if args.default_model in allowed_models else None
    if args.default_model and default_model is None:
        sys.stderr.write(
            f"[bridge] --default-model {args.default_model} は --models に無いので (default) に戻します\n"
        )

    return BridgeConfig(
        repo_root=repo_root,
        html=html_path,
        dsl=dsl_path,
        port=args.port,
        claude_bin=args.claude_bin,
        claude_model=args.claude_model,
        allowed_tools=args.allowed_tools,
        permission_mode=args.permission_mode,
        timeout=args.timeout,
        session_continuity=not args.no_session_continuity,
        allowed_models=allowed_models,
        default_model=default_model,
        default_effort=args.default_effort,
    )


def serve(config: BridgeConfig):
    server = BridgeServer(("127.0.0.1", config.port), BridgeHandler)
    server.bridge_config = config  # type: ignore[attr-defined]
    server.session_continuity = config.session_continuity
    url = f"http://127.0.0.1:{config.port}/repo-map.html"
    sys.stderr.write(f"[bridge] listening on {url}\n")
    sys.stderr.write(f"[bridge] repo-root: {config.repo_root}\n")
    sys.stderr.write(f"[bridge] claude: {'found' if resolve_claude(config.claude_bin) else 'NOT FOUND'}\n")
    sys.stderr.write(f"[bridge] session continuity: {'on' if config.session_continuity else 'off'}\n")
    models_label = ",".join(config.allowed_models) if config.allowed_models else "(none)"
    sys.stderr.write(
        f"[bridge] models: {models_label} "
        f"(default={config.default_model or '(default)'}, effort={config.default_effort or '(default)'})\n"
    )
    sys.stderr.write("[bridge] stop with Ctrl+C\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.stderr.write("\n[bridge] stopped\n")
    finally:
        server.server_close()


def main(argv=None):
    config = build_config(parse_args(argv))
    serve(config)


if __name__ == "__main__":
    main()

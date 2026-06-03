#!/usr/bin/env python3
"""repo_map_local_bridge の標準ライブラリのみのテスト。

実 `claude -p` は決して呼ばない（claude_bin を存在しないパスに向けて、resolve 段で止める）。
実行: python3 -m unittest discover -s skills/repo-map-interactive-viewer/tests -v
"""

import http.client
import importlib.util
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import uuid

# --- 対象モジュールを scripts/ から読み込む ---------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR = os.path.dirname(HERE)
BRIDGE_PATH = os.path.join(SKILL_DIR, "scripts", "repo_map_local_bridge.py")
EXAMPLE_HTML = os.path.join(SKILL_DIR, "examples", "repo-map.html")

_spec = importlib.util.spec_from_file_location("repo_map_local_bridge", BRIDGE_PATH)
bridge = importlib.util.module_from_spec(_spec)
# dataclass の型解決のため、exec 前に sys.modules へ登録する（importlib の定石）
sys.modules[_spec.name] = bridge
_spec.loader.exec_module(bridge)

# 実 claude を絶対に呼ばないための、存在しないバイナリパス
FAKE_CLAUDE = "/nonexistent/claude-bin-for-tests-xyz"


def make_config(repo_root, html=EXAMPLE_HTML, claude_bin=FAKE_CLAUDE, dsl=None,
                allowed_models=("opus", "sonnet", "haiku"), default_model=None, default_effort=None):
    return bridge.BridgeConfig(
        repo_root=os.path.realpath(repo_root),
        html=html,
        dsl=dsl,
        port=0,
        claude_bin=claude_bin,
        claude_model=None,
        allowed_tools="Read,Glob,Grep",
        permission_mode="plan",
        timeout=30.0,
        allowed_models=tuple(allowed_models),
        default_model=default_model,
        default_effort=default_effort,
    )


def _free_port():
    """直前まで空いていた 127.0.0.1 のポート番号を返す（テスト用）。"""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]
    finally:
        s.close()


def request(port, method, path, body=None, headers=None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    try:
        h = dict(headers or {})
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            h.setdefault("Content-Type", "application/json")
        conn.request(method, path, body=data, headers=h)
        resp = conn.getresponse()
        return resp.status, resp.read()
    finally:
        conn.close()


# --- 純粋関数のテスト --------------------------------------------------------

class PromptTests(unittest.TestCase):
    def test_build_prompt_includes_fields_and_policy(self):
        payload = {
            "question": "この package は何に使われていますか？",
            "nodeId": "web",
            "label": "Web App",
            "kind": "package",
            "path": "apps/web",
            "relatedEdges": "monorepo web contains\nweb core imports",
            "dslExcerpt": 'web package "Web App" apps/web\nmonorepo web contains',
        }
        prompt = bridge.build_prompt(payload)
        for needle in (
            "node id: web",
            "label: Web App",
            "kind: package",
            "path: apps/web",
            "monorepo web contains",
            "この package は何に使われていますか？",
            "ファイル編集、生成、削除はしないでください。",
            "最後に「次に読むとよいファイル」を挙げてください。",
            "回答は日本語を基本にしてください。",
        ):
            self.assertIn(needle, prompt)

    def test_build_prompt_placeholders_for_empty(self):
        prompt = bridge.build_prompt({"question": "q"})
        self.assertIn("node id: (未指定)", prompt)
        self.assertIn("path: (未指定)", prompt)
        self.assertIn("related edges:\n(なし)", prompt)
        self.assertIn("DSL excerpt:\n(なし)", prompt)


class ClaudeArgvTests(unittest.TestCase):
    def test_argv_shape_is_safe(self):
        argv = bridge.build_claude_argv(
            "claude", "PROMPT", permission_mode="plan", allowed_tools="Read,Glob,Grep"
        )
        self.assertEqual(argv[0], "claude")
        self.assertIn("-p", argv)
        self.assertEqual(argv[argv.index("--output-format") + 1], "json")
        self.assertEqual(argv[argv.index("--permission-mode") + 1], "plan")
        self.assertIn("PROMPT", argv)
        # --allowedTools が正（--tools ではない）、かつ可変長が prompt を飲まないよう末尾
        self.assertEqual(argv[-2:], ["--allowedTools", "Read,Glob,Grep"])
        self.assertNotIn("--tools", argv)
        # 危険フラグは決して付かない
        self.assertNotIn("--dangerously-skip-permissions", argv)

    def test_model_added_when_given(self):
        argv = bridge.build_claude_argv("claude", "P", model="claude-haiku-4-5")
        self.assertEqual(argv[argv.index("--model") + 1], "claude-haiku-4-5")

    def test_effort_added_when_given(self):
        argv = bridge.build_claude_argv("claude", "P", effort="high")
        self.assertEqual(argv[argv.index("--effort") + 1], "high")
        # 末尾の allowedTools は維持（effort は prompt を飲まない）
        self.assertEqual(argv[-2:], ["--allowedTools", "Read,Glob,Grep"])

    def test_no_effort_by_default(self):
        argv = bridge.build_claude_argv("claude", "P")
        self.assertNotIn("--effort", argv)

    def test_model_and_effort_order(self):
        argv = bridge.build_claude_argv(
            "claude", "P", model="opus", effort="high", session_id="U-1", resume=False
        )
        # --model < --effort < session フラグ < prompt の順
        self.assertLess(argv.index("--model"), argv.index("--effort"))
        self.assertLess(argv.index("--effort"), argv.index("--session-id"))
        self.assertLess(argv.index("--effort"), argv.index("P"))

    def test_no_session_flags_by_default(self):
        argv = bridge.build_claude_argv("claude", "PROMPT")
        self.assertNotIn("--session-id", argv)
        self.assertNotIn("--resume", argv)
        # 継続無しでも allowedTools は末尾のまま
        self.assertEqual(argv[-2:], ["--allowedTools", "Read,Glob,Grep"])

    def test_session_id_on_first_turn(self):
        argv = bridge.build_claude_argv("claude", "PROMPT", session_id="U-123", resume=False)
        self.assertEqual(argv[argv.index("--session-id") + 1], "U-123")
        self.assertNotIn("--resume", argv)
        self.assertEqual(argv[-2:], ["--allowedTools", "Read,Glob,Grep"])
        # session フラグは prompt 位置引数より前にある
        self.assertLess(argv.index("--session-id"), argv.index("PROMPT"))

    def test_resume_on_later_turn(self):
        argv = bridge.build_claude_argv("claude", "PROMPT", session_id="U-123", resume=True)
        self.assertEqual(argv[argv.index("--resume") + 1], "U-123")
        self.assertNotIn("--session-id", argv)
        self.assertEqual(argv[-2:], ["--allowedTools", "Read,Glob,Grep"])
        self.assertLess(argv.index("--resume"), argv.index("PROMPT"))

    def test_empty_session_id_emits_no_flag(self):
        # 空 ID で bare --resume を出すと対話ピッカーで hang し得るので、絶対に出さない
        argv = bridge.build_claude_argv("claude", "PROMPT", session_id="", resume=True)
        self.assertNotIn("--resume", argv)
        self.assertNotIn("--session-id", argv)


class PathJailTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_within_repo_root(self):
        root = self.tmp
        self.assertTrue(bridge.within_repo_root("apps/web", root))
        self.assertTrue(bridge.within_repo_root(os.path.join(root, "a", "b"), root))
        self.assertFalse(bridge.within_repo_root("../escape", root))
        self.assertFalse(bridge.within_repo_root("/etc/passwd", root))
        self.assertFalse(bridge.within_repo_root("apps/../../escape", root))

    def test_validate_payload(self):
        cfg = make_config(self.tmp)
        # question 必須
        _, err = bridge.validate_ask_payload({"question": ""}, cfg)
        self.assertIsNotNone(err)
        _, err = bridge.validate_ask_payload({"question": "   "}, cfg)
        self.assertIsNotNone(err)
        _, err = bridge.validate_ask_payload({"nodeId": "web"}, cfg)
        self.assertIsNotNone(err)
        # repo-root 外パスは拒否
        _, err = bridge.validate_ask_payload({"question": "q", "path": "../../etc/passwd"}, cfg)
        self.assertIsNotNone(err)
        # 正常系
        cleaned, err = bridge.validate_ask_payload({"question": "q", "path": "apps/web"}, cfg)
        self.assertIsNone(err)
        self.assertEqual(cleaned["path"], "apps/web")
        self.assertEqual(cleaned["question"], "q")


class ModelEffortValidateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_accepts_allowed_model_and_effort(self):
        cfg = make_config(self.tmp, allowed_models=("opus", "sonnet", "haiku"))
        cleaned, err = bridge.validate_ask_payload(
            {"question": "q", "model": "opus", "effort": "high"}, cfg
        )
        self.assertIsNone(err)
        self.assertEqual(cleaned["model"], "opus")
        self.assertEqual(cleaned["effort"], "high")

    def test_rejects_model_outside_allowlist(self):
        cfg = make_config(self.tmp, allowed_models=("opus", "sonnet"))
        _, err = bridge.validate_ask_payload({"question": "q", "model": "evil-model"}, cfg)
        self.assertIsNotNone(err)

    def test_rejects_unknown_effort(self):
        cfg = make_config(self.tmp)
        _, err = bridge.validate_ask_payload({"question": "q", "effort": "ultra"}, cfg)
        self.assertIsNotNone(err)

    def test_omitted_become_none(self):
        cfg = make_config(self.tmp)
        cleaned, err = bridge.validate_ask_payload({"question": "q"}, cfg)
        self.assertIsNone(err)
        self.assertIsNone(cleaned["model"])
        self.assertIsNone(cleaned["effort"])

    def test_empty_string_coerced_to_none(self):
        # 「(default)」セレクトは value="" を送り得る → フラグ省略（許可リスト照合に掛けない）
        cfg = make_config(self.tmp)
        cleaned, err = bridge.validate_ask_payload(
            {"question": "q", "model": "", "effort": "  "}, cfg
        )
        self.assertIsNone(err)
        self.assertIsNone(cleaned["model"])
        self.assertIsNone(cleaned["effort"])


class ClaudeNotFoundTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_run_claude_reports_missing_binary(self):
        cfg = make_config(self.tmp, claude_bin=FAKE_CLAUDE)
        result = bridge.run_claude("PROMPT", cfg)  # 実行されない（resolve で None）
        self.assertFalse(result["ok"])
        self.assertIn("claude", result["error"])


# --- HTTP 統合テスト（実 claude は呼ばない） --------------------------------

class ServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.config = make_config(self.tmp, html=EXAMPLE_HTML)
        self.server = bridge.BridgeServer(("127.0.0.1", 0), bridge.BridgeHandler)
        self.server.bridge_config = self.config
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_health(self):
        status, body = request(self.port, "GET", "/api/health")
        self.assertEqual(status, 200)
        data = json.loads(body)
        self.assertTrue(data["ok"])
        self.assertEqual(data["repoRoot"], os.path.realpath(self.tmp))
        self.assertFalse(data["claude"])  # 偽の bin なので False
        # セッション欄: 既定で継続 ON、まだ会話を始めていないので id は null
        self.assertTrue(data["sessionContinuity"])
        self.assertIsNone(data["sessionId"])
        # リモート停止は既定で有効（HTML が停止ボタン表示を判断するのに使う）
        self.assertTrue(data["remoteShutdown"])
        # model/effort 公開: 許可リストと固定 effort 列挙、初期選択（make_config 既定では None）
        self.assertEqual(data["availableModels"], ["opus", "sonnet", "haiku"])
        self.assertEqual(data["availableEfforts"], ["low", "medium", "high", "xhigh", "max"])
        self.assertIsNone(data["defaultModel"])
        self.assertIsNone(data["defaultEffort"])

    def test_health_exposes_service_and_pid(self):
        # reclaim の本人確認に使う service / pid を health が公開している
        status, body = request(self.port, "GET", "/api/health")
        self.assertEqual(status, 200)
        data = json.loads(body)
        self.assertEqual(data["service"], bridge.SERVICE_ID)
        self.assertEqual(data["pid"], os.getpid())   # サーバはこのテストプロセス内スレッド

    def test_probe_health_identifies_our_bridge(self):
        probe = bridge._probe_health(self.port)
        self.assertIsNotNone(probe)
        self.assertTrue(bridge._is_our_bridge(probe))
        self.assertEqual(bridge._bridge_pid(probe), os.getpid())

    def test_smoke_serves_html(self):
        status, body = request(self.port, "GET", "/repo-map.html")
        self.assertEqual(status, 200)
        self.assertIn(b"data-node-id", body)
        status_root, _ = request(self.port, "GET", "/")
        self.assertEqual(status_root, 200)

    def test_ask_requires_question(self):
        status, body = request(self.port, "POST", "/api/ask", {"nodeId": "web"})
        self.assertEqual(status, 400)
        self.assertFalse(json.loads(body)["ok"])

    def test_ask_rejects_path_outside_root(self):
        status, body = request(
            self.port, "POST", "/api/ask", {"question": "q", "path": "../../etc/passwd"}
        )
        self.assertEqual(status, 400)
        self.assertFalse(json.loads(body)["ok"])

    def test_ask_valid_reaches_claude_then_reports_missing(self):
        # 正常な入力 → run_claude へ → 偽 bin なので 502 ＋ ok:false（実 claude は呼ばれない）
        status, body = request(self.port, "POST", "/api/ask", {"question": "q", "nodeId": "web"})
        self.assertEqual(status, 502)
        data = json.loads(body)
        self.assertFalse(data["ok"])
        self.assertIn("claude", data["error"])

    def test_forbidden_host(self):
        status, _ = request(self.port, "GET", "/api/health", headers={"Host": "evil.example.com"})
        self.assertEqual(status, 403)

    def test_unknown_path_404(self):
        status, _ = request(self.port, "GET", "/nope")
        self.assertEqual(status, 404)

    def test_method_not_allowed_on_ask(self):
        status, _ = request(self.port, "GET", "/api/ask")
        self.assertEqual(status, 405)

    def test_body_too_large(self):
        big = {"question": "q", "dslExcerpt": "x" * (300 * 1024)}
        status, _ = request(self.port, "POST", "/api/ask", big)
        self.assertEqual(status, 413)


class ShutdownEndpointTests(unittest.TestCase):
    """POST /api/shutdown でブリッジが通常停止経路で止まることを検証する。

    停止テストは自前でサーバを起動・停止して完結させる（共有サーバを巻き込まない）。
    serve_forever スレッドが join できることを「停止した」証拠として使う。
    """

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.config = make_config(self.tmp, html=EXAMPLE_HTML)
        self.server = bridge.BridgeServer(("127.0.0.1", 0), bridge.BridgeHandler)
        self.server.bridge_config = self.config
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        # 既に停止済みでも二重停止に耐えるよう握りつぶす
        try:
            self.server.shutdown()
        except Exception:
            pass
        try:
            self.server.server_close()
        except Exception:
            pass
        self.thread.join(timeout=3)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_shutdown_stops_server(self):
        status, body = request(self.port, "POST", "/api/shutdown")
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["ok"])
        # serve_forever が抜ければスレッドは終了する（＝サーバ停止）
        self.thread.join(timeout=5)
        self.assertFalse(self.thread.is_alive())

    def test_shutdown_get_not_allowed(self):
        status, _ = request(self.port, "GET", "/api/shutdown")
        self.assertEqual(status, 405)
        self.assertTrue(self.thread.is_alive())  # GET では止まらない

    def test_shutdown_disabled_returns_403(self):
        self.server.remote_shutdown = False
        status, body = request(self.port, "POST", "/api/shutdown")
        self.assertEqual(status, 403)
        self.assertFalse(json.loads(body)["ok"])
        # 無効時は止まらず、後続リクエストにも応答する
        self.assertTrue(self.thread.is_alive())
        health_status, _ = request(self.port, "GET", "/api/health")
        self.assertEqual(health_status, 200)

    def test_disabled_health_reports_remote_shutdown_false(self):
        self.server.remote_shutdown = False
        _, body = request(self.port, "GET", "/api/health")
        self.assertFalse(json.loads(body)["remoteShutdown"])


# --- セッション継続のテスト（実 claude は呼ばず bridge.run_claude を差し替える） -----

def _is_uuid(value) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


class _Recorder:
    """run_claude の代役。呼び出し引数を記録し、固定の結果を返す。"""

    def __init__(self, ok=True):
        self.calls = []
        self.ok = ok

    def __call__(self, prompt, config, *, model=None, effort=None, session_id=None, resume=False):
        self.calls.append({"session_id": session_id, "resume": resume, "model": model, "effort": effort})
        if self.ok:
            return {"ok": True, "answer": "A", "raw": None}
        return {"ok": False, "error": "boom", "detail": "x"}


class _LiveServerCase(unittest.TestCase):
    """BridgeServer をスレッドで立て、bridge.run_claude を差し替える土台。"""

    def _start(self, run_claude_fn=None, session_continuity=True):
        self.tmp = tempfile.mkdtemp()
        self.config = make_config(self.tmp, html=EXAMPLE_HTML)
        self.server = bridge.BridgeServer(("127.0.0.1", 0), bridge.BridgeHandler)
        self.server.bridge_config = self.config
        self.server.session_continuity = session_continuity
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self._orig_run_claude = bridge.run_claude
        if run_claude_fn is not None:
            bridge.run_claude = run_claude_fn

    def tearDown(self):
        if hasattr(self, "_orig_run_claude"):
            bridge.run_claude = self._orig_run_claude
        if hasattr(self, "server"):
            self.server.shutdown()
            self.server.server_close()
            self.thread.join(timeout=3)
        tmp = getattr(self, "tmp", None)
        if tmp:
            shutil.rmtree(tmp, ignore_errors=True)


class SessionChainingTests(_LiveServerCase):
    def setUp(self):
        self.rec = _Recorder(ok=True)
        self._start(run_claude_fn=self.rec)

    def test_questions_share_one_session_and_reset_starts_new(self):
        # 1 ターン目: 新規会話（resume=False）＋サーバ生成 UUID
        status, _ = request(self.port, "POST", "/api/ask", {"question": "q1"})
        self.assertEqual(status, 200)
        # 2 ターン目: 同じ会話を継続（resume=True）＋同じ UUID
        status, _ = request(self.port, "POST", "/api/ask", {"question": "q2"})
        self.assertEqual(status, 200)
        self.assertEqual(len(self.rec.calls), 2)
        first, second = self.rec.calls
        self.assertFalse(first["resume"])
        self.assertTrue(_is_uuid(first["session_id"]))
        self.assertTrue(second["resume"])
        self.assertEqual(second["session_id"], first["session_id"])
        # reset → 次は別 UUID で新規会話
        status, body = request(self.port, "POST", "/api/reset")
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["ok"])
        status, _ = request(self.port, "POST", "/api/ask", {"question": "q3"})
        self.assertEqual(status, 200)
        third = self.rec.calls[2]
        self.assertFalse(third["resume"])
        self.assertTrue(_is_uuid(third["session_id"]))
        self.assertNotEqual(third["session_id"], first["session_id"])

    def test_continuity_off_uses_no_session(self):
        self.server.session_continuity = False
        status, _ = request(self.port, "POST", "/api/ask", {"question": "q"})
        self.assertEqual(status, 200)
        self.assertEqual(len(self.rec.calls), 1)
        self.assertIsNone(self.rec.calls[0]["session_id"])
        self.assertFalse(self.rec.calls[0]["resume"])
        self.assertIsNone(self.server.session_id)

    def test_model_and_effort_forwarded_to_run_claude(self):
        # 許可リスト内の model/effort が run_claude まで素通しされる（resume ターンでも維持）
        request(self.port, "POST", "/api/ask", {"question": "q1", "model": "opus", "effort": "high"})
        request(self.port, "POST", "/api/ask", {"question": "q2", "model": "sonnet", "effort": "low"})
        self.assertEqual(self.rec.calls[0]["model"], "opus")
        self.assertEqual(self.rec.calls[0]["effort"], "high")
        self.assertTrue(self.rec.calls[1]["resume"])  # 2 ターン目は継続
        self.assertEqual(self.rec.calls[1]["model"], "sonnet")
        self.assertEqual(self.rec.calls[1]["effort"], "low")


class ResumeFallbackTests(_LiveServerCase):
    def setUp(self):
        self.calls = []

        def fake(prompt, config, *, model=None, effort=None, session_id=None, resume=False):
            self.calls.append({"session_id": session_id, "resume": resume})
            if resume:
                return {"ok": False, "error": "session not found", "detail": "gone"}
            return {"ok": True, "answer": "A", "raw": None}

        self._start(run_claude_fn=fake)

    def test_resume_failure_retries_fresh(self):
        self.server.session_id = "EXISTING-ID"   # 既存会話を持った状態にしておく
        status, body = request(self.port, "POST", "/api/ask", {"question": "q"})
        self.assertEqual(status, 200)             # ハードエラーにせず成功で返る
        self.assertTrue(json.loads(body)["ok"])
        # 1 回目 resume（失敗）→ 2 回目 fresh（成功）
        self.assertEqual(len(self.calls), 2)
        self.assertTrue(self.calls[0]["resume"])
        self.assertEqual(self.calls[0]["session_id"], "EXISTING-ID")
        self.assertFalse(self.calls[1]["resume"])
        self.assertTrue(_is_uuid(self.calls[1]["session_id"]))
        self.assertNotEqual(self.calls[1]["session_id"], "EXISTING-ID")
        self.assertEqual(self.server.session_id, self.calls[1]["session_id"])


class ResetEndpointTests(_LiveServerCase):
    def setUp(self):
        self.rec = _Recorder(ok=True)
        self._start(run_claude_fn=self.rec)

    def test_reset_clears_session_and_bumps_epoch(self):
        self.server.session_id = "X"
        epoch0 = self.server.session_epoch
        status, body = request(self.port, "POST", "/api/reset")
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["ok"])
        self.assertIsNone(self.server.session_id)
        self.assertEqual(self.server.session_epoch, epoch0 + 1)

    def test_reset_get_is_405(self):
        status, _ = request(self.port, "GET", "/api/reset")
        self.assertEqual(status, 405)


class ResetConcurrencyTests(_LiveServerCase):
    def setUp(self):
        self.entered = threading.Event()
        self.release = threading.Event()

        def blocking(prompt, config, *, model=None, effort=None, session_id=None, resume=False):
            self.entered.set()
            self.release.wait(timeout=5)
            return {"ok": True, "answer": "A", "raw": None}

        self._start(run_claude_fn=blocking)

    def _ask_in_thread(self):
        t = threading.Thread(
            target=lambda: request(self.port, "POST", "/api/ask", {"question": "q"}),
            daemon=True,
        )
        t.start()
        return t

    def test_reset_not_blocked_by_inflight_ask(self):
        t = self._ask_in_thread()
        self.assertTrue(self.entered.wait(timeout=5))   # ask が run_claude に入った
        start = time.monotonic()
        status, _ = request(self.port, "POST", "/api/reset")  # 実行中でも即返るはず
        elapsed = time.monotonic() - start
        self.assertEqual(status, 200)
        self.assertLess(elapsed, 2.0)
        self.release.set()
        t.join(timeout=5)

    def test_reset_wins_over_inflight_ask(self):
        t = self._ask_in_thread()                       # 新規会話（session_id None から開始）
        self.assertTrue(self.entered.wait(timeout=5))
        request(self.port, "POST", "/api/reset")        # epoch を進める
        self.release.set()
        t.join(timeout=5)
        # ask 完了後も reset が勝つ（古い ask の session_id は反映されない）
        self.assertIsNone(self.server.session_id)


class InjectionTests(_LiveServerCase):
    def setUp(self):
        self.rec = _Recorder(ok=True)
        self._start(run_claude_fn=self.rec)

    def test_client_supplied_session_id_is_ignored(self):
        body = {"question": "q", "sessionId": "evil", "session_id": "evil2", "nodeId": "web"}
        status, _ = request(self.port, "POST", "/api/ask", body)
        self.assertEqual(status, 200)
        used = self.rec.calls[0]["session_id"]
        self.assertTrue(_is_uuid(used))           # サーバ生成 UUID が使われる
        self.assertNotIn(used, ("evil", "evil2"))  # client 供給値は使われない

    def test_validate_drops_unknown_keys(self):
        cfg = make_config(self.tmp)
        cleaned, err = bridge.validate_ask_payload(
            {"question": "q", "sessionId": "evil", "session_id": "evil2"}, cfg
        )
        self.assertIsNone(err)
        self.assertNotIn("sessionId", cleaned)
        self.assertNotIn("session_id", cleaned)
        # model/effort は既知キー化されたが、未指定なら None（フラグ省略）
        self.assertIsNone(cleaned["model"])
        self.assertIsNone(cleaned["effort"])


# --- ポート確保（reclaim）のテスト ------------------------------------------

class ReclaimHelperTests(unittest.TestCase):
    """reclaim_port を支えるヘルパの判定ロジック（プロセスは起こさない）。"""

    def test_is_our_bridge_by_server_header(self):
        probe = {"server": "repo-map-local-bridge/1.0 Python/3.12", "data": None}
        self.assertTrue(bridge._is_our_bridge(probe))

    def test_is_our_bridge_by_service_field(self):
        probe = {"server": "", "data": {"service": bridge.SERVICE_ID}}
        self.assertTrue(bridge._is_our_bridge(probe))

    def test_foreign_is_not_our_bridge(self):
        self.assertFalse(bridge._is_our_bridge({"server": "nginx/1.25", "data": {"x": 1}}))
        self.assertFalse(bridge._is_our_bridge({"server": "", "data": None}))

    def test_bridge_pid_extraction(self):
        self.assertEqual(bridge._bridge_pid({"data": {"pid": 4321}}), 4321)
        self.assertIsNone(bridge._bridge_pid({"data": {"pid": 0}}))     # 非正は無効
        self.assertIsNone(bridge._bridge_pid({"data": {"pid": "x"}}))   # 非 int は無効
        self.assertIsNone(bridge._bridge_pid({"data": None}))

    def test_reclaim_disabled_is_noop_true(self):
        # --no-reclaim 相当: 何もせず True（=そのまま bind を試す）
        self.assertTrue(bridge.reclaim_port(_free_port(), enabled=False))

    def test_reclaim_free_port_returns_true(self):
        # 誰もいないポートは掃除不要で True
        self.assertTrue(bridge.reclaim_port(_free_port()))


class ReclaimSubprocessTests(unittest.TestCase):
    """実際に別プロセスのブリッジを起こし、reclaim_port が本人を停止することを確認。"""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.procs = []

    def tearDown(self):
        for p in self.procs:
            try:
                p.kill()
            except OSError:
                pass
            try:
                p.wait(timeout=3)
            except (subprocess.TimeoutExpired, OSError):
                pass
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _spawn_bridge(self, port):
        proc = subprocess.Popen(
            [sys.executable, BRIDGE_PATH,
             "--repo-root", self.tmp, "--html", EXAMPLE_HTML,
             "--port", str(port), "--claude-bin", FAKE_CLAUDE, "--no-reclaim"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        self.procs.append(proc)
        # 子プロセスをゾンビにしないよう、終了を待つリーパースレッドを回す
        # （reclaim 側の _pid_alive が正しく「消えた」と判定できるようにするため）。
        threading.Thread(target=proc.wait, daemon=True).start()
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            probe = bridge._probe_health(port)
            if probe and bridge._is_our_bridge(probe):
                return proc
            time.sleep(0.1)
        self.fail("bridge subprocess did not become ready")

    def test_reclaim_stops_old_bridge(self):
        port = _free_port()
        proc = self._spawn_bridge(port)
        # health から旧 pid を本人確認
        probe = bridge._probe_health(port)
        self.assertEqual(bridge._bridge_pid(probe), proc.pid)
        # reclaim → 旧ブリッジを停止して True
        self.assertTrue(bridge.reclaim_port(port))
        # プロセスは終了し、ポートは解放されている
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline and proc.poll() is None:
            time.sleep(0.05)
        self.assertIsNotNone(proc.poll())              # 終了済み
        self.assertIsNone(bridge._probe_health(port))  # ポート解放


class ReclaimForeignTests(unittest.TestCase):
    """ポートを握るのが別アプリのときは reclaim は止めず False を返す（巻き添え防止）。"""

    def setUp(self):
        from http.server import BaseHTTPRequestHandler, HTTPServer

        class _Foreign(BaseHTTPRequestHandler):
            server_version = "TotallyOtherApp/9.9"

            def do_GET(self):  # noqa: N802
                body = b"{}"
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *a):  # 静かに
                pass

        self.port = _free_port()
        self.server = HTTPServer(("127.0.0.1", self.port), _Foreign)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)

    def test_reclaim_refuses_and_spares_foreign(self):
        # 別アプリ判定 → 止めずに False
        self.assertFalse(bridge.reclaim_port(self.port))
        # 巻き添えにしていない（まだ応答する）
        probe = bridge._probe_health(self.port)
        self.assertIsNotNone(probe)
        self.assertFalse(bridge._is_our_bridge(probe))


if __name__ == "__main__":
    unittest.main()

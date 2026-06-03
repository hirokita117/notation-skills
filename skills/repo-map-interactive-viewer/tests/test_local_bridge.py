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


def make_config(repo_root, html=EXAMPLE_HTML, claude_bin=FAKE_CLAUDE, dsl=None):
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
    )


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

    def __call__(self, prompt, config, *, session_id=None, resume=False):
        self.calls.append({"session_id": session_id, "resume": resume})
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


class ResumeFallbackTests(_LiveServerCase):
    def setUp(self):
        self.calls = []

        def fake(prompt, config, *, session_id=None, resume=False):
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

        def blocking(prompt, config, *, session_id=None, resume=False):
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


if __name__ == "__main__":
    unittest.main()

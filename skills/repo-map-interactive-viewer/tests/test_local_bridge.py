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
import unittest

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
        self.server = bridge.ThreadingHTTPServer(("127.0.0.1", 0), bridge.BridgeHandler)
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


if __name__ == "__main__":
    unittest.main()

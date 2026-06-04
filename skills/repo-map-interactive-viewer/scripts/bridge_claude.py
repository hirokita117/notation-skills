"""repo-map ローカルブリッジ — claude CLI 呼び出し。

安全寄りの固定フラグセットで `claude` の argv を組み立て（build_claude_argv）、subprocess で呼んで
（run_claude）、JSON 出力から回答テキストを取り出す（parse_claude_output）。実行ファイルの解決は
resolve_claude。argv 組み立て・model/effort・session の規則は references/bridge-claude-invocation.md
／ references/bridge-session-and-reclaim.md が正本。

注意（テストの monkeypatch 経路）: HTTP ハンドラはこのモジュールの `run_claude` を **module 修飾で**
呼ぶ（`bridge_claude.run_claude(...)`）。テストは `bridge.bridge_claude.run_claude` を差し替えて実
claude を呼ばせない。bare な `from bridge_claude import run_claude` で取り込むと差し替えが効かなくなる。
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess

from bridge_config import (
    BridgeConfig,
    DEFAULT_ALLOWED_TOOLS,
    DEFAULT_PERMISSION_MODE,
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

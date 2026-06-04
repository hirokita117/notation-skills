#!/usr/bin/env python3
"""repo-map ローカルブリッジ — 生成済み repo-map HTML Viewer とローカル Claude Code をつなぐ。

このファイルはエントリポイント兼ファサード。責務ごとに分割した兄弟モジュールを束ね、CLI 引数の
解釈（parse_args / build_config）とサーバ起動（serve / main）だけを担う。実体は次に分かれている:

  * bridge_config.py     — 既定値・上限・`BridgeConfig`。
  * bridge_prompt.py     — HTML のノード情報＋質問を Claude Code 用プロンプトへ整形（build_prompt）。
  * bridge_claude.py     — `claude -p` の argv 組み立て・subprocess 呼び出し（build_claude_argv / run_claude）。
  * bridge_validation.py — 入力の刈り込み・許可リスト・repo-root ジェイル（validate_ask_payload / within_repo_root）。
  * bridge_http.py       — 127.0.0.1 限定の HTTP ハンドラとセッション状態を持つサーバ（BridgeHandler / BridgeServer）。
  * bridge_reclaim.py    — 起動時に同ポートの古い自分のブリッジを掃除（reclaim_port）と SIGTERM 設定。

責務（repo-map-interactive-viewer Skill の一部）:
  * 生成済みの repo-map HTML を 127.0.0.1 限定で配信する。
  * HTML から送られたノード情報＋質問を Claude Code 用プロンプトに整形する。
  * `claude -p` を subprocess で呼び、回答を JSON で返す。
  * 同一起動中の質問を 1 つの Claude 会話として継続する（サーバ生成 UUID を持ち回り、
    1 ターン目 --session-id、以降 --resume）。claude は毎回起動・即終了で常駐しない。
  * 起動時、同ポートに残った『自分の』古いブリッジ（前回 Ctrl+C せず閉じて孤児化した等）を
    health で本人確認したうえで停止し、ポートを空けてから bind する（reclaim_port）。
  * HTML からの POST /api/shutdown でブリッジ自身を停止する（既定 ON、--no-remote-shutdown で無効化）。
    Ctrl+C と同じ通常停止経路（server_close）を通る。

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
  * 起動時の reclaim は health で本人確認できた自分のブリッジだけを停止する。ポートを握る
    『別アプリ』は決して kill しない（その場合は停止せず起動を中止する）。
  * --dangerously-skip-permissions は使わない。--no-session-persistence も使わない（resume と非互換）。

標準ライブラリのみ。Python 3 系（python3 / python）で動く。
"""

from __future__ import annotations

import os
import sys

# 兄弟モジュール（bridge_*.py）を import 可能にする。standalone 実行時は sys.path[0] が
# このディレクトリだが、テストが importlib.util.spec_from_file_location で本ファイルを読み込む
# 場合は自動で入らないため、明示的に先頭へ挿入してから兄弟を import する。
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import argparse

# --- 公開 API の再エクスポート（テストや外部参照のため bridge.<symbol> を維持） ---
# bridge_claude は module 修飾参照（bridge.bridge_claude.run_claude）を生かすため明示 import する。
import bridge_claude
from bridge_config import (  # noqa: F401  (再エクスポート)
    ALLOWED_EFFORTS,
    ALLOWED_HOSTS,
    BridgeConfig,
    DEFAULT_ALLOWED_TOOLS,
    DEFAULT_CLAUDE_TIMEOUT,
    DEFAULT_EFFORT,
    DEFAULT_MODEL,
    DEFAULT_MODELS,
    DEFAULT_PERMISSION_MODE,
    DEFAULT_PORT,
    MAX_BODY_BYTES,
    MAX_FIELD,
    MAX_QUESTION,
    SERVICE_ID,
)
from bridge_prompt import build_prompt  # noqa: F401
from bridge_claude import (  # noqa: F401
    build_claude_argv,
    parse_claude_output,
    resolve_claude,
    run_claude,
)
from bridge_validation import (  # noqa: F401
    _clip_str,
    validate_ask_payload,
    within_repo_root,
)
from bridge_http import BridgeHandler, BridgeServer  # noqa: F401
from bridge_reclaim import (  # noqa: F401
    _bridge_pid,
    _is_our_bridge,
    _pid_alive,
    _probe_health,
    _terminate_bridge,
    _wait_until_free,
    install_shutdown_signals,
    reclaim_port,
)


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
    parser.add_argument("--no-reclaim", action="store_true",
                        help="起動時に同ポートの古い repo-map ブリッジを自動停止しない"
                             "（既定は自動停止 ON。別アプリが使用中なら停止せず bind 失敗で中止）")
    parser.add_argument("--no-remote-shutdown", action="store_true",
                        help="HTML からの POST /api/shutdown でブリッジを停止する機能を無効化する"
                             "（既定は有効。無効時は停止ボタンを出さず、要求は 403 を返す）")
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
        reclaim=not args.no_reclaim,
        remote_shutdown=not args.no_remote_shutdown,
    )


def serve(config: BridgeConfig):
    # 起動前に、同ポートに残った『自分のブリッジ』だけを掃除してポートを空ける。
    if not reclaim_port(config.port, enabled=config.reclaim):
        raise SystemExit(
            f"ポート {config.port} を確保できませんでした。--port で別ポートを指定してください。"
        )
    try:
        server = BridgeServer(("127.0.0.1", config.port), BridgeHandler)
    except OSError as exc:
        raise SystemExit(
            f"ポート {config.port} を bind できませんでした: {exc}。"
            f" 別プロセスが使用中の可能性があります。--port で別ポートを指定してください。"
        )
    server.bridge_config = config  # type: ignore[attr-defined]
    server.session_continuity = config.session_continuity
    server.remote_shutdown = config.remote_shutdown
    install_shutdown_signals()   # SIGTERM でも finally の server_close を通す
    url = f"http://127.0.0.1:{config.port}/repo-map.html"
    sys.stderr.write(f"[bridge] listening on {url}\n")
    sys.stderr.write(f"[bridge] repo-root: {config.repo_root}\n")
    sys.stderr.write(f"[bridge] claude: {'found' if resolve_claude(config.claude_bin) else 'NOT FOUND'}\n")
    sys.stderr.write(f"[bridge] session continuity: {'on' if config.session_continuity else 'off'}\n")
    sys.stderr.write(f"[bridge] remote shutdown: {'on' if config.remote_shutdown else 'off'}\n")
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

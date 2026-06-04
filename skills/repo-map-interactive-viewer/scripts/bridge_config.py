"""repo-map ローカルブリッジ — 既定値・上限・`BridgeConfig`。

ブリッジ全体で共有する設定値の置き場。ロジックを持たず、定数と設定 dataclass だけを定義する。
他のモジュール（prompt / claude / validation / http / reclaim）とエントリ
`repo_map_local_bridge.py` がここから import する依存の根（このモジュールは何も import しない）。
"""

from __future__ import annotations

from dataclasses import dataclass

# --- 既定値 -----------------------------------------------------------------

DEFAULT_PORT = 17333
# 自分のブリッジを health で本人確認するための固定識別子。
# Server ヘッダ接頭辞（server_version）と /api/health の service フィールドの両方に使う。
SERVICE_ID = "repo-map-local-bridge"
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

# 対応する notation（DSL バージョン系）。プロンプト体裁の選択に使う。
ALLOWED_NOTATIONS = ("repo-map", "document-map")


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
    notation: str = "repo-map"                 # プロンプト体裁（repo-map / document-map）。--dsl から自動判定
    allowed_models: tuple[str, ...] = ()       # UI セレクトの許可リスト（--models 由来）
    default_model: str | None = None           # UI 初期選択モデル（allowed_models のいずれか）
    default_effort: str | None = None          # UI 初期選択 effort（ALLOWED_EFFORTS のいずれか）
    reclaim: bool = True                       # 起動時に同ポートの古い自分のブリッジを掃除するか
    remote_shutdown: bool = True               # HTML から POST /api/shutdown でブリッジを停止できるか

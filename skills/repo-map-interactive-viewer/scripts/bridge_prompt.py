"""ローカルブリッジ — プロンプト整形。

HTML から受け取ったノード情報＋質問を Claude Code 用プロンプトに整形する純粋関数。
副作用なし・I/O なしでテストしやすい。整形の規則は references/bridge-claude-invocation.md が正本。

notation（DSL バージョン）で体裁が変わる:
  * repo-map     … 対象はリポジトリ。「path」「repo-map DSL file」「実ファイル」「次に読むとよいファイル」。
  * document-map … 対象はドキュメント。「ref」「document-map DSL file」「元ドキュメント」「次に読むとよい箇所」。
どちらも HTML 側 buildPrompt（notation-render/scripts/html_emitter.mjs）とバイト一致させる。
"""

from __future__ import annotations


# --- notation ごとの体裁差分（HTML 側 buildPrompt と一致） -----------------------

_NOTATIONS = {
    "repo-map": {
        "intro1": "あなたはローカルリポジトリ理解を支援するアシスタントです。",
        "intro2": "対象リポジトリは現在のworking directoryです。",
        "viewer": "repo-map HTML Viewer",
        "ref_label": "path",
        "dsl_file_label": "repo-map DSL file",
        "policy_meaning": "- まず repo-map DSL 上の意味を説明してください。",
        "policy_read_dsl": "- repo-map DSL file が指定されているときは、まずそのファイルを Read して excerpt と整合を確認してください。",
        "policy_verify": "- 必要なら Read / Glob / Grep で実ファイルを確認してください。",
        "policy_next": "- 最後に「次に読むとよいファイル」を挙げてください。",
    },
    "document-map": {
        "intro1": "あなたはローカルドキュメント理解を支援するアシスタントです。",
        "intro2": "対象ドキュメントは現在のworking directory配下にあります。",
        "viewer": "document-map HTML Viewer",
        "ref_label": "ref",
        "dsl_file_label": "document-map DSL file",
        "policy_meaning": "- まず document-map DSL 上の意味（構造・論点・関係）を説明してください。",
        "policy_read_dsl": "- document-map DSL file が指定されているときは、まずそのファイルを Read して excerpt と整合を確認してください。",
        "policy_verify": "- 必要なら Read / Glob / Grep で元ドキュメントを確認してください。",
        "policy_next": "- 最後に「次に読むとよい箇所」を挙げてください。",
    },
}

DEFAULT_NOTATION = "repo-map"


def detect_notation(first_line: str | None) -> str:
    """DSL 先頭行から notation を判定する。未知/None は既定（repo-map）。"""
    if not isinstance(first_line, str):
        return DEFAULT_NOTATION
    head = first_line.strip()
    if head == "# document-map v1" or head.startswith("# document-map "):
        return "document-map"
    return DEFAULT_NOTATION


# --- プロンプト生成（純粋関数・テスト対象） ----------------------------------

def build_prompt(payload: dict, dsl_file: str | None = None, notation: str = DEFAULT_NOTATION) -> str:
    """HTML から受け取ったノード情報＋質問を Claude Code 用プロンプトに整形する。

    dsl_file は DSL 正本ファイルの絶対パス（サーバ注入・任意）。None / 空なら `(未指定)`。
    notation は DSL バージョン（"repo-map" / "document-map"）。体裁だけが変わる。
    client からは受け取らない（呼び出し側がサーバ設定から渡す）。
    """

    n = _NOTATIONS.get(notation, _NOTATIONS[DEFAULT_NOTATION])

    def line(value) -> str:
        text = (value or "").strip() if isinstance(value, str) else ""
        return text if text else "(未指定)"

    def block(value) -> str:
        text = (value or "").strip() if isinstance(value, str) else ""
        return text if text else "(なし)"

    question = (payload.get("question") or "").strip() if isinstance(payload.get("question"), str) else ""

    return (
        f"{n['intro1']}\n"
        f"{n['intro2']}\n"
        "\n"
        f"ユーザーは {n['viewer']} 上で次のノードを見ています。\n"
        "\n"
        f"node id: {line(payload.get('nodeId'))}\n"
        f"label: {line(payload.get('label'))}\n"
        f"kind: {line(payload.get('kind'))}\n"
        f"{n['ref_label']}: {line(payload.get('path'))}\n"
        "related edges:\n"
        f"{block(payload.get('relatedEdges'))}\n"
        "\n"
        f"{n['dsl_file_label']}: {line(dsl_file)}\n"
        "DSL excerpt:\n"
        f"{block(payload.get('dslExcerpt'))}\n"
        "\n"
        "ユーザーの質問:\n"
        f"{question}\n"
        "\n"
        "回答方針:\n"
        f"{n['policy_meaning']}\n"
        f"{n['policy_read_dsl']}\n"
        "- DSL ファイルパスが未指定のときは excerpt を正としてください。\n"
        f"{n['policy_verify']}\n"
        "- 推測と確認済み事実を分けてください。\n"
        "- ファイル編集、生成、削除はしないでください。\n"
        f"{n['policy_next']}\n"
        "- 回答は日本語を基本にしてください。\n"
    )

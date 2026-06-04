"""repo-map ローカルブリッジ — プロンプト整形。

HTML から受け取ったノード情報＋質問を Claude Code 用プロンプトに整形する純粋関数。
副作用なし・I/O なしでテストしやすい。整形の規則は references/bridge-claude-invocation.md が正本。
"""

from __future__ import annotations


# --- プロンプト生成（純粋関数・テスト対象） ----------------------------------

def build_prompt(payload: dict, dsl_file: str | None = None) -> str:
    """HTML から受け取ったノード情報＋質問を Claude Code 用プロンプトに整形する。

    dsl_file は repo-map DSL 正本ファイルの絶対パス（サーバ注入・任意）。None / 空なら
    `(未指定)` を載せる。client からは受け取らない（呼び出し側がサーバ設定から渡す）。
    """

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
        f"repo-map DSL file: {line(dsl_file)}\n"
        "DSL excerpt:\n"
        f"{block(payload.get('dslExcerpt'))}\n"
        "\n"
        "ユーザーの質問:\n"
        f"{question}\n"
        "\n"
        "回答方針:\n"
        "- まず repo-map DSL 上の意味を説明してください。\n"
        "- repo-map DSL file が指定されているときは、まずそのファイルを Read して excerpt と整合を確認してください。\n"
        "- DSL ファイルパスが未指定のときは excerpt を正としてください。\n"
        "- 必要なら Read / Glob / Grep で実ファイルを確認してください。\n"
        "- 推測と確認済み事実を分けてください。\n"
        "- ファイル編集、生成、削除はしないでください。\n"
        "- 最後に「次に読むとよいファイル」を挙げてください。\n"
        "- 回答は日本語を基本にしてください。\n"
    )

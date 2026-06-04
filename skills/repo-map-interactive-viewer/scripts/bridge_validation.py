"""repo-map ローカルブリッジ — 入力バリデーションとパス・ジェイル。

HTML から来る JSON を固定フィールドだけに刈り込み、長さ上限・許可リスト（model/effort）・
repo-root ジェイル（path）を当てる。パスの `..` 抜けは realpath で弾く（within_repo_root）。
安全方針は references/security.md が正本。
"""

from __future__ import annotations

import os

from bridge_config import ALLOWED_EFFORTS, MAX_FIELD, MAX_QUESTION


# --- パス・ジェイル ----------------------------------------------------------

def within_repo_root(path: str, repo_root: str) -> bool:
    """path が repo_root 配下に収まっているか（`..` 抜けを realpath で弾く）。"""
    root = os.path.realpath(repo_root)
    candidate = path if os.path.isabs(path) else os.path.join(root, path)
    real = os.path.realpath(candidate)
    return real == root or real.startswith(root + os.sep)


# --- 入力バリデーション ------------------------------------------------------

def _clip_str(value, limit: int = 4_000) -> str:
    if not isinstance(value, str):
        return ""
    return value[:limit]


def validate_ask_payload(payload, config):
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

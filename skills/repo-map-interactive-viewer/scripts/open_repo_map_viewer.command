#!/usr/bin/env bash
#
# repo-map インタラクティブ Viewer 起動スクリプト（macOS / ダブルクリック可）。
#
# やること:
#   1. python3 → 無ければ python を探す（どちらも無ければエラー終了）。
#   2. claude コマンドの有無を確認（無くても copy 方式は使えるので警告のみ）。
#   3. ローカルブリッジ（repo_map_local_bridge.py）を起動。
#   4. 既定ブラウザで http://127.0.0.1:<port>/repo-map.html を開く。
#   5. Ctrl+C で停止。
#
# 入力（任意・未指定なら同梱 example のデモ）:
#   位置引数:  open_repo_map_viewer.command <html> <repo-root> [dsl] [port]
#   環境変数:  REPO_MAP_HTML / REPO_MAP_REPO_ROOT / REPO_MAP_DSL / REPO_MAP_PORT
#
set -euo pipefail

# このスクリプトのあるディレクトリ（= scripts/）と Skill ルートを解決
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BRIDGE_PY="$SCRIPT_DIR/repo_map_local_bridge.py"
EXAMPLE_HTML="$SKILL_DIR/examples/repo-map.html"
EXAMPLE_DSL="$SKILL_DIR/examples/repo-map.dsl"

# --- Python を探す ---
PYTHON=""
if command -v python3 >/dev/null 2>&1; then
  PYTHON="$(command -v python3)"
elif command -v python >/dev/null 2>&1; then
  PYTHON="$(command -v python)"
else
  echo "エラー: python3 も python も見つかりません。Python 3 をインストールしてください。" >&2
  echo "（Homebrew 例: brew install python）" >&2
  exit 1
fi
echo "[launcher] python: $PYTHON"

# --- claude を確認（任意） ---
if command -v claude >/dev/null 2>&1; then
  echo "[launcher] claude: $(command -v claude)"
else
  echo "[launcher] 警告: claude が見つかりません。Ask は使えませんが、Copy prompt 方式は使えます。" >&2
fi

# --- 入力の解決（位置引数 > 環境変数 > 同梱デモ） ---
HTML="${1:-${REPO_MAP_HTML:-$EXAMPLE_HTML}}"
REPO_ROOT="${2:-${REPO_MAP_REPO_ROOT:-$SKILL_DIR}}"
DSL="${3:-${REPO_MAP_DSL:-}}"
PORT="${4:-${REPO_MAP_PORT:-17333}}"

# デモ（HTML 未指定）のときは DSL も同梱 example に寄せる
if [ "$HTML" = "$EXAMPLE_HTML" ] && [ -z "$DSL" ] && [ -f "$EXAMPLE_DSL" ]; then
  DSL="$EXAMPLE_DSL"
fi

if [ ! -f "$BRIDGE_PY" ]; then
  echo "エラー: ブリッジ本体が見つかりません: $BRIDGE_PY" >&2
  exit 1
fi
if [ ! -f "$HTML" ]; then
  echo "エラー: 配信する HTML が見つかりません: $HTML" >&2
  exit 1
fi

echo "[launcher] html:      $HTML"
echo "[launcher] repo-root: $REPO_ROOT"
echo "[launcher] dsl:       ${DSL:-(なし)}"
echo "[launcher] port:      $PORT"

# --- ブリッジ起動引数 ---
ARGS=(--repo-root "$REPO_ROOT" --html "$HTML" --port "$PORT")
if [ -n "$DSL" ]; then
  ARGS+=(--dsl "$DSL")
fi

# --- ブリッジをバックグラウンドで起動し、Ctrl+C で確実に止める ---
"$PYTHON" "$BRIDGE_PY" "${ARGS[@]}" &
BRIDGE_PID=$!
trap 'echo; echo "[launcher] stopping…"; kill "$BRIDGE_PID" 2>/dev/null || true; wait "$BRIDGE_PID" 2>/dev/null || true; exit 0' INT TERM

# サーバが立ち上がるのを少し待ってからブラウザを開く
URL="http://127.0.0.1:$PORT/repo-map.html"
sleep 1
if command -v open >/dev/null 2>&1; then
  open "$URL" || true
else
  echo "[launcher] ブラウザを自動で開けません。次の URL を開いてください: $URL"
fi
echo "[launcher] 開きました: $URL  （停止は Ctrl+C）"

# ブリッジが終わるまで待つ（Ctrl+C で trap が止める）
wait "$BRIDGE_PID"

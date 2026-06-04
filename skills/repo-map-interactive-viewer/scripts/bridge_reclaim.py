"""repo-map ローカルブリッジ — 起動時ポート確保（reclaim）とシグナル設定。

起動時、同じポートに前回のブリッジが残っていることがある（ターミナルを Ctrl+C せず
に閉じた等で孤児化したケース）。その「自分のブリッジ」だけを検出して停止し、ポートを
空けてから bind する。安全方針: 止めるのは health で本人確認できた repo-map ブリッジ
に限る。ポートを握っている『別アプリ』は決して kill しない（中止して別ポートを促す）。
詳細は references/bridge-session-and-reclaim.md / references/security.md が正本。
"""

from __future__ import annotations

import http.client
import json
import os
import signal
import sys
import time

from bridge_config import SERVICE_ID


# --- ポート確保（同ポートに残った自分のブリッジを掃除する） -------------------

def _probe_health(port: int, timeout: float = 0.6) -> dict | None:
    """127.0.0.1:<port>/api/health を叩いて応答を返す。

    戻り値:
      * None — 誰も応答しない（接続拒否・タイムアウト等 ＝ ポートは空き）。
      * {"server": <Server ヘッダ>, "data": <JSON dict|None>, "status": int} — 何か応答した。
    自分のブリッジか別アプリかの判定は呼び出し側（reclaim_port）が行う。
    """
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=timeout)
    try:
        conn.request("GET", "/api/health", headers={"Host": "127.0.0.1"})
        resp = conn.getresponse()
        raw = resp.read()
        try:
            data = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            data = None
        return {"server": resp.getheader("Server", "") or "", "data": data, "status": resp.status}
    except (OSError, http.client.HTTPException):
        return None
    finally:
        try:
            conn.close()
        except OSError:
            pass


def _is_our_bridge(probe: dict) -> bool:
    """health 応答が repo-map ローカルブリッジ自身のものか判定する。

    Server ヘッダ（全バージョンで `repo-map-local-bridge/...`）か、health JSON の service
    フィールド（本バージョン以降）のどちらかで本人確認する。どちらも満たさない応答
    （別アプリ）は「自分のものではない」とみなし、絶対に止めない。
    """
    if (probe.get("server") or "").startswith(SERVICE_ID):
        return True
    data = probe.get("data")
    return isinstance(data, dict) and data.get("service") == SERVICE_ID


def _bridge_pid(probe: dict):
    """health 応答からブリッジの PID を取り出す（取れなければ None）。"""
    data = probe.get("data")
    if isinstance(data, dict):
        pid = data.get("pid")
        if isinstance(pid, int) and pid > 0:
            return pid
    return None


def _pid_alive(pid: int) -> bool:
    """pid のプロセスが存在するか（シグナル 0 で確認）。"""
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True   # 存在はする（権限が無いだけ）
    return True


def _wait_until_free(pid: int, port: int, timeout: float, interval: float = 0.1) -> bool:
    """pid が消え、かつポートが解放される（health が応答しなくなる）まで待つ。"""
    deadline = time.monotonic() + timeout
    while True:
        if not _pid_alive(pid) and _probe_health(port, timeout=0.3) is None:
            return True
        if time.monotonic() >= deadline:
            return False
        time.sleep(interval)


def _terminate_bridge(pid: int, port: int, *, term_wait: float = 5.0, kill_wait: float = 2.0) -> bool:
    """古いブリッジ pid を SIGTERM →（効かなければ）SIGKILL で停止し、ポート解放を待つ。"""
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return True   # もういない
    except PermissionError:
        sys.stderr.write(f"[bridge] pid={pid} を停止する権限がありません。手動で停止してください。\n")
        return False

    if _wait_until_free(pid, port, term_wait):
        sys.stderr.write("[bridge] 古いブリッジを停止しました。\n")
        return True

    sys.stderr.write(f"[bridge] SIGTERM で止まらないため pid={pid} を強制停止します…\n")
    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        return True
    except PermissionError:
        sys.stderr.write(f"[bridge] pid={pid} を強制停止する権限がありません。手動で停止してください。\n")
        return False

    if _wait_until_free(pid, port, kill_wait):
        sys.stderr.write("[bridge] 古いブリッジを強制停止しました。\n")
        return True

    sys.stderr.write(
        f"[bridge] pid={pid} を停止できませんでした。手動で確認してください"
        f"（pkill -f repo_map_local_bridge）。\n"
    )
    return False


def reclaim_port(port: int, *, enabled: bool = True) -> bool:
    """起動前に、同ポートに残った『自分のブリッジ』を検出して停止する。

    返り値が True なら bind を進めてよい。False なら掃除すべきでない／できないので、
    呼び出し側は起動を中止する（別アプリが使用中、または PID 不明で安全に止められない）。
    """
    if not enabled:
        return True

    probe = _probe_health(port)
    if probe is None:
        return True   # 誰も応答しない ＝ ポートは空いている見込み。bind を試す。

    if not _is_our_bridge(probe):
        sys.stderr.write(
            f"[bridge] ポート {port} は別のプロセスが使用中です"
            f"（repo-map ブリッジではないため掃除しません）。\n"
            f"[bridge] --port で別ポートを指定するか、その別プロセスを確認してください。\n"
        )
        return False

    pid = _bridge_pid(probe)
    if pid is None:
        sys.stderr.write(
            f"[bridge] ポート {port} に古い repo-map ブリッジが残っていますが PID を取得できません。\n"
            f"[bridge] 手動で停止してください: pkill -f repo_map_local_bridge\n"
        )
        return False

    if pid == os.getpid():
        return True   # 自分自身（理屈上は来ないが保険）

    sys.stderr.write(f"[bridge] ポート {port} に残った古いブリッジ (pid={pid}) を停止します…\n")
    return _terminate_bridge(pid, port)


def install_shutdown_signals() -> None:
    """SIGTERM を穏当な停止に変える（reclaim や .command の kill で finally を通すため）。

    serve_forever の KeyboardInterrupt 経路に合流させ、server_close を確実に走らせる。
    これにより、後続インスタンスが本プロセスを reclaim する際もクリーンに終了する。
    メインスレッド以外では signal を設定できないので、その場合は黙って諦める。
    """
    def _handler(signum, frame):
        raise KeyboardInterrupt

    try:
        signal.signal(signal.SIGTERM, _handler)
    except (ValueError, OSError):
        pass   # 非メインスレッド等。設定できなくても致命的ではない。

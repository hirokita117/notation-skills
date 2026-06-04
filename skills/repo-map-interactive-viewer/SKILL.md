---
name: repo-map-interactive-viewer
description: >
  `repo-map v1` から生成された HTML Viewer に、ローカル Claude Code 連携・プロンプトコピー・
  Python ブリッジ起動手順を足して「対話できる地図」にする Skill。
  Make a generated repo-map HTML viewer interactive: click a node, then ask local Claude Code
  about it — via a stdlib-only Python localhost bridge, or via prompt-copy fallback.
  描画そのものではなく、生成済み HTML を使った理解補助・対話ビューアを担当する
  （描画は `notation-render`、DSL 生成は `repo-map-notation`）。
  次のような発話で起動する:
  「repo-map HTML をインタラクティブにしたい」「Claude Code と HTML Viewer をローカルでつなぎたい」
  「Python ブリッジを使って Claude Code に質問したい」「生成済み repo-map HTML からコード理解を深めたい」
  「プロンプトコピー方式または localhost bridge 方式で使いたい」「図のノードをクリックして質問したい」
  「ローカルで repo-map を見ながら Claude に聞きたい」。
  完全にローカル用途（外部サーバ・社内 Git にアップロードしない）。Node.js 不使用、Python 標準ライブラリのみ、
  裏側は `claude` CLI。任意コマンド実行はさせない。
---

# repo-map-interactive-viewer — 生成済み HTML から対話で理解を深める

## 役割

`repo-map v1` DSL から `notation-render` が生成した **HTML Viewer** を、ローカルで「クリックして
質問できる地図」にするための Skill。具体的には:

- 生成済み HTML を **127.0.0.1 限定**で配信する小さな **Python ブリッジ** の起動手順を提供する。
- HTML 上でノードをクリック → その意味についてローカルの **Claude Code（`claude` CLI）** に質問する。
- ブリッジを起動できない／`file://` で開いた場合は、**プロンプトコピー方式**にフォールバックする。

この Skill は **描画そのものを担当しない**。描画は [`notation-render`](../notation-render/SKILL.md)、
DSL 生成は [`repo-map-notation`](../repo-map-notation/SKILL.md) の責務。ここは「生成済み HTML を
使った理解補助・対話ビューア」だけを担う。

## 大原則（必ず守る）

- **DSL が正本。** HTML / SVG はその派生物。Viewer 上の対話は理解を助けるだけで、**DSL 正本を
  書き換えない**。
- **HTML Viewer は理解補助 UI。** 図に描かれていない意味を、Viewer や Claude の回答で**勝手に
  補完して正本化しない**。
- **Python ブリッジはローカル補助プロセス。** 外部サーバではない。127.0.0.1 のみ。社内 Git や
  外部サービスへ何もアップロードしない。
- **深掘りは DSL に戻す。** 「この部分をもっと詳しく」は、Viewer で図を描き足すのではなく、
  [`repo-map-notation`](../repo-map-notation/SKILL.md) に戻って **スコープを絞った新しい DSL** を
  作り、[`notation-render`](../notation-render/SKILL.md) で描き直す。
- **Claude Code との対話は読み取り専用の理解補助。** ブリッジは安全寄りのフラグ
  （`--permission-mode plan` ＋ 限定ツール）で `claude` を呼び、ファイル編集・生成・削除はさせない。

## 2 つの使い方

| 方式 | いつ使う | 仕組み |
|------|----------|--------|
| **localhost bridge** | ローカルで `claude` が使え、HTML から直接質問したい | Python ブリッジが HTML を `http://127.0.0.1:<port>/repo-map.html` で配信。Ask ボタン → `/api/ask` に POST → `claude -p` を呼んで回答を返す。**質問は同じ会話として継続**（サーバ生成 UUID を持ち回り、`claude` は毎回起動・即終了で常駐しない）。「新しい会話」＝ `/api/reset`、`--no-session-continuity` で無効化。**ブリッジを停止**ボタン＝ `/api/shutdown`（`--no-remote-shutdown` で無効化）。 |
| **prompt copy** | ブリッジを使わない／`file://` で開いた／別マシン | HTML がノード情報＋質問から **プロンプトを生成**。Copy ボタンでクリップボード（不可なら textarea 表示）。それを手元の Claude Code に貼る。 |

どちらの方式でも **同じプロンプト**が得られる（ブリッジ側 `build_prompt` と HTML 側 `buildPrompt`
は同じ体裁）。

## クイックスタート

前提: [`repo-map-notation`](../repo-map-notation/SKILL.md) で DSL を作り、
[`notation-render`](../notation-render/SKILL.md) で **インタラクティブ HTML**（`data-*` 属性＋質問
パネル付き）を生成済みであること。契約は [references/html-viewer-contract.md](references/html-viewer-contract.md)。

1. **ブリッジを起動**（macOS はダブルクリックでも可）:

   ```
   # 直接
   python3 skills/repo-map-interactive-viewer/scripts/repo_map_local_bridge.py \
     --repo-root /path/to/your/repo \
     --html /path/to/generated/repo-map.html \
     --dsl  /path/to/your/repo/repo-map.dsl \
     --port 17333

   # または同梱の起動スクリプト（未指定なら同梱 example のデモ）
   skills/repo-map-interactive-viewer/scripts/open_repo_map_viewer.command \
     /path/to/generated/repo-map.html /path/to/your/repo
   ```

2. ブラウザで `http://127.0.0.1:17333/repo-map.html` を開く（`.command` は自動で開く）。
3. ノードをクリック → 質問を入力 → **Ask Claude Code**（ブリッジ）または **Copy prompt**（コピー方式）。
4. 続けて質問すると**同じ会話として継続**する（別ノードをクリックしても継続）。話題を切り替えたいときは
   **新しい会話**ボタン（`/api/reset`）でリセット。
5. 停止は **Ctrl+C**、または HTML の **ブリッジを停止**ボタン（`/api/shutdown`）。ボタン停止後はタブの
   自動クローズを best-effort で試み、閉じられない環境では停止オーバーレイを表示する。無効化は `--no-remote-shutdown`。

`file://` で HTML を直接開いた場合は Ask は使えないが、**Copy prompt 方式は動く**
（その場合の継続は、貼り付け先のあなた自身の Claude セッションで成立する）。

> Ctrl+C せずにターミナルを閉じてブリッジが孤児化しても、**次回同じポートで起動すると
> 古い自分のブリッジを自動で検出・停止してから立ち上がる**（本人確認できた自分のブリッジ
> だけが対象。別アプリは止めない）。無効化は `--no-reclaim`。詳細は
> [references/bridge-session-and-reclaim.md](references/bridge-session-and-reclaim.md) の「起動時のポート確保」。

## reference 地図

| ファイル | 中身 | いつ読む |
|----------|------|----------|
| [references/html-viewer-contract.md](references/html-viewer-contract.md) | **契約の正本**: `data-*` スキーマ／`/api/ask` JSON 形／フォールバック挙動 | HTML と ブリッジの取り決めを確認するとき |
| [references/local-bridge.md](references/local-bridge.md) | ブリッジの起動引数・起動例・エンドポイント一覧 | ブリッジを起動・運用するとき |
| [references/bridge-claude-invocation.md](references/bridge-claude-invocation.md) | プロンプト整形（`build_prompt`）と claude argv 組み立て（`build_claude_argv`） | プロンプト体裁や claude フラグ・model/effort を調整するとき |
| [references/bridge-session-and-reclaim.md](references/bridge-session-and-reclaim.md) | 会話継続（`--session-id`/`--resume`）と起動時ポート確保（reclaim） | 会話継続や起動時のポート挙動を理解・調整するとき |
| [references/security.md](references/security.md) | ローカル限定・任意コマンド禁止・repo-root ジェイル等の安全方針 | 安全性を確認するとき |

## scripts

| ファイル | 役割 |
|----------|------|
| [scripts/repo_map_local_bridge.py](scripts/repo_map_local_bridge.py) | 標準ライブラリのみの localhost ブリッジ本体 |
| [scripts/open_repo_map_viewer.command](scripts/open_repo_map_viewer.command) | macOS 用ワンクリック起動（python 探索 → ブリッジ起動 → ブラウザ起動） |

## 禁止事項

- ❌ **描画をここでやらない。** インタラクティブ HTML の生成は `notation-render`。ここは生成済み
  HTML を配信・対話に使うだけ。
- ❌ **DSL 正本を書き換える対話にしない。** 回答はあくまで理解補助。構造を変えたいなら DSL を作り直す。
- ❌ **任意コマンド実行を公開しない。** HTML から渡せるのは固定の質問フィールドのみ。`claude` の
  argv はブリッジ側が固定フラグで組み立てる。`--dangerously-skip-permissions` は使わない。
- ❌ **外部公開しない。** bind は 127.0.0.1 のみ。社内 Git・外部サーバにアップロードしない。

## 関連スキル

- [`notation-render`](../notation-render/SKILL.md) — インタラクティブ HTML（`data-*`＋質問パネル）の生成元。
- [`repo-map-notation`](../repo-map-notation/SKILL.md) — DSL 正本の供給元。深掘りはここへ戻す。
- [`notation-core`](../notation-core/SKILL.md) — 「DSL が正本」「描画は派生物」という原則の出どころ。
- 連携全体は [SKILLS_MAP.md](../../SKILLS_MAP.md)。

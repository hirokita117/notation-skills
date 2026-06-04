# Acknowledgements

- Inspired by: https://note.com/art_reflection/n/nccfe6cc57073

このリポジトリは上記記事から着想を得ていますが、本リポジトリの DSL 仕様・文法・検証規則・レンダリング規約・文章はすべて hirokita117 が独自に書き起こしたものであり、記事に付属する Skill ZIP や export の再配布ではありません。

---

# notation-skills

巨大なリポジトリを、**固定ルールの DSL（中間記法）を正本**にして地図化し、認知負荷を下げるための Agent Skills 集です。

「どう描くか（描画コーディング規約）」を Skill に詰め込むのではなく、

- **決まった記法 = DSL を生成する Skill**（`repo-map-notation`）
- **その DSL だけを読んで描画する Skill**（`notation-render`）

に役割を分けます。図そのものではなく、**意味層（DSL）を唯一の正本**として扱う設計です。SVG / HTML はそこからの派生物にすぎません。

---

## なぜ DSL を正本にするのか

巨大リポジトリの全体像は、ファイルを直接眺めても頭に入りません。かといって、毎回 AI に自由作図させると、生成のたびに図がブレて差分を追えず、結局「読めない絵」が増えます。

そこで本リポジトリは次の立場をとります。

1. リポジトリ構造は、人間にも AI にも読み書きできる**短いテキスト DSL（`repo-map v1`）**に落とす。
2. その DSL を**正本（source of truth）**とし、図は DSL から**決定的に**生成する（同じ DSL なら毎回同じ図）。
3. 「意味（何があり、何に依存するか）」と「レイアウト（どこに置くか）」を**別レイヤー**に分け、混ぜない。

結果として、構造の編集・差分レビュー・再描画がすべてテキスト上で完結し、認知負荷が下がります。

---

## 4 つの Skill と使い分け

| # | Skill | 役割 | 入力 → 出力 |
|---|-------|------|------------|
| 1 | [`notation-core`](skills/notation-core/SKILL.md) | 記法中心設計（Notation-first design / MNP）の共通土台・用語・原則 | 設計判断 → 原則 |
| 2 | [`repo-map-notation`](skills/repo-map-notation/SKILL.md) | リポジトリ構造を `repo-map v1` DSL に落とす（**DSL 生成のみ**） | リポジトリ → DSL テキスト |
| 3 | [`notation-render`](skills/notation-render/SKILL.md) | DSL **だけ**を読んで図に変換（**決定的レンダリング**） | DSL テキスト → SVG / HTML |
| ＋ | [`repo-map-interactive-viewer`](skills/repo-map-interactive-viewer/SKILL.md) | 生成済みインタラクティブ HTML をローカル Claude Code とつなぐ対話ビューア（**描画はしない**） | HTML ＋ クリック → ローカル Claude の回答 |

- `repo-map-notation` は **DSL しか出しません**。Mermaid / Figma / SVG を直接は描きません。
- `notation-render` は **DSL しか受け取りません**。自然言語の要望や口頭のレイアウトから直接 SVG を描くことはしません（不足があれば `repo-map-notation` に戻します）。HTML は既定で `data-*`＋質問パネル付きの**インタラクティブ Viewer** を出します。
- `repo-map-interactive-viewer` は**アドオン**です。生成済み HTML を `127.0.0.1` 限定の Python ブリッジで配信し、ノードをクリックしてローカル Claude Code に質問できるようにします（**完全ローカル・Node.js 不要・Python 標準ライブラリのみ**）。対話は読み取り専用で DSL 正本を変えません。
- `notation-core` は、初めて触るときと、設計判断に迷ったときに読む土台です。毎回読む必要はありません。

詳しい連携は [SKILLS_MAP.md](SKILLS_MAP.md) を参照してください。

---

## インストール

導入方法は大きく **2 つ** あります。**基本は方法 A（plugin）で十分**です。「素のファイルとして `~/.claude/skills/` に置きたい」など特別な理由があるときだけ方法 B を選びます。

### 方法 A: Plugin として導入（推奨）

このリポジトリは Claude Code の **plugin marketplace** として公開しています。次の 2 コマンドを **一度だけ** 実行すれば導入完了です。

```
/plugin marketplace add hirokita117/notation-skills
/plugin install notation-skills@notation-skills
```

導入後、4 つの Skill は名前空間付きで使えます（例: `notation-skills:repo-map-notation`）。

- 更新を取り込む: `/plugin marketplace update`
- セッションに反映: `/reload-plugins`

#### どのリポジトリで使える？ — scope の考え方

`install` には **scope**（有効範囲）があり、**既定は `user`**＝**あなたの全プロジェクトで使える**状態になります。リポジトリごとに入れ直す必要はありません。範囲を変えたいときだけ `--scope` を付けます。

| scope | 効く範囲 | 記録先 | 使いどころ |
|---|---|---|---|
| `user`（既定） | 自分の全プロジェクト | `~/.claude/settings.json` | 自分用に常に使いたい |
| `project` | そのリポジトリ（**チーム共有**） | `<repo>/.claude/settings.json`（git にコミット） | チーム全員に配りたい |
| `local` | そのリポジトリ（自分だけ） | `<repo>/.claude/settings.local.json`（git 管理外） | 試用・個人検証 |

```
# 例: 特定リポジトリのチーム全員に配る
/plugin install notation-skills@notation-skills --scope project
```

> 補足: 「ユーザー全体で使いたい」だけなら、既定の `user` scope で入れるこの方法 A がそのまま答えです。実体はプラグインキャッシュ（`~/.claude/plugins/...`）に置かれ、`marketplace update` で更新追従できます。`~/.claude/skills/` には物理的にコピーされませんが、全プロジェクトで使える点は同じです。

> 公開範囲について: このリポジトリは public ですが、plugin 化は中央レジストリへの登録ではありません。`/plugin marketplace add hirokita117/notation-skills` はこの GitHub リポジトリをクローンするだけで、検索カタログに自動掲載されることはありません。導入の手軽さが上がるだけで、到達範囲は通常の public リポジトリと同じです。

### 方法 B: `skills/` を手動コピー

plugin を使わず、**素の Skill ファイルとして直接置きたい**場合（plugin 非対応ツールで読みたい等）はこちら。clone して `skills/` 配下をコピーします。

```
git clone https://github.com/hirokita117/notation-skills.git

# 個人用（全プロジェクト共通）
cp -r notation-skills/skills/* ~/.claude/skills/

# または プロジェクト用（チーム共有・git にコミット）
cp -r notation-skills/skills/* <対象リポジトリ>/.claude/skills/
```

呼び出し名は名前空間なしの素の名前（`notation-core` など）になります。ただし **自動更新はされない** ため、更新時は再コピーが必要です。

### A と B の比較

| | 方法 A（plugin・推奨） | 方法 B（手動コピー） |
|---|---|---|
| 導入 | 2 コマンド | clone + cp |
| 全プロジェクトで有効 | ✅（既定の `user` scope） | ✅（`~/.claude/skills/` の場合） |
| チームに配る | ✅（`--scope project`） | ✅（repo の `.claude/skills/`） |
| 更新追従 | ✅ `marketplace update` | ❌ 手動で再コピー |
| 呼び出し名 | `notation-skills:xxx` | `xxx`（素の名前） |

---

## メンテナンス（Skill を追加・修正したくなったら）

変更は**すべて配布元であるこのリポジトリ側**で行います。インストールした利用者は、導入先のディレクトリ構成を意識する必要はありません。

| やりたいこと | 操作 |
|---|---|
| Skill の中身を修正 | `skills/<name>/SKILL.md` や `references/` を編集 |
| Skill を追加 | `skills/<new-skill>/SKILL.md` を作成（`skills/` は自動スキャンされるためマニフェスト編集は不要） |
| 利用者へ反映 | `.claude-plugin/plugin.json` と `.claude-plugin/marketplace.json` の `version` を上げて push |

`version` を明示しているため、利用者は **バージョンが上がったときだけ** 更新を受け取ります（意図しないタイミングで中身が変わりません）。

利用者側の更新は次の操作だけです:

```
/plugin marketplace update
/plugin install notation-skills@notation-skills   # または /plugin の UI で update
/reload-plugins
```

---

## ローカルで試す（開発中の動作確認・メンテナ向け）

Skill を編集して **push する前に手元で動作確認したい** ときは、`--plugin-dir` で起動するのが最も小回りが効きます。marketplace への登録・install（＝プラグインキャッシュへのコピー）を経由せず、**このリポジトリのファイルを直接読み込む**ため、`SKILL.md` を編集した結果をそのまま試せます（main へのマージや公開は不要）。

```
claude --plugin-dir /path/to/notation-skills
```

### これはどこで打つコマンド？

`claude --plugin-dir ...` は **ターミナル（シェル）で Claude Code を「起動する」ときに打つコマンド**です。起動済みのセッション内で打つスラッシュコマンド（`/plugin ...`）ではありません。`--plugin-dir` は起動時フラグで、「このディレクトリをプラグインとして読み込め」という指定です。

ポイントは **2 つのディレクトリが別物** だということ。

| | 役割 | 決まり方 |
|---|---|---|
| 起動した場所（CWD） | Claude が**作業対象**にするプロジェクト | `cd` でどこに居るか |
| `--plugin-dir` のパス | **読み込むプラグイン本体**（＝この notation-skills） | フラグに渡す絶対パス |

「どこで打つか」で挙動が変わります。

**A. このリポジトリ自身を対象に試す**（例: notation-skills 自体の repo-map を作って確認）

```
cd /path/to/notation-skills
claude --plugin-dir .          # CWD もプラグインもこのリポジトリ。相対パス . でOK
```

**B. 別のプロジェクトに対して試す**（通常はこちら）

```
cd /path/to/対象プロジェクト                 # 地図化したいリポジトリへ移動
claude --plugin-dir /path/to/notation-skills  # Skill はこのリポジトリから読み込む（絶対パス）
```

→ 「対象プロジェクトの中で `claude` を起動しつつ、Skill だけ別の場所から読み込む」形です。絶対パスで指定すれば、どのディレクトリから起動しても同じプラグインを指せます。

起動後は名前空間付き（`notation-skills:repo-map-notation` など）で使え、`/plugin` を開けば読み込み状態を確認できます。

> 編集 → 反映: `SKILL.md` の文面はセッションに反映されますが、確実に反映したいときや `SKILL.md` 以外（hooks 等）を変えたときは `/reload-plugins` を実行するか、`claude` を起動し直してください。

> 開発ループ: 普段は `--plugin-dir` で確認 → 問題なければ上の「メンテナンス」の手順で `version` を上げて push、が小回りの効く流れです。

---

## クイックスタート

Skill 対応のエージェント（Claude Code など）にこれらを読み込ませた状態で、**2 段**で依頼します。

**1 段目 — 構造を DSL にする:**

```
このリポジトリを repo-map DSL（repo-map v1）で表してください。
まず depth 1、root はリポジトリ直下で。
```

→ `repo-map-notation` が起動し、`# repo-map v1` で始まる完全な DSL テキストを返します。

**2 段目 — DSL を図にする:**

```
さっき出力された repo-map DSL を SVG にしてください。
```

→ `notation-render` が起動し、その DSL **だけ**を入力に決定的な SVG（必要なら HTML プレビュー）を返します。

一部だけ深掘りしたいときは「`services/auth` を depth 2 で詳しく」のように 1 段目をやり直し、スコープを絞った新しい DSL を得てから再度描画します。

---

## インタラクティブ Viewer の使い方（ローカルで Claude Code に質問）

生成した repo-map HTML を Chrome で開き、**ノードをクリックして、その箇所をローカルの Claude Code に質問**できます。完全にローカル用途で、外部サーバや社内 Git にはアップロードしません。**Node.js は不要**、Python は標準ライブラリのみ、裏側は `claude` CLI です。

**2 つの方式があります。**

| 方式 | 前提 | 動き |
|------|------|------|
| localhost bridge | ローカルで `claude` が使える | Python ブリッジが HTML を `http://127.0.0.1:17333/repo-map.html` で配信。`Ask Claude Code` → ローカル Claude が回答。 |
| prompt copy | ブリッジを使わない／`file://` で開いた | `Copy prompt for Claude Code` でプロンプトを生成・コピー（不可なら textarea 表示）し、手元の Claude Code に貼る。 |

**手順（bridge 方式）:**

```
# 1) repo-map-notation → notation-render でインタラクティブ HTML を生成しておく
# 2) ブリッジを起動（macOS は .command をダブルクリックでも可）
python3 skills/repo-map-interactive-viewer/scripts/repo_map_local_bridge.py \
  --repo-root /path/to/your/repo \
  --html      /path/to/generated/repo-map.html \
  --port      17333
# 3) http://127.0.0.1:17333/repo-map.html を開き、ノードをクリック → 質問 → Ask
# 4) 停止は Ctrl+C
```

`file://` で HTML を直接開いた場合でも、**Copy prompt 方式は使えます**。詳細・契約・安全方針は
[`repo-map-interactive-viewer`](skills/repo-map-interactive-viewer/SKILL.md) を参照してください。

---

## ディレクトリ構成

```
notation-skills/
├── README.md
├── LICENSE                         # MIT
├── SKILLS_MAP.md                   # Skill の連携と「正本」の所在
├── .claude-plugin/
│   ├── plugin.json                 # プラグイン本体のマニフェスト
│   └── marketplace.json            # このリポジトリを marketplace 化
└── skills/
    ├── notation-core/              # 共通土台（思想・用語・原則）
    ├── repo-map-notation/          # DSL 生成（repo-map v1 の正式文法はここが正本）
    ├── notation-render/            # DSL → 図（決定的レンダリング）
    └── repo-map-interactive-viewer/ # 生成済み HTML をローカル Claude Code とつなぐ対話ビューア
```

各 Skill は `SKILL.md`（本体）＋ `references/`（詳細）のプログレッシブ・ディスクロージャ構成です。

---

## License

[MIT](LICENSE) © 2026 hirokita117

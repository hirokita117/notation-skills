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

## 3 つの Skill と使い分け

| # | Skill | 役割 | 入力 → 出力 |
|---|-------|------|------------|
| 1 | [`notation-core`](skills/notation-core/SKILL.md) | 記法中心設計（Notation-first design / MNP）の共通土台・用語・原則 | 設計判断 → 原則 |
| 2 | [`repo-map-notation`](skills/repo-map-notation/SKILL.md) | リポジトリ構造を `repo-map v1` DSL に落とす（**DSL 生成のみ**） | リポジトリ → DSL テキスト |
| 3 | [`notation-render`](skills/notation-render/SKILL.md) | DSL **だけ**を読んで図に変換（**決定的レンダリング**） | DSL テキスト → SVG / HTML |

- `repo-map-notation` は **DSL しか出しません**。Mermaid / Figma / SVG を直接は描きません。
- `notation-render` は **DSL しか受け取りません**。自然言語の要望や口頭のレイアウトから直接 SVG を描くことはしません（不足があれば `repo-map-notation` に戻します）。
- `notation-core` は、初めて触るときと、設計判断に迷ったときに読む土台です。毎回読む必要はありません。

詳しい連携は [SKILLS_MAP.md](SKILLS_MAP.md) を参照してください。

---

## インストール

### 推奨: Plugin として導入（Claude Code）

このリポジトリは Claude Code の **plugin marketplace** として公開しています。2 コマンドで導入できます。

```
/plugin marketplace add hirokita117/notation-skills
/plugin install notation-skills@notation-skills
```

導入後、3 つの Skill は名前空間付きで利用できます（例: `notation-skills:repo-map-notation`）。

- 更新を取り込む: `/plugin marketplace update`
- セッションに反映: `/reload-plugins`

> 公開範囲について: このリポジトリは public ですが、plugin 化は中央レジストリへの登録ではありません。`/plugin marketplace add hirokita117/notation-skills` はこの GitHub リポジトリをクローンするだけで、検索カタログに自動掲載されることはありません。導入の手軽さが上がるだけで、到達範囲は通常の public リポジトリと同じです。

### 代替: 手動コピー

plugin 非対応の環境では、`skills/` 配下を直接配置しても使えます。

- 個人用（全プロジェクト共通）: `~/.claude/skills/` にコピー
- プロジェクト用（チーム共有）: 対象リポジトリの `.claude/skills/` にコピー

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

## ディレクトリ構成

```
notation-skills/
├── README.md
├── LICENSE                         # MIT
├── SKILLS_MAP.md                   # 3 Skill の連携と「正本」の所在
├── .claude-plugin/
│   ├── plugin.json                 # プラグイン本体のマニフェスト
│   └── marketplace.json            # このリポジトリを marketplace 化
└── skills/
    ├── notation-core/              # 共通土台（思想・用語・原則）
    ├── repo-map-notation/          # DSL 生成（repo-map v1 の正式文法はここが正本）
    └── notation-render/            # DSL → 図（決定的レンダリング）
```

各 Skill は `SKILL.md`（本体）＋ `references/`（詳細）のプログレッシブ・ディスクロージャ構成です。

---

## Acknowledgements

- Inspired by: https://note.com/art_reflection/n/nccfe6cc57073

This repository is **original work by hirokita117**, not a redistribution of the article's skill ZIP. 上記記事から着想を得ていますが、本リポジトリの DSL 仕様・文法・検証規則・レンダリング規約・文章はすべて hirokita117 が独自に書き起こしたものであり、記事に付属する Skill ZIP や export の再配布ではありません。

---

## License

[MIT](LICENSE) © 2026 hirokita117

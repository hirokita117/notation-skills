---
name: repo-map-notation
description: >
  巨大なリポジトリの構造を、固定ルールの DSL `repo-map v1` テキストに落とす Skill。
  Turn a (possibly huge) repository into a fixed-grammar `repo-map v1` DSL — generation only, no drawing.
  ディレクトリ・パッケージ境界・代表的な依存関係を読み取り、認知負荷を下げる「地図の素」を
  意味層（ノード・エッジ）とレイアウト層に分けて出力する。スコープ（root）と深度（0/1/2）で
  大きさを制御し、まず粗く、必要に応じて範囲を絞って深掘りする。
  次のような発話で起動する:
  「このリポジトリを図解して」「アーキテクチャ地図を作って」「依存関係を DSL にして」
  「モノレポの構造を可視化したい」「コードベースの全体像が欲しい」「repo-map を作って」
  「構造をテキストで持ちたい」「どのパッケージが何に依存しているか地図にして」
  「オンボーディング用の構造図を」「認知負荷を下げる地図がほしい」「この範囲を深掘りした地図に」。
  出力は必ず `repo-map v1` テキスト。
  禁止: DSL を出さずに Mermaid / Figma など図を直接生成しないこと（描画は `notation-render` の役割）。
  リポジトリの全ファイルを列挙して DSL に埋め込まないこと（package / module 粒度に抽象化する）。
---

# repo-map-notation — リポジトリ → `repo-map v1` DSL

## 目的とスコープ

この Skill の仕事は**ただ 1 つ**——リポジトリ構造を `repo-map v1` という固定文法の **DSL テキストに変換すること**。HTML の座標規約は扱わない（それは [notation-render](../notation-render/SKILL.md)）。図そのものも描かない。**出力は常に `# repo-map v1` で始まるテキスト**である。

設計の土台（なぜ DSL を正本にするか、意味とレイアウトを分けるか）は [notation-core](../notation-core/SKILL.md) を参照。`repo-map v1` の**正式文法・検証コードは [references/grammar.md](references/grammar.md) が正本**。

## やってはいけないこと

- ❌ DSL を出さずに、Mermaid / Figma など**図を直接生成しない**。図が欲しいと言われても、まず DSL を出し、描画は `notation-render` に渡す。
- ❌ リポジトリの**全ファイルを列挙**して DSL に詰め込まない。地図は網羅ではなく圧縮。package / module 粒度に抽象化する。
- ❌ 上限（ノード ≤ 40・エッジ ≤ 80・有意行 ≤ 200）を超えたまま提出しない。超えたら深度を上げ、範囲を絞る。

## 深度の選び方（判断入口）

`depth` は地図の粒度。大きいリポジトリほど**まず粗く**。

| depth | 粒度 | 主なノード種別 | こんなとき |
|-------|------|----------------|-----------|
| 0 | システム全体 | system / external / datastore | 最初の俯瞰。サブシステムが数個見えれば十分 |
| 1 | パッケージ / トップ階層 | package（＋ external / datastore） | モノレポの構成、主要コンポーネントと依存 |
| 2 | 主要ファイル群 | module / file-group | **範囲を絞った**1 パッケージ内部の深掘り |

迷ったら depth 1 から。深掘りは「全体を depth 2 にする」のではなく「**範囲を狭めて** depth 2 にする」。詳しくは [references/scope-and-depth.md](references/scope-and-depth.md)。

## 手順

### STEP 0 — スコープ合意（実装前に必ず）

DSL を書き始める前に、次を**ユーザーと合意**する。ここを飛ばすと、大きすぎる・的外れな地図になる。

- **root**: どこを起点にするか（例: `.` か `apps/web`）。
- **depth**: どの粒度まで（0 / 1 / 2）。
- **除外**: `node_modules`, `dist`, `build`, 生成物, ベンダ等。
- **読者と成功条件**: 誰のための地図か（自分 / チーム / オンボーディング）、そして**「何が分かれば成功か」**（例: 「どのサービスが DB を読むかが一目で分かる」）。

### STEP 1 — 事実収集

地図の素になる事実を集める。**全ファイル走査は不要**、代表例のサンプリングでよい。

- **ディレクトリ構造**（除外を効かせた上での主要ディレクトリ）。
- **境界の手がかり**: `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, `pom.xml` 等。これらがある単位は、ほぼそのまま package ノードになる。
- **依存の代表例**: 主要モジュールの `import` / `require` を**サンプリング**して、誰が誰を使うかの当たりを付ける（全数調査はしない）。
- ツール: Cursor / Claude Code などに既存の MCP（filesystem, grep 等）があれば**利用してよい**。専用 MCP の自作は不要。MCP が無ければ、ユーザーが貼ったディレクトリ一覧やパスを入力に進める。

### STEP 2 — 抽象化

集めた事実を、読める地図の大きさに畳む。

- **package / module を優先**し、file 単位は避ける（深掘り時の file-group まで）。
- **上限の目安**: ノード ≤ 40、エッジ ≤ 80。超えそうなら、近いノードを 1 つにまとめる（グルーピング）か、深度を下げる。
- external（外部サービス・SaaS）と datastore（DB・キャッシュ・キュー）は、境界として明示的にノード化する。

### STEP 3 — ビュー選択（View Selection）

抽象化したノード・エッジを DSL にする前に、**どの「ビュー」で見せるかを 1 つ決める**。同じ閉じた文法でも、選ぶ `kind`/`relation`・`focus`・`@layout` の使い方で地図は別物になる。ここを飛ばすと、毎回「階層（`contains`）＋ import 依存（`imports`）」の同じ形に無意識に落ち、STEP 0 で決めた「何が分かれば成功か」に答えない地図になる。

- **パターンを 1 つ選ぶ**（または、明示的に理由を述べた上でのハイブリッド）。カタログは [references/view-patterns.md](references/view-patterns.md)。STEP 0 の成功条件から**逆引き**する（例: 「どのサービスが DB を読むか」→ Data Ownership View）。
- **選んだパターンに合わせて選択を写す**: そのパターンの「ノード選択／エッジ選択」に従い、使う `kind` と `relation` の部分集合を絞る。`focus` の当て先と `@layout`（`rank=`/`group=`）の使い方も、そのパターンの戦略に合わせる。
- **「階層＋ import」への無意識な既定化を避ける**。それは Monorepo Workspace View という 1 つの選択肢にすぎない。`owns`/`deploys`/`reads`/`calls` を主役にするビューを意図的に検討する。
- ハイブリッドにする場合は「なぜ 2 つのビューを混ぜるか」を 1 文で根拠づけてから進む。

### STEP 4 — DSL 出力

選んだビューに沿って、完全な `repo-map v1` テキストを出力する。文法は [references/grammar.md](references/grammar.md)。出力前に**自己バリデーション**（下記）を必ず通す。

### STEP 5 — 差分更新

「この部分だけ深掘りして」と言われたら、**全体を作り直さない**。`@meta root` を対象に下げ、`depth` を上げ、その**部分スコープだけの新しい DSL**を全量で出す（原則「全量置換・範囲を絞る」）。

## 自己バリデーション checklist（提出前に必ず）

[references/grammar.md](references/grammar.md) の検証規則の要点。1 つでも引っかかれば直してから出す。

- [ ] 先頭行が `# repo-map v1`。セクションは `@meta` → `@nodes` → `@edges` →（任意）`@layout` の順。
- [ ] `@meta` に `root` / `depth`(0|1|2) / `generated` がある。`focus` を使うならそのノードが存在する。
- [ ] すべてのエッジの両端が `@nodes` に定義済み（未定義参照ゼロ）。`id` の重複なし。自己ループなし。
- [ ] `kind` は { system, package, module, file-group, external, datastore } のみ。`relation` は { contains, imports, calls, deploys, reads, owns } のみ。
- [ ] 複数語ラベルは `"..."` で引用。path はラベル直後の唯一の裸トークン。
- [ ] ノード ≤ 40、エッジ ≤ 80、有意行 ≤ 200。
- [ ] `@layout` には `rank=` / `group=` 以外（意味情報）を入れていない。
- [ ] depth と各ノードの粒度が整合（例: depth 0 に module/file-group を混ぜない）。
- [ ] [view-patterns.md](references/view-patterns.md) のビューを 1 つ（または根拠ありのハイブリッド）選び、ノード／エッジ選択がそのビューに沿っている。「階層＋ import」へ無意識に既定化していない。

## reference 地図

| ファイル | 中身 | いつ読む |
|----------|------|----------|
| [references/grammar.md](references/grammar.md) | `repo-map v1` の正式文法・内部モデル・検証コード（**正本**） | DSL を書く・検証する全ての場面 |
| [references/scope-and-depth.md](references/scope-and-depth.md) | depth 0/1/2 の選び方、リポジトリ類型別ガイド | STEP 0 で粒度に迷ったとき |
| [references/view-patterns.md](references/view-patterns.md) | 固定文法のまま「見せ方」を変える 8 つのビューパターン（intent / 適する場面 / ノード・エッジ選択 / focus・レイアウト戦略 / 避けること） | STEP 3 でどのビューにするか選ぶとき |
| [references/examples.md](references/examples.md) | 架空リポジトリの入力 → 出力 DSL 全文（4 例・各ビュー別） | 出力の形を確認したいとき |

## 関連スキル

- [notation-core](../notation-core/SKILL.md) — なぜこう設計するかの土台（3 層・4 要素・原則）。
- [notation-render](../notation-render/SKILL.md) — ここで出した DSL を図にする次工程（DSL のみ入力）。
- 連携全体は [SKILLS_MAP.md](../../SKILLS_MAP.md)。

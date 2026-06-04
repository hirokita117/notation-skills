---
name: document-map-notation
description: >
  ユーザーが指定したドキュメント（Markdown・テキスト・仕様書・設計書・README・議事録・PRD 等）を読み取り、
  内容の構造・論点・関係を、固定ルールの DSL `document-map v1` テキストに落とす Skill。
  Turn a document (Markdown, spec, design doc, README, meeting notes, PRD) into a fixed-grammar
  `document-map v1` DSL — generation only, no drawing.
  タイトル・主要セクション・重要概念・要件・決定事項・未決事項・リスク・関係者・外部依存と、
  それらの関係を、意味層（ノード・エッジ）とレイアウト層に分けて出力する。深度（0/1/2）で
  大きさを制御し、まず粗く、必要なら対象セクションを絞って深掘りする。全文要約はしない。
  次のような発話で起動する:
  「このドキュメントを図解して」「この仕様書を構造化して」「この Markdown を図にしたい」
  「この PRD の論点マップを作って」「この議事録を関係図にして」「この設計書の構成を可視化して」
  「添付ファイルを document-map DSL にして」「この要件定義の構造を地図にして」「ドキュメントの論点を整理して図に」
  「README の全体像を図解」「会議メモの決定事項と宿題を関係図に」「この章だけ詳しく構造化して」。
  出力は必ず `# document-map v1` で始まるテキスト。
  禁止: DSL を出さずに Mermaid / SVG / HTML など図を直接生成しないこと（描画は `notation-render` の役割）。
  ドキュメントの全行・全項目を網羅して詰め込まないこと（重要なものへ圧縮する）。リポジトリ解析はしないこと
  （それは `repo-map-notation`）。
---

# document-map-notation — ドキュメント → `document-map v1` DSL

## 目的とスコープ

この Skill の仕事は**ただ 1 つ**——指定されたドキュメントを読み、内容の構造・論点・関係を `document-map v1` という固定文法の **DSL テキストに変換すること**。HTML の座標規約は扱わない（それは [notation-render](../notation-render/SKILL.md)）。図そのものも描かない。**出力は常に `# document-map v1` で始まるテキスト**である。

設計の土台（なぜ DSL を正本にするか、意味とレイアウトを分けるか）は [notation-core](../notation-core/SKILL.md) を参照。`document-map v1` の**正式文法・検証コードは [references/grammar.md](references/grammar.md) が正本**。

リポジトリ構造の地図化は責務外（それは [repo-map-notation](../repo-map-notation/SKILL.md)）。ここは**ドキュメントの内容**だけを扱う。

## やってはいけないこと

- ❌ DSL を出さずに、Mermaid / SVG / HTML など**図を直接生成しない**。図が欲しいと言われても、まず DSL を出し、描画は `notation-render` に渡す。
- ❌ **全文要約にしない**。目的は文章の要約ではなく、構造・論点・関係を圧縮した「地図」。
- ❌ **全行・全項目を網羅しない**。読者の認知負荷を下げるために重要なものへ圧縮する。上限（ノード ≤ 40・エッジ ≤ 80・有意行 ≤ 200）を超えたまま提出しない。
- ❌ **巨大な図を作らない**。超えそうなら depth を下げる／対象セクションに絞る。
- ❌ **読めないまま推測で進めない**。ファイルや本文が読み取れなければ、本文かファイルをユーザーに**要求する**。
- ❌ **リポジトリ解析を混ぜない**（それは `repo-map-notation` の責務）。

## 入力

ユーザーが指定したドキュメントファイル、または貼り付けた本文。Markdown・プレーンテキスト・仕様書・設計書・README・議事録・PRD・添付ファイルなどを想定する。

- ファイルパスが与えられたら **Read** で読む。複数ファイルやディレクトリなら、対象の合意を取る（STEP 0）。
- 本文が貼られていればそれを入力にする。
- **読み取れない場合は、推測で進めずユーザーに本文またはファイルを要求する**。

## 深度の選び方（判断入口）

`depth` は地図の粒度。大きいドキュメントほど**まず粗く**。

| depth | 粒度 | 主なノード種別 | こんなとき |
|-------|------|----------------|-----------|
| 0 | ドキュメント全体の俯瞰 | document / section（＋ actor / external） | 主要テーマと大きな構成だけ見たい |
| 1 | セクション・主要概念・決定・未決 | section / concept / decision / open-question（＋ risk / actor / external） | 標準。構成と論点の地図 |
| 2 | 特定セクションの詳細 | requirement / concept / open-question / risk | **範囲を絞った**1 セクションの深掘り（論点・要件・依存） |

迷ったら **depth 1 から**。深掘りは「ドキュメント全体を depth 2 にする」のではなく「**対象セクションを絞って** depth 2 にする」。詳しくは [references/scope-and-depth.md](references/scope-and-depth.md)。

## 手順

### STEP 0 — スコープ合意

DSL を書き始める前に、次を**ユーザーと合意**（自明なら明示して進む）。

- **source**: どのドキュメント／どの範囲か（全文か、特定セクションか）。
- **depth**: どの粒度まで（0 / 1 / 2）。「まず depth 1 で」のような指定があればそれに従う。
- **読者と成功条件**: 誰のための地図か、**「何が分かれば成功か」**（例: 「決定事項と未決事項、誰が担当かが一目で分かる」）。

### STEP 1 — 読解と抽出

ドキュメントを読み、地図の素を集める。**全行を均等に拾わない**——重要なものを選ぶ。

- **タイトル・目的**（document ノード）。
- **主要セクション**（section）。見出し構造が手がかり。
- **重要な概念**（concept）、**要件**（requirement）、**決定事項**（decision）、**未決事項**（open-question）、**リスク**（risk）。
- **関係者**（actor）、**外部システム・依存先**（external）。
- **関係**: 包含（contains）、説明（explains）、依存（depends-on）、決定（decides）、提起（raises）、緩和（mitigates）、所有・担当（owns）、参照（references）、矛盾（conflicts-with）。

### STEP 2 — 圧縮・抽象化

集めた素を、読める地図の大きさに畳む。

- **重要度で選ぶ**。すべてを網羅せず、成功条件（STEP 0）に効くノード・関係を優先。
- **上限の目安**: ノード ≤ 40、エッジ ≤ 80。超えそうなら、近い項目をまとめる／depth を下げる／対象セクションに絞る。
- **縦の構成は `contains` で作る**（document → section → concept …）。論点・担当・リスクなどは破線の横断辺（owns/raises/decides/mitigates/depends-on/references/conflicts-with）でつなぐ。

### STEP 3 — depth とスコープの確定

STEP 0/2 を踏まえ、`@meta depth` を確定する。depth と各ノードの粒度が整合するよう調整（例: depth 0 に requirement / decision を混ぜない）。深掘り要求なら対象セクションへ `source` と範囲を絞る。

### STEP 4 — DSL 出力

完全な `document-map v1` テキストを出力する。文法は [references/grammar.md](references/grammar.md)。出力前に**自己検証**（下記）を必ず通す。

### STEP 5 — 深掘り差分

「このセクションだけ詳しく」と言われたら、**全体を作り直さない**。`@meta source` を対象セクションに、`depth` を上げ、その**部分スコープだけの新しい DSL**を全量で出す（原則「全量置換・範囲を絞る」）。

## 自己バリデーション checklist（提出前に必ず）

[references/grammar.md](references/grammar.md) の検証規則の要点。1 つでも引っかかれば直してから出す。

- [ ] 先頭行が `# document-map v1`。セクションは `@meta` → `@nodes` → `@edges` →（任意）`@layout` の順。
- [ ] `@meta` に `source` / `depth`(0|1|2) / `generated` がある。`focus` を使うならそのノードが存在する。
- [ ] すべてのエッジの両端が `@nodes` に定義済み（未定義参照ゼロ）。`id` の重複なし。自己ループなし。
- [ ] `kind` は { document, section, concept, requirement, decision, open-question, risk, actor, external } のみ。`relation` は { contains, explains, depends-on, decides, raises, mitigates, owns, references, conflicts-with } のみ。
- [ ] 複数語ラベルは `"..."` で引用。ref（出典ロケータ）はラベル直後の唯一の裸トークン。
- [ ] ノード ≤ 40、エッジ ≤ 80、有意行 ≤ 200。
- [ ] `@layout` には `rank=` / `group=` 以外（意味情報）を入れていない。
- [ ] depth と各ノードの粒度が整合（例: depth 0 に requirement / decision を混ぜない）。
- [ ] **図にしたい情報が DSL に明示されている**（renderer が元ドキュメントを再読込しなくても描ける）。全文要約になっていない・網羅で膨らんでいない。

## reference 地図

| ファイル | 中身 | いつ読む |
|----------|------|----------|
| [references/grammar.md](references/grammar.md) | `document-map v1` の正式文法・内部モデル・検証コード（**正本**） | DSL を書く・検証する全ての場面 |
| [references/scope-and-depth.md](references/scope-and-depth.md) | depth 0/1/2 の選び方、ドキュメント類型別ガイド（PRD・仕様書・議事録・README・設計書） | STEP 0 で粒度・範囲に迷ったとき |
| [references/examples.md](references/examples.md) | ドキュメント → 出力 DSL 全文（depth 別の例） | 出力の形を確認したいとき |

## 関連スキル

- [notation-core](../notation-core/SKILL.md) — なぜこう設計するかの土台（意味とレイアウトの分離・決定性）。
- [notation-render](../notation-render/SKILL.md) — ここで出した DSL を図にする次工程（DSL のみ入力）。図が欲しいときはまずこの Skill で DSL を出し、その DSL を渡す。
- [repo-map-notation](../repo-map-notation/SKILL.md) — リポジトリ構造版（責務が異なる。混ぜない）。
- 連携全体は [SKILLS_MAP.md](../../SKILLS_MAP.md)。

# view-patterns — `repo-map v1` のビューパターン集

このファイルは、`repo-map v1` の**固定文法のまま**「見せ方（ビュー）」を切り替えるための
**使い分けレシピ集**である。新しい文法ではない。`kind` / `relation` / セクション構造は
[grammar.md](grammar.md) の閉じた集合のまま一切増やさない。同じ閉じた語彙でも、
**どの `kind`/`relation` の部分集合を選び、`focus` をどこに当て、`@layout`（`rank=`/`group=`）を
どう使うか**で、地図は別物の「ビュー」になる。Mermaid のような自由作図ではない。

なぜこのカタログが要るか。何も意識しないと、生成は毎回「`contains` の階層 ＋ `imports` の依存」
という**同じ形**に落ちてしまう。それは数あるビューの 1 つ（Monorepo Workspace View）にすぎない。
[SKILL.md](../SKILL.md) の **STEP 3（ビュー選択）** で、STEP 0 の「何が分かれば成功か」から
**ビューを 1 つ選んでから** DSL を書く。

固定語彙の前提（[grammar.md §5](grammar.md) より）:

- **kind**: `system` `package` `module` `file-group` `external` `datastore`
- **relation（階層系＝ランクに効く・実線）**: `contains` `deploys` `owns`
- **relation（依存系＝ランクに効かない・破線）**: `imports` `calls` `reads`
- **focus**: 指定ノードに amber の強調枠（[notation-render の theme.md](../../notation-render/references/theme.md)）。
- **@layout**: `rank=`（縦ランク上書き）/ `group=`（名前付きクラスタ）の**位置情報のみ**。

> **全ビュー共通の構造的注意。** 「上から下への流れ」や「層の段」を作りたいとき、依存系
> （`imports`/`calls`/`reads`）は**ランクに影響しない**。並び順を確実に出すには `@layout rank=` を
> 手で振る。これは `@layout`（`rank=`/`group=` のみ）の範囲内で完結し、文法変更は要らない。

---

## ビューの選び方（ミニ判断ガイド）

STEP 0 の成功条件（「何が分かれば成功か」）から**逆引き**する。

| 知りたいこと | 選ぶビュー | 主に使う relation | だいたいの depth |
|--------------|-----------|-------------------|------------------|
| 外から見た外周・外部依存 | System Boundary | `contains` / `calls` / `reads` | 0 |
| みんなが依存する中心はどれか | Dependency Hub | `imports`（/ `calls`） | 1 |
| 処理（リクエスト）がどこを通るか | Request Flow | `calls` / `reads` | 2（連鎖なら 1） |
| 何がどこに配置・デプロイされるか | Deployment | `deploys` / `reads` / `calls` | 0〜1 |
| 誰がどのデータを所有し、誰が越境して読むか | Data Ownership | `owns` / `reads` | 1 |
| レイヤリングが守られているか | Layered Architecture | `contains` / `imports` / `calls` | 1〜2 |
| 1 機能を直すならどこを見るか | Feature Slice | `calls` / `imports` / `reads` | 1〜2 |
| モノレポの workspace 構成 | Monorepo Workspace | `contains` / `imports` | 1 |

迷ったら、まず「`owns`/`deploys`/`reads`/`calls` を主役にするビューはないか」を意図的に検討する。
「階層 ＋ import」が常に正解ではない。

各ビューは次の **7 フィールド**を同じ順で書く:
**intent（意図）/ good for（適する場面）/ node selection（ノード選択）/ edge selection（エッジ選択）/
focus strategy（focus 戦略）/ layout strategy（レイアウト戦略）/ avoid（避けること）**。

---

## 1. System Boundary View

- **intent（意図）**: システムを「外から見た数個の塊」と、その境界の外側にある外部依存・データストアに
  分けて見せる。中身ではなく「何と何でできていて、どこが外部か」を示す。
- **good for（適する場面）**: depth 0 の最初の俯瞰。経営／オンボーディング向けに「自分たちのシステムの外周」を一目で。
- **node selection（ノード選択）**: `system` を 1〜数個。境界の外として `external`・`datastore` を明示。
  `package`/`module`/`file-group` は使わない（depth 0 整合）。
- **edge selection（エッジ選択）**: 主に `contains`（`system` が下位 `system` を束ねる場合）と、外部への
  `calls`/`reads`。`imports` は depth 0 では基本使わない（パッケージ概念がないため）。
- **focus strategy（focus 戦略）**: 中心となる自社システムノードに `focus`。複数 system なら主役 1 つ。
- **layout strategy（レイアウト戦略）**: `external`/`datastore` を `@layout rank=` で最下段に固定し
  「外側は下」を視覚化。境界の外を `group=external` で 1 クラスタに寄せてもよい。
- **avoid（避けること）**: 内部パッケージを描き始めること（それは Layered / Monorepo View の仕事）。
  depth 0 に `module`/`file-group` を混ぜる（W-DEPTHEXCEED）。

## 2. Dependency Hub View

- **intent（意図）**: 「みんなが依存する中心（共有コア・共通ライブラリ）」と、そこへ収束する依存の束を主役にする。
- **good for（適する場面）**: depth 1 のモノレポ／ライブラリ群で「変更の影響半径が大きいのはどれか」を見たいとき。
- **node selection（ノード選択）**: `package` 中心（複数の利用側 ＋ 1〜少数のハブ）。必要なら `external`/`datastore`。
  親の `system` は 0〜1 個。
- **edge selection（エッジ選択）**: 依存系 `imports`（同期呼びなら `calls`）を**利用側 → ハブ**へ多数引く。
  `contains` は親 `system` からのぶら下げに最小限。`reads` は使わない（コード依存が主役）。
- **focus strategy（focus 戦略）**: ハブノードに `focus`。収束先が amber 枠で強調され「ここが要」が即読める。
- **layout strategy（レイアウト戦略）**: ハブを `@layout rank=` で中段〜下段に固定し、利用側を上段へ。
  `group=` は基本使わず、収束の形を素直に見せる。
- **avoid（避けること）**: ハブ以外の周辺依存まで引いて毛玉化すること。代表的・構造を語る依存だけ残す（網羅しない）。

## 3. Request Flow View

- **intent（意図）**: 1 リクエスト（または 1 ユースケース）が通る経路を「上から下へ」の呼び出し列として見せる。
- **good for（適する場面）**: depth 2 の 1 サービス内部、または depth 1 のサービス連鎖で「処理がどこを通るか」。
- **node selection（ノード選択）**: depth 2 なら `file-group`/`module`（handlers / usecases / repo …）、
  depth 1 ならサービス `package`。終端の `datastore`/`external` を含める。
- **edge selection（エッジ選択）**: 依存系 `calls` を経路の主役（A → B → C）。境界をまたぐデータ取得は `reads`、
  外部 API は `calls`。`contains` は親による束ねに最小限。
- **focus strategy（focus 戦略）**: 経路の入口（最上流 handlers / API gateway）に `focus`。「ここから始まる」を明示。
- **layout strategy（レイアウト戦略）**: **肝** — `calls` は依存系なので**ランクに効かない**。経路を上から下に
  確実に並べたいなら `@layout rank=` を経路順に手で振る（入口 `rank=0`、次 `rank=1` …）。
- **avoid（避けること）**: 兄弟の枝分かれを全部描いて「線形の流れ」を曇らせること。1 本の代表経路に絞る。

## 4. Deployment View

- **intent（意図）**: 「何がどこにデプロイ／ホストされるか」を見せる。論理パッケージではなく**実行・配置単位**の地図。
- **good for（適する場面）**: depth 0〜1 で、インフラ／SRE 視点。「このサービスはどのランタイム／環境に載るか」。
- **node selection（ノード選択）**: 配置先を `system`（環境・クラスタ・ホスト境界）、載るものを `package`
  （サービス／アプリ）、外部マネージドを `external`、データ層を `datastore`。
- **edge selection（エッジ選択）**: **階層系 `deploys`**（配置先 → 配置物、`system deploys service`）が主役で
  **実線・ランク決定**。アプリ → DB は `reads`、外部 SaaS は `calls`（破線）。`contains`（論理束ね）と役割を分ける。
- **focus strategy（focus 戦略）**: 注目する環境ノード（例 `prod` system）に `focus`、または問題のサービスに `focus`。
- **layout strategy（レイアウト戦略）**: `deploys` が自然に「環境を上、配置物を下」のランクを作る。同じ環境に
  載る複数サービスを `group=<env>` で横クラスタ化すると「どの環境に何が同居するか」が読める。
- **avoid（避けること）**: `deploys` を「依存」のつもりで使うこと。`deploys` は所属／配置（実線・親子）であって
  呼び出しではない。コード `import` を `deploys` で表さない。

## 5. Data Ownership View

- **intent（意図）**: 「どのコンポーネントがどのデータを所有し、誰がそれを（越境して）読むか」を見せる。
  所有と参照の分離を可視化する。
- **good for（適する場面）**: depth 1 のマイクロサービス／モジュラモノリスで「DB を持つ主はどれか／越境 read は
  どこか」。境界違反の発見に強い。
- **node selection（ノード選択）**: 所有者の `package`（サービス）、所有される `datastore`（DB／キャッシュ／キュー）、
  必要なら外部データ源 `external`。
- **edge selection（エッジ選択）**: **階層系 `owns`**（所有者 → datastore、`service owns db`）が主役で
  **実線・ランク決定**。**他サービスからの越境参照は `reads`**（破線）。この「所有 vs 利用」のコントラストが主役。
  `contains` は親 `system` の束ねに最小限。
- **focus strategy（focus 戦略）**: 越境 `reads` が集中する datastore（共有されがちな DB）に `focus`。
  「ここが共有点／結合点」を amber で強調。
- **layout strategy（レイアウト戦略）**: `owns` が「所有者を上、データを下」のランクを作る。各サービス ＋ その
  所有データを `group=<service>` で囲うと、`group` をまたぐ `reads` が「越境参照」として視覚的に飛び出す。
- **avoid（避けること）**: 所有も越境参照も両方 `reads` で描いてしまうこと（所有が消える）。
  所有は必ず `owns`、利用は `reads` と描き分ける。

## 6. Layered Architecture View

- **intent（意図）**: presentation / application / domain / infrastructure のような**層**を rank で段に固定し、
  層をまたぐ依存の向きを見せる。
- **good for（適する場面）**: depth 1〜2 の 1 アプリ／サービス内部で「レイヤリングが守られているか
  （下向き依存のみか）」。
- **node selection（ノード選択）**: 各層を代表する `package`（depth1）または `file-group`/`module`（depth2）。
  `datastore`/`external` は最下層境界として。
- **edge selection（エッジ選択）**: 層内束ねに `contains`（親 → 子、実線）、層をまたぐ利用に `imports`/`calls`
  （破線）、最下層の DB に `reads`。
- **focus strategy（focus 戦略）**: 検証したい層（例 domain）に `focus`。または逆流が疑われるノードに `focus`。
- **layout strategy（レイアウト戦略）**: **肝** — `@layout rank=` で層を明示的に段に固定（presentation `rank=0`、
  application `rank=1`、domain `rank=2`、infra `rank=3`）。同じ層のノードを同じ rank に揃え、`group=<layer>` で
  クラスタ化。
- **avoid（避けること）**: 自動ランク任せにして層が崩れること。層をまたぐ循環 `imports` を全部描いて
  「下向き依存」の読みを消すこと。

## 7. Feature Slice View

- **intent（意図）**: 1 つの機能（縦切り）が触る要素だけを、層・パッケージ横断で集めて見せる。
  「この機能を直すならどこを見るか」。
- **good for（適する場面）**: depth 1〜2、オンボーディングやチケット着手時。横断的な関心の地図。
- **node selection（ノード選択）**: その機能が通る `package`/`module`/`file-group` を**機能に関係するものだけ**
  選抜（全パッケージは出さない）。終端の `datastore`/`external`。
- **edge selection（エッジ選択）**: 機能経路上の `calls`/`imports`（破線）と `reads`。`contains` は出自を示す
  最小限。**選択の鋭さ**（無関係ノードを入れない）がこのビューの差別化点。
- **focus strategy（focus 戦略）**: 機能のエントリポイント（API／画面／ジョブ）に `focus`。
- **layout strategy（レイアウト戦略）**: `group=<feature>` で機能スライス全体を 1 クラスタに寄せ、周辺との
  境界を作る。rank は経路順（Request Flow と同様に必要なら `@layout rank=` を手振り）。
- **avoid（避けること）**: 機能に無関係なノードまで含めて「ただの depth1 全体図」に戻ること。網羅ではなく圧縮。

## 8. Monorepo Workspace View

- **intent（意図）**: モノレポの `apps/*` と `packages/*` を workspace 単位で束ね、アプリ → 共有パッケージの
  依存を見せる。最もよく出る「標準形」。
- **good for（適する場面）**: depth 1、root `.`。モノレポ構成の把握。
- **node selection（ノード選択）**: `system`（モノレポ）1 ＋ `apps/*`・`packages/*`・`services/*` を `package`、
  `datastore`/`external` を境界に。
- **edge selection（エッジ選択）**: `system` → 各 package を `contains`（実線・束ね）、アプリ／サービス → 共有
  `core` を `imports`、DB に `reads`、外部に `calls`。
- **focus strategy（focus 戦略）**: 共有コア package に `focus`（Dependency Hub と組み合わせやすい）。
- **layout strategy（レイアウト戦略）**: `group=apps` / `group=packages` / `group=services` でフォルダ族ごとに
  横クラスタ化し、モノレポの区画を再現。共有コアを `@layout rank=` で下段固定し収束を見せる。
- **avoid（避けること）**: **これを毎回の唯一解として出すこと（本カタログが直したい癖そのもの）。**
  Monorepo Workspace View は 8 つの選択肢の 1 つにすぎない。

---

## クロスリファレンス

- 文法・列挙・検証（正本）: [grammar.md](grammar.md)
- 範囲と深度（depth ↔ ビューの対応、リポジトリ類型別ガイド）: [scope-and-depth.md](scope-and-depth.md)
- どの例がどのビューか（入出力例）: [examples.md](examples.md)
- 生成手順でのビュー選択: [SKILL.md](../SKILL.md) の STEP 3（ビュー選択）
- 設計思想（意味層とレイアウトの分離）: [notation-core](../../notation-core/SKILL.md)

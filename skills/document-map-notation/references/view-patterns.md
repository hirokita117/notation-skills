# view-patterns — `document-map v1` のビューパターン集

このファイルは、`document-map v1` の**固定文法のまま**「見せ方（ビュー）」を切り替えるための
**使い分けレシピ集**である。新しい文法ではない。`kind` / `relation` / セクション構造は
[grammar.md](grammar.md) の閉じた集合のまま一切増やさない。同じ閉じた語彙でも、
**どの `kind`/`relation` の部分集合を選び、`focus` をどこに当て、`@layout`（`rank=`/`group=`）を
どう使うか**で、地図は別物の「ビュー」になる。Mermaid のような自由作図ではない。

なぜこのカタログが要るか。何も意識しないと、生成は毎回「`document → section → concept` の
`contains` 目次ツリー」という**同じ形**に落ちてしまう。それは数あるビューの 1 つ
（Document Outline View）にすぎない。[SKILL.md](../SKILL.md) の **STEP 3（ビュー選択）** で、
STEP 0 の「何が分かれば成功か」と設計意図 4 軸（下記）から**ビューを 1 つ選んでから** DSL を書く。

固定語彙の前提（[grammar.md §5](grammar.md) より）:

- **kind**: `document` `section` `concept` `requirement` `decision` `open-question` `risk` `actor` `external`
- **relation（階層系＝ランクに効く・実線）**: `contains` **のみ**
- **relation（依存系＝ランクに効かない・破線）**: `explains` `depends-on` `decides` `raises` `mitigates` `owns` `references` `conflicts-with`
- **focus**: 指定ノードに amber の強調枠（[notation-render の theme.md](../../notation-render/references/theme.md)）。
- **@layout**: `rank=`（縦ランク上書き）/ `group=`（名前付きクラスタ）の**位置情報のみ**。

> **全ビュー共通の構造的注意（document-map 固有・重要）。** `document-map v1` で**実線・ランクに
> 効くのは `contains` だけ**である（[grammar.md §5](grammar.md) の「設計判断」）。`owns`/`decides`/
> `raises`/`mitigates`/`conflicts-with` などは**すべて破線の横断辺で、縦の並びに影響しない**。
> したがって「決定ステータスの段」「リスク深刻度のバンド」「担当者のレーン」など**目次順以外の
> 並びを作りたいときは、relation では作れない**。必ず `@layout rank=`/`group=` と `focus` で作る。
> これは `@layout`（`rank=`/`group=` のみ）の範囲内で完結し、文法変更は要らない。
> （repo-map は `contains`/`deploys`/`owns` の 3 つが階層系なので事情が異なる。混同しない。）

---

## 設計意図の確認（4 軸）と AskUserQuestion

ビューは「何を見せたいか」で決まる。DSL を書く前に、次の **4 軸**を STEP 0 で確認する。
曖昧なら **AskUserQuestion** ツールでユーザーに問い、明示済み／自明なら前提を述べて進む。

- **(a) 見たい描画・観点**: どのビューで見せたいか（論点マップ／担当マップ／リスク対応 …）。
- **(b) 避けたい描画・観点**: 例「ただの目次で終わらせたくない」「個別要件は省きたい」「全文要約は不要」。
- **(c) 強調したい関係**: `decides` / `depends-on` / `raises`・`mitigates` / `owns` / `conflicts-with` / `explains`・`references`。
- **(d) 出力用途・読者**: PM・意思決定 / 設計レビュー / オンボーディング / 監査・出典確認。

### 問う / 黙って進める の RULE

- **問う条件**: (1) AskUserQuestion が利用可能、かつ (2) 成功条件からビューが一意に逆引きできず
  曖昧なとき。両方を満たすときだけ問う。**曖昧な軸だけ**を聞く（4 軸を毎回全部聞かない）。
- **黙って進める条件**: ユーザーが観点／relation／用途を指定済み、または成功条件からビューが自明な
  とき。問わずに進め、**採用した前提を 1 文で明示**する（例:「決定／未決が成功条件なので
  Decision & Open-Question View を選びました」）。ツールが無い環境では最尤のビューを選び前提を明示する。
- **質問設計の制約**: 各 question のオプションは **2〜4 個**に絞る（8 ビュー全部は出さない。高シグナルな
  観点だけ出し、Outline / Requirement Dependency / Concept Explanation / Source-Linked 等は用途・depth の
  答えから自動採用する）。**`multiSelect: true` は (a) 見たい観点 と (c) 強調する関係 のみ**。
  (b) 避けたい観点・(d) 出力用途 は単一選択。

### AskUserQuestion 質問テンプレ（document-map）

| 軸 | header（≤12字） | multiSelect | オプション例（label: 説明 → 対応ビュー） |
|----|------------------|-------------|--------------------------------------------|
| (a) | `見たい観点` | ✓ | 論点マップ: 決定と未決の因果（Decision & Open-Question）／担当マップ: 誰が何を持つか（Ownership）／リスク対応: 危険と緩和（Risk & Mitigation）／対立: 競合する案（Decision Conflict） |
| (b) | `避けたい観点` | — | ただの目次は不要（Outline を既定にしない）／個別要件は省く（depth 1 維持）／全文要約は不要（圧縮に徹する）／特になし |
| (c) | `強調する関係` | ✓ | 決定→論点: `decides`/`raises`／依存・前提: `depends-on`／リスク・緩和: `raises`/`mitigates`／担当・所有: `owns`／対立: `conflicts-with` |
| (d) | `出力用途` | — | PM・意思決定（→ Decision & Open-Question, focus:questions）／設計レビュー（→ Requirement Dependency / Risk & Mitigation, depth 2）／オンボーディング（→ Outline / Concept Explanation, depth 0〜1）／監査・出典（→ Source-Linked Reference） |

**逆引きの手順**: (a) で候補を出す → (b) で除外する（特に罠ビュー Document Outline を排除）→
(c) で候補を絞る → (d) で `depth` と `focus` の既定を決める。

### 出力用途 → おすすめビュー

| 出力用途 | おすすめビュー | だいたいの depth |
|----------|----------------|------------------|
| オンボーディング / 全体像 | Document Outline / Concept Explanation | 0〜1 |
| PM・意思決定 | Decision & Open-Question / Ownership | 1 |
| 設計レビュー（要件・依存） | Requirement Dependency | 2 |
| 設計レビュー（リスク） | Risk & Mitigation | 1〜2 |
| RFC・提案の争点整理 | Decision Conflict | 1 |
| 監査・出典トレース | Source-Linked Reference | 1〜2 |

### 強調したい関係 → ビュー

| 強調したい relation | 主なビュー |
|---------------------|-----------|
| `decides` / `raises` | Decision & Open-Question |
| `depends-on` | Requirement Dependency |
| `raises` + `mitigates` | Risk & Mitigation |
| `conflicts-with` | Decision Conflict |
| `owns` | Ownership / Responsibility |
| `explains` / `references` | Concept Explanation / Source-Linked Reference |
| `contains`（構成のみ） | Document Outline |

---

## ビューの選び方（ミニ判断ガイド）

STEP 0 の成功条件（「何が分かれば成功か」）と 4 軸の答えから**逆引き**する。

| 知りたいこと | 選ぶビュー | 主に使う relation | だいたいの depth |
|--------------|-----------|-------------------|------------------|
| 全体が何章でできているか（目次） | Document Outline | `contains`（/ `explains`） | 0〜1 |
| 決定事項と未決事項、その因果 | Decision & Open-Question | `decides` / `raises` / `depends-on` | 1 |
| 要件と前提依存 | Requirement Dependency | `depends-on`（/ `decides`） | 2 |
| リスクと緩和策、未対応リスク | Risk & Mitigation | `raises` / `mitigates` | 1〜2 |
| どの案とどの案が対立するか | Decision Conflict | `conflicts-with`（/ `raises`） | 1 |
| 誰が何を担当するか | Ownership / Responsibility | `owns` | 1 |
| 概念・モデルの説明と参照 | Concept Explanation | `explains` / `references` | 1〜2 |
| 各記述がどこ由来か（出典） | Source-Linked Reference | `references`（＋ ref） | 1〜2 |

迷ったら、まず「`decides`/`owns`/`raises`/`conflicts-with` を主役にするビューはないか」を意図的に
検討する。「目次（`contains` だけ）」が常に正解ではない。

各ビューは次の **7 フィールド**を同じ順で書く:
**intent（意図）/ good for（適する場面）/ node selection（ノード選択）/ edge selection（エッジ選択）/
focus strategy（focus 戦略）/ layout strategy（レイアウト戦略）/ avoid（避けること）**。

---

## 1. Document Outline View

- **intent（意図）**: ドキュメントの目次構造（`document → section → concept`）を `contains` の縦スパインで
  素直に見せる。「全体が何章でできているか」だけを示す。
- **good for（適する場面）**: depth 0〜1 の最初の俯瞰。README・長い仕様書の入口。
- **node selection（ノード選択）**: `document` 1、`section` 複数、depth 1 なら代表 `concept` を少数。
  `requirement`/`decision`/`open-question`/`risk` は出さない（俯瞰）。
- **edge selection（エッジ選択）**: ほぼ `contains` のみ（document → section → concept）。`explains` を
  概念の補足に最小限。横断辺は基本引かない。
- **focus strategy（focus 戦略）**: 入口や最重要 section に `focus`、または無し。
- **layout strategy（レイアウト戦略）**: 自動ランク（`contains` が縦を作る）。`@layout` は基本不要。
- **avoid（避けること）**: **これを毎回の唯一解として出すこと（本カタログが直したい癖そのもの）。**
  Document Outline View は 8 つの選択肢の 1 つにすぎない。論点・決定・担当・リスクが成功条件なら、
  他の 7 ビューを意図的に検討する。depth 0 に `requirement`/`decision` を混ぜない（W-DEPTHEXCEED）。

## 2. Decision & Open-Question View

- **intent（意図）**: 「何が決まり（`decision`）／何が未決か（`open-question`）、決定が何を確定し
  （`decides`）何を生むか（`raises`）」を主役にする論点マップ。
- **good for（適する場面）**: depth 1 の PRD・議事録・RFC。「決定事項と宿題が一目で」。
- **node selection（ノード選択）**: 束ねの `section`、`decision`、`open-question`、補助に `risk`。
  個別 `requirement` は出さない（depth 1）。
- **edge selection（エッジ選択）**: 縦は `contains`（doc → section → decision/open-question）。主役の
  横断辺は `decides`（decision → open-question/requirement）、`raises`（→ open-question/risk）、
  `depends-on`（open-question → decision）。
- **focus strategy（focus 戦略）**: 未決事項セクション（例 `questions`）、または最大の争点となる
  `open-question` に `focus`。
- **layout strategy（レイアウト戦略）**: 既定で十分。未決を目立たせたいなら未決群を `@layout group=open`
  でまとめ `rank=` で下段に寄せ「これから片付ける箱」を作る（意味は変えず配置だけ）。
- **avoid（避けること）**: 決定と未決を `contains` 兄弟として並べただけで横断辺（decides/raises/
  depends-on）を引かないこと（論点の因果が消える）。
- **例**: [examples.md](examples.md) 例 A（PRD depth1・`focus: questions`）。

## 3. Requirement Dependency View

- **intent（意図）**: 1 セクションの要件群と、要件間／要件 → 外部の依存（`depends-on`）を深掘りで見せる。
- **good for（適する場面）**: depth 2 の 1 セクション。「この機能の要件と前提依存」。
- **node selection（ノード選択）**: 対象 `section` 1 つ、`concept`、`requirement` 複数、依存先 `external`、
  補助 `decision`/`risk`。
- **edge selection（エッジ選択）**: 縦は `contains`（section → concept → requirement）。主役は
  `depends-on`（requirement → requirement / requirement → external）。補助に `decides`（decision → requirement）。
- **focus strategy（focus 戦略）**: 最も依存が集中する／要となる `requirement` に `focus`。
- **layout strategy（レイアウト戦略）**: 既定。依存の連鎖を上から下に見せたいなら、依存系（＝ランクに
  効かない）なので `@layout rank=` を連鎖順に手で振る。
- **avoid（避けること）**: depth 1 で `requirement` を出すこと（W-DEPTHEXCEED）。全要件を網羅して毛玉化すること。
- **例**: [examples.md](examples.md) 例 B（設計書 1 セクション depth2）。

## 4. Risk & Mitigation View

- **intent（意図）**: リスクと、それを生む原因（`raises`）／緩和する手当（`mitigates`）の対応関係を見せる。
- **good for（適する場面）**: depth 1〜2。設計レビュー・セキュリティ／SRE 観点。「未対応リスクはどれか」。
- **node selection（ノード選択）**: `risk` 複数、原因側の `decision`/`requirement`/`section`、`open-question`、
  必要なら `external`。
- **edge selection（エッジ選択）**: 縦 `contains` 最小限。主役は `raises`（→ risk）と
  `mitigates`（decision/requirement → risk）。`depends-on` は補助。
- **focus strategy（focus 戦略）**: 最重大リスク、または **`mitigates` が来ていない（未対応の）`risk`** に
  `focus`。「ここが手当て待ち」を amber で強調。
- **layout strategy（レイアウト戦略）**: **肝** — 深刻度の「段」は relation では作れない（`raises`/
  `mitigates` は破線・ランク無効）。深刻度バンドが欲しければ `@layout rank=` で risk を段に固定
  （重大 `rank=0` 等）。`group=mitigated`/`group=open-risk` で対応済み／未対応を横に分ける。
- **avoid（避けること）**: リスクを `contains` でぶら下げただけで raises/mitigates を引かないこと。
  深刻度を relation で表そうとすること（不可能 — `@layout` を使う）。
- **例**: [examples.md](examples.md) 例 B（`risk-lock` を `raises`/`mitigates` する部分）。

## 5. Decision Conflict View

- **intent（意図）**: 競合する案・決定の対立（`conflicts-with`）と、それぞれが生むリスク／未決を見せる。
- **good for（適する場面）**: depth 1 の RFC・設計提案・議事録。「どの案とどの案がぶつかっているか」。
- **node selection（ノード選択）**: `decision`、対案の `concept`/`decision`、`risk`、`open-question`、`section`。
- **edge selection（エッジ選択）**: 縦 `contains` 最小限。主役は `conflicts-with`（decision ↔ concept/decision）。
  補助に `raises`、`depends-on`。
- **focus strategy（focus 戦略）**: 採択された決定、または最大の争点ノードに `focus`。
- **layout strategy（レイアウト戦略）**: 対立する両極を `@layout group=option-a`/`group=option-b` で左右に
  分けると対立が読める（破線の `conflicts-with` が group をまたいで飛ぶ）。rank は同段に揃える。
- **avoid（避けること）**: 対立をノードの並びだけで暗示し `conflicts-with` を引かないこと。
  `conflicts-with` は依存系（ランク無効）と理解し、配置は `@layout` で作る。
- **例**: [examples.md](examples.md) 例 C（`alt-infra conflicts-with d-infra`）。

## 6. Ownership / Responsibility View

- **intent（意図）**: 「誰（`actor`）が、どのセクション／決定／要件を所有・担当するか（`owns`）」を主役にする担当マップ。
- **good for（適する場面）**: depth 1 の議事録・PRD。「決定事項の担当が一目で」。
- **node selection（ノード選択）**: `actor` 複数、所有対象の `section`/`decision`/`requirement`、補助 `open-question`。
- **edge selection（エッジ選択）**: 縦 `contains`（doc → section → decision）。主役の横断辺は
  `owns`（actor → section/decision/requirement）。
- **focus strategy（focus 戦略）**: 担当が集中する `actor`、または所有者未定（`owns` が来ていない）の決定に `focus`。
- **layout strategy（レイアウト戦略）**: **肝** — `owns` は依存系（破線・ランク無効）。`actor` を「上段の
  レーン」に出したいなら `@layout rank=0 group=owners` で actor を固定する（[examples.md](examples.md) 例 C
  と同じ手法）。これがこのビューの肝。
- **avoid（避けること）**: `actor` を `contains` でセクションにぶら下げて読み筋を乱すこと
  （[grammar.md §5](grammar.md) の設計判断が明示的に避けるパターン）。`owns` を縦軸にしたいなら必ず
  `@layout` で固定する。
- **例**: [examples.md](examples.md) 例 C（`@layout` で担当を `rank=0 group=owners`）／例 A の `owns` 部分。

## 7. Concept Explanation View

- **intent（意図）**: 中心概念と、それを説明する概念／セクション（`explains`）・参照（`references`）の
  関係を見せる。用語集・モデル理解向け。
- **good for（適する場面）**: depth 1〜2 の設計書・仕様書。「このモデル／用語は何で、何に支えられているか」。
- **node selection（ノード選択）**: `concept` 中心、`section`、補助 `requirement`、参照先 `external`/別 `document`。
- **edge selection（エッジ選択）**: 縦 `contains` 最小限。主役は `explains`（concept/section → concept）と
  `references`（→ external/別ノード）。
- **focus strategy（focus 戦略）**: 中心概念に `focus`。
- **layout strategy（レイアウト戦略）**: 中心概念を `@layout rank=` 中段に置き、説明側を上・参照側を下に。
  `group=` で概念クラスタをまとめる。
- **avoid（避けること）**: `explains` と `contains` を混同すること（`explains` は破線の補足、`contains` は構成スパイン）。
- **例**: [examples.md](examples.md) 例 A の `delivery explains multichannel`・`references` 部分。

## 8. Source-Linked Reference View

- **intent（意図）**: 各ノードがドキュメントのどこ由来か（ref ロケータ）と外部参照（`references`）を
  明示し、出典に戻れる地図にする。レビュー・監査向け。
- **good for（適する場面）**: depth 1〜2。「この決定はどの章／行に書いてあるか」を追跡したいとき。
- **node selection（ノード選択）**: 通常の `section`/`decision`/`requirement` 等に、**ref（出典ロケータ）を
  積極的に付与**。参照先 `external`。
- **edge selection（エッジ選択）**: 縦 `contains`、横断は `references`（→ external/別ノード/別 document）を主役に。
- **focus strategy（focus 戦略）**: 監査対象のノードに `focus`。
- **layout strategy（レイアウト戦略）**: 既定で十分。外部参照を `group=external` に寄せてもよい。
- **avoid（避けること）**: ref を全文引用に膨らませること（ref はスペースを含まないロケータ。本文は載せない
  — [grammar.md §6](grammar.md)）。
- **例**: 完全例は無いが、[examples.md](examples.md) の全例が ref（`#goals`・`#auth-flow` 等）を付けて断片的に示す。

---

## クロスリファレンス

- 文法・列挙・検証（正本）: [grammar.md](grammar.md)
- 範囲と深度（depth ↔ ビューの対応、ドキュメント類型別ガイド）: [scope-and-depth.md](scope-and-depth.md)
- どの例がどのビューか（入出力例）: [examples.md](examples.md)
- 生成手順でのビュー選択: [SKILL.md](../SKILL.md) の STEP 3（ビュー選択）
- 設計思想（意味層とレイアウトの分離）: [notation-core](../../notation-core/SKILL.md)
- リポジトリ版のビューパターン: [repo-map-notation/references/view-patterns.md](../../repo-map-notation/references/view-patterns.md)

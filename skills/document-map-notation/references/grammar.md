# grammar — `document-map v1` 正式文法（正本）

このファイルは `document-map v1` DSL の**唯一の正本**である。文法・列挙・内部モデル・検証規則をここで定義する。生成側（`document-map-notation`）はこれに従って出力し、描画側（[notation-render](../../notation-render/SKILL.md)）はこれを normative として読む。両者はここを再定義しない。

設計思想は [notation-core](../../notation-core/SKILL.md)。原則: 最も単純で曖昧さのない規則を選ぶ。これは**ドキュメントの構造・論点・関係を圧縮して読みやすくする地図**のための小さな言語であり、全文要約でも汎用グラフ言語でもない。

> 行レベルの文法（字句・セクション・トークン化・引用・`@layout`）は `repo-map v1` と**意図的に同型**である。差分は **@meta の scope キー名（`source`）・列挙（kind / relation）・depth の意味・テーマ色**だけ。共有の行文法は [repo-map-notation/references/grammar.md](../../repo-map-notation/references/grammar.md) §1・§3.1・§3.5・§3.6 と一致し、ここでは document 固有の差分を正とする。

---

## 1. 字句（レキシカル）規則

`repo-map v1` の §1 と同一。要点のみ再掲する（詳細・根拠は repo-map grammar.md §1）。

- ドキュメントは UTF-8、行は LF（`\n`）。LF 直前の CR は許容・除去。最終行の改行は省略可。
- 各物理行は **空行**（破棄）／**全行コメント**（先頭非空白が `#`・破棄。ただし最初の非空行は §2 のバージョンヘッダ）／**セクションヘッダ**（列 0 の `@`）／**エントリ行**（ちょうど 2 スペース字下げ）／**字句エラー E-INDENT**（1・3+ スペース、タブ字下げ、列 0 の不正内容）に分類する。
- インライン／行末コメントは無い。エントリ行中の `#` は通常文字。
- トークン化はエントリ本体（字下げ除去後）をスペースで分割。連続スペースは 1 区切り。タブは値中なら W-CHAR・分割上はスペース扱い。**引用ラベル**（§3.5）だけはスペースを含んでも 1 トークン。
- 大小区別あり: セクションヘッダ・列挙値（kind/relation）・フィールドキー・ノード ID。**ラベルは自由文**（大小保持）。
- `id` の文字集合（§1.7 repo-map と同一）: 先頭は英字/`_`、以降は英数・`_`・`-`・`.`。最大 64 文字。違反は E-BADID / E-IDLEN。

```
id        = id-start { id-cont }
id-start  = ALPHA | "_"
id-cont   = ALPHA | DIGIT | "_" | "-" | "."
```

**推奨の ID 導出**: 見出しスラッグから決定的に作る。見出しテキストを小文字化し、空白を `-` に、`/` を `.` に、その他の不正文字を `-` に置換する。例: 「2. 認証フロー」→ `s2-auth-flow`、「Open Questions」→ `open-questions`。同じ見出しは常に同じ ID を生み、地図の再生成が安定する。短い意味のある ID（`auth`, `q-sla`, `risk-vendor`）を優先する。

---

## 2. バージョンヘッダ

```
version-header = "# document-map v1"
```

- ドキュメントの**最初の非空行**で、列 0、`#` の後にスペース 1 個。厳密一致。
- 1 ドキュメントに 1 つ。欠如は E-NOVERSION。別バージョン（`# document-map v2` 等）は E-BADVERSION（v1 レンダラは推測せず拒否する）。
- 正準バージョン文字列リテラルは **`document-map v1`**。

---

## 3. セクション文法

### 3.1 セクションと順序

```
document = version-header meta-section nodes-section edges-section [ layout-section ]
```

- 順序は固定: `@meta` → `@nodes` → `@edges` →（任意）`@layout`。違反は E-ORDER。
- `@meta` `@nodes` `@edges` は**必須**。`@layout` は**任意**。
- 各ヘッダは一意（重複は E-DUPSECTION）。未知ヘッダは E-BADSECTION。
- `@nodes` は 1 行以上（0 行は E-EMPTYNODES）。`@edges` は 0 行可。

### 3.2 `@meta` のフィールド

各行は `key: value`（コロン＋スペース 1 個以上、その後が値・前後空白除去）。最初の `:` が区切り。

```
meta-line = key-token ":" SP value-rest
key-token = "source" | "depth" | "focus" | "generated"
```

| key | 必須 | 値 | 制約 |
|-----|------|----|------|
| `source` | **必須** | 出典 | 元ドキュメントのパス／URL／識別子（例 `docs/requirements.md`）。空白を含む場合のみ W-PATHSPACE（非推奨） |
| `depth` | **必須** | 整数 | `0` / `1` / `2` のみ。他は E-DEPTHVAL |
| `focus` | 任意 | id | `@nodes` 内に存在必須。なければ E-FOCUSREF |
| `generated` | **必須** | ISO 8601 | 不正形式は W-DATEFMT（警告） |

各キーは高々 1 回（重複 E-DUPMETA）。未知キーは E-BADMETAKEY。必須キー（source/depth/generated）欠如は E-METAMISSING。`key: value` 形式でない行は E-METASYNTAX。

`depth` の意味（§ [scope-and-depth.md](scope-and-depth.md)）:

- **0 = 俯瞰**。ドキュメント全体の主要テーマと大きな構成だけ（数個の粗いノード）。
- **1 = セクション・主要概念・決定事項・未決事項**まで。迷ったらここから。
- **2 = 特定セクションに絞った詳細**。論点・要件・依存関係まで。**大きなドキュメント全体を depth 2 にしない**——対象セクションを絞って深掘りする。

### 3.3 `@nodes` の行

```
node-line = id SP kind SP label [ SP ref ]
kind      = "document" | "section" | "concept" | "requirement"
          | "decision" | "open-question" | "risk" | "actor" | "external"
```

- トークン 1 = `id`、トークン 2 = `kind`、続いて `label`、任意で `ref`。
- `id` は §1 に従い、ドキュメント内で一意（重複は E-DUPID）。
- `kind` は閉じた集合（§5）。未知は E-BADKIND。
- `label` は必須・非空。`ref` は任意。
- **`ref`（出典ロケータ）**: ラベル直後の唯一の裸トークンで、そのノードが元ドキュメントのどこ由来かを示す（見出しアンカー `#auth`、行範囲 `L120-188`、ページ `p.4` 等）。スペースを含まない。レンダラーは解決も走査もしない（説明用）。内部モデルでは `path` フィールドに格納する（repo-map とノードブロックをバイト同型にするため）。

### 3.4 `@edges` の行

```
edge-line = id SP id SP relation
relation  = "contains" | "explains" | "depends-on" | "decides"
          | "raises" | "mitigates" | "owns" | "references" | "conflicts-with"
```

- ちょうど 3 トークン（`from` `to` `relation`）。過不足は E-EDGEARITY。
- `from` / `to` は `@nodes` 定義済み ID（未定義は E-EDGEREF）。
- `relation` は閉じた集合（§5）。未知は E-BADREL。
- 自己辺（`from == to`）は E-SELFEDGE。
- 辺にラベル・引用フィールドは無い（純粋な三つ組）。

**relation の意味（向きは from → to）:**

| relation | 意味（from → to） |
|----------|-------------------|
| `contains` | 包含・構成（document が section を、section が concept を含む） |
| `explains` | 説明・詳述（concept/section が別の概念を説明する） |
| `depends-on` | 依存・前提（要件 A が B を前提にする） |
| `decides` | 決定が論点・要件を確定させる（decision → requirement/open-question） |
| `raises` | 論点・リスクを提起する（section/concept → open-question/risk） |
| `mitigates` | リスクを緩和する（decision/requirement → risk） |
| `owns` | 担当・所有（actor → section/decision/requirement） |
| `references` | 参照・外部参照（任意のノード → external や別ノード） |
| `conflicts-with` | 矛盾・対立（決定どうし・要件どうしの衝突） |

### 3.5 ラベルと ref の区別（確定ルール）

`repo-map v1` §3.5 と同一規則（`path` を `ref` と読み替える）。

**ルール: 複数語ラベルは引用で囲み、任意の `ref` はラベル直後の唯一の裸トークンとする。引用なしのラベルは 1 語でなければならない。**

`id` と `kind` を読んだ後、残りトークン R を:

1. R[0] が**引用文字列**（`"..."`）なら `label`。その後 1 トークンなら `ref`、0 なら ref 無し、2 以上は E-NODEARITY。
2. それ以外（裸）なら `label` は R[0] の 1 語のみ。その後 1 トークンなら `ref`、0 なら ref 無し、2 以上は E-NODEARITY。

**引用文字列**は ASCII `"` で囲み、内部はバックスラッシュが次の 1 文字をエスケープ（`\"`→`"`、`\\`→`\`）。閉じない引用は E-QUOTE。

有効な例:

```
doc        document     "PRD: 通知基盤"          docs/prd.md
auth       section      "認証フロー"             #auth
q-sla      open-question "SLA は 99.9% で足りるか"
risk-vendor risk        "ベンダーロックイン"
pm         actor        PM
slack      external     Slack
```

無効な例:

```
auth section 認証 フロー #auth     （E-NODEARITY: 複数語ラベルが未引用）
auth section "認証フロー" a b      （E-NODEARITY: ラベル後に 2 トークン）
auth section "認証フロー           （E-QUOTE: 閉じない引用）
```

### 3.6 `@layout` の行

`repo-map v1` §3.6 と同一。

```
layout-line = id SP layout-prop { SP layout-prop }
layout-prop = "rank=" int | "group=" group-name
int         = [ "-" ] DIGIT { DIGIT }
```

- `rank=`（整数・負可）はそのノードのランクを固定し自動算出を上書き。
- `group=`（文字列）は名前付きクラスタに割り当てる。
- `id` は定義済みノード（未定義 E-LAYOUTREF）、各 ID 高々 1 行（重複 E-LAYOUTDUP）。
- **`@layout` は位置情報のみ**。`rank=` / `group=` 以外は E-LAYOUTSEM。意味層とレイアウト層を混ぜない原則の機械的な番人。

---

## 4. 内部モデル（パーサ出力＝レンダラ入力）

パーサは 1 つの不変値を生成する。これがレンダラの読む唯一の対象。形は `repo-map v1` §4 と同型（`meta.root` が `meta.source` に、列挙が document-map のものに替わるだけ）。

```ts
type Kind     = "document" | "section" | "concept" | "requirement"
              | "decision" | "open-question" | "risk" | "actor" | "external";
type Relation = "contains" | "explains" | "depends-on" | "decides"
              | "raises" | "mitigates" | "owns" | "references" | "conflicts-with";

interface Meta  { source: string; depth: 0|1|2; focus?: string; generated: string; }
interface Node  { id: string; kind: Kind; label: string; path?: string; } // path = ref（出典ロケータ）
interface Edge  { index: number; from: string; to: string; relation: Relation; }
interface LayoutOverride { id: string; rank?: number; group?: string; }

interface DocumentMap {
  version: "document-map v1";
  meta:   Meta;
  nodes:  Map<string, Node>;          // id をキー、挿入順 = ソース順を保持
  edges:  Edge[];                     // ソース順。index が決定的タイブレーク
  layout: Map<string, LayoutOverride>;
}
```

検証後にレンダラが依拠してよい保証は `repo-map v1` §4 と同一（全 edge 端点・layout・focus が nodes に存在、nodes 反復順 = ソース順、edges は index でソース順、layout は rank/group のみ）。モデルは描画状態（座標・色）を持たない。

---

## 5. 列挙（閉じた集合）

```
kind     ∈ { document, section, concept, requirement, decision,
             open-question, risk, actor, external }
relation ∈ { contains, explains, depends-on, decides, raises,
             mitigates, owns, references, conflicts-with }
```

両者とも**閉じている**。集合外の値はパーサが致命エラー（E-BADKIND / E-BADREL）とし、黙って代替・既定化・描画してはならない。閉じた列挙だからこそ、レンダラは kind ごとに固定の色・形、relation ごとに固定の線種を、フォールバック分岐なしで割り当てられる。

### kind の使い分け（圧縮の指針）

| kind | 何を表すか |
|------|-----------|
| `document` | ドキュメント全体（タイトル・目的）。通常 1 つのルート |
| `section` | 主要セクション・章・大きな構成単位 |
| `concept` | 重要な概念・用語・モデル |
| `requirement` | 要件・仕様項目（「〜できること」「〜であること」） |
| `decision` | 決定事項（合意済み・確定した方針） |
| `open-question` | 未決事項・論点・要確認 |
| `risk` | リスク・懸念・既知の問題 |
| `actor` | 関係者・役割・担当（人・チーム・ロール） |
| `external` | 外部システム・依存先・連携サービス |

### relation の方向性（レイアウトで使用）

- **階層系** = `contains` のみ。ドキュメントの**読み筋スパイン**（document → section → concept …）を作る。**ランク決定に使い、実線**で描く。
- **依存系** = `explains` / `depends-on` / `decides` / `raises` / `mitigates` / `owns` / `references` / `conflicts-with`。論点・担当・参照・矛盾などの**横断リンク**。**ランクには影響させず、破線**で描く。

> **設計判断（意図的・調整可能）**: 縦の構成は `contains` だけで決め、`owns`/`decides`/`raises` 等は破線の横断辺にする。これにより「actor が `owns` でセクションの上に来て読み筋を乱す」ことを避け、ドキュメントの構成（目次順）が縦軸として安定して読める。所有関係を縦に見せたい特殊なビューが要るときは、`@layout rank=` で明示的に固定する（文法は変えない）。

---

## 6. 補助トークン

- **ref（出典ロケータ）**: スペースを含まない非空文字列（見出しアンカー `#id`、行範囲 `L10-42`、ページ `p.3` 等）。`@meta source:` の値のみ、出典名が実際に空白を含むときに限り空白可（非推奨・W-PATHSPACE）。レンダラは解決も走査もしない。
- **ISO 8601 タイムスタンプ**: `YYYY-MM-DDThh:mm:ssZ` または数値オフセット `±hh:mm`。不適合は W-DATEFMT（警告）。値は逐語で保持・表示する。

---

## 7. 検証規則

構文解析が成功した後に走らせる。生成側の自己チェックと描画側の入力ゲートで**同一**に使う。**エラーは描画をブロック**し、**警告はブロックしないが必ず報告**する。

### 7.1 メッセージ書式（正準）

`repo-map v1` §7.1 と同一。

```
<severity> <CODE> [line <n>]: <message> (remedy: <remedy>)
```

診断は**ソース行の昇順**、続いて全体検査、続いてコードのアルファベット順（決定的）。

### 7.2 検査一覧

コード体系は `repo-map v1` §7.2 と共通（候補列挙だけ document-map のもの）。

| コード | 重大度 | 条件 | 処方 |
|--------|--------|------|------|
| E-NOVERSION | error | 最初の非空行が `# document-map v1` でない | 先頭に `# document-map v1` を置く |
| E-BADVERSION | error | バージョンが v1 でない | このレンダラは document-map v1 のみ対応 |
| E-ORDER | error | セクション順が不正 | @meta→@nodes→@edges→@layout に並べる |
| E-DUPSECTION | error | 同じヘッダが複数回 | 重複セクションを統合する |
| E-BADSECTION | error | 未知の `@…` ヘッダ | 既知セクション名に直す／削除 |
| E-EMPTYNODES | error | `@nodes` が 0 行 | ノードを 1 つ以上追加 |
| E-INDENT | error | エントリ行が 2 スペース字下げでない／列 0 に不正内容 | 2 スペースで字下げ |
| E-DEPTHVAL | error | `depth` が {0,1,2} でない | depth を 0/1/2 に |
| E-DUPMETA | error | meta キー重複 | 各 meta キーは 1 回まで |
| E-BADMETAKEY | error | 未知 meta キー | 未知キーを削除（source/depth/focus/generated のみ） |
| E-METAMISSING | error | 必須 meta キー（source/depth/generated）が無い | 不足キーを追加する |
| E-METASYNTAX | error | meta 行が `key: value` 形式でない | `key: value` の形にする |
| E-FOCUSREF | error | `focus` が未定義 ID | 定義済みノードを指す |
| E-DUPID | error | ノード ID 重複 | ID を一意にする |
| E-IDLEN | error | ID が 64 文字超 | ID を短くする |
| E-BADID | error | id が §1 の文字集合に従わない | 先頭は英字/`_`、以降は英数・`_`・`-`・`.` のみ |
| E-BADKIND | error | kind が集合外 | document/section/concept/requirement/decision/open-question/risk/actor/external から選ぶ |
| E-NODEARITY | error | ノード行のトークン数が不正 | 複数語ラベルは引用、ref はラベル後の 1 トークン |
| E-QUOTE | error | 閉じない引用 | 引用を閉じる |
| E-EDGEARITY | error | エッジ行が 3 トークンでない | `<from> <to> <relation>` の形に |
| E-EDGEREF | error | エッジ端点が未定義 ID | ノードを定義する／ID を直す |
| E-BADREL | error | relation が集合外 | contains/explains/depends-on/decides/raises/mitigates/owns/references/conflicts-with から選ぶ |
| E-SELFEDGE | error | `from == to` | 自己辺を削除 |
| E-LAYOUTREF | error | `@layout` 行の ID が未定義 | 定義済みノードを指す／行を削除 |
| E-LAYOUTSEM | error | `@layout` 行に rank/group 以外 | @layout には rank/group のみ |
| E-LAYOUTDUP | error | 同一 ID の `@layout` 行が複数 | 各ノード 1 行まで |
| E-MAXNODES | error | ノード数 > 40 | depth を上げる／focus でスコープを絞る |
| E-MAXEDGES | error | エッジ数 > 80 | 重要度の低い関係を畳んで ≤80 に |
| E-MAXLINES | error | 有意行（空行・コメント除く）> 200 | ≤200 行に縮める |
| W-DUPEDGE | warning | 同一 (from,to,relation) の重複 | 重複辺を削除 |
| W-DEPTHEXCEED | warning | kind が depth の許す粒度より細かい（§7.4） | depth を上げる／ノードを粗くする |
| W-ORPHAN | warning | 出入りの辺が無く、単独ノードでも focus でもない | つなぐ／削除 |
| W-CYCLE | warning | 階層系（contains）に有向閉路 | 包含の循環はほぼ誤り。断ち切る |
| W-DATEFMT | warning | `generated` が ISO-8601 でない | 例 `2026-06-04T12:00:00Z` |
| W-CASECLASH | warning | 大小のみ異なる ID が 2 つ | 大小以外で区別する |
| W-CHAR | warning | エントリ行の値中にタブ | タブをスペースに |

### 7.3 循環の扱い（明示）

- **依存系の循環**（explains/depends-on/references/conflicts-with 等）は**許容・無警告**。論点どうしの相互参照や対立は普通にある。地図は現実を写す。
- **階層系の循環**（`contains`）は **W-CYCLE 警告**（致命にはしない）。レイアウトは決定的に 1 か所を断ち切って描画は成功させる。

### 7.4 depth と kind の整合（W-DEPTHEXCEED）

| depth | 意図する粒度 | W-DEPTHEXCEED を出す kind |
|-------|--------------|---------------------------|
| 0 | 俯瞰（テーマ＋大構成） | `concept`, `requirement`, `decision`, `open-question`, `risk` |
| 1 | セクション＋主要概念＋決定＋未決 | `requirement` |
| 2 | 要件＋詳細論点＋依存 | なし |

`document` / `section` / `actor` / `external` は粒度に関わらず全 depth で許可（粗いか境界ノードのため）。警告なので混在しても描画はできるが、地図を粗く保つよう促す。

### 7.5 規模の上限（具体値）

- **ノード ≤ 40**（E-MAXNODES）。40 を超えると地図の認知負荷低減を損なう。
- **エッジ ≤ 80**（E-MAXEDGES）。おおむねノードの 2 倍まで。
- **有意行 ≤ 200**（E-MAXLINES）。meta＋nodes＋edges＋layout のハード上限。

いずれもハードエラー。処方は常に「**depth を上げる／対象セクションに絞る／重要度の低い詳細を畳む**」であって、「図を大きくする」ではない。

---

## 8. 関連

- 思想・原則: [notation-core](../../notation-core/SKILL.md)
- 共有の行文法（字句・セクション・引用・@layout の正本）: [repo-map-notation/references/grammar.md](../../repo-map-notation/references/grammar.md)
- 粒度の選び方: [scope-and-depth.md](scope-and-depth.md)
- 例: [examples.md](examples.md)
- 描画規約（この文法を消費する側）: [notation-render](../../notation-render/SKILL.md)

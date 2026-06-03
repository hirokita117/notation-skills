# grammar — `repo-map v1` 正式文法（正本）

このファイルは `repo-map v1` DSL の**唯一の正本**である。文法・列挙・内部モデル・検証規則をここで定義する。生成側（`repo-map-notation`）はこれに従って出力し、描画側（[notation-render](../../notation-render/SKILL.md)）はこれを normative として読む。両者はここを再定義しない。

設計思想は [notation-core](../../notation-core/SKILL.md)。原則: 最も単純で曖昧さのない規則を選ぶ。これは認知負荷を下げる地図のための小さな言語であり、汎用グラフ言語ではない。

---

## 1. 字句（レキシカル）規則

### 1.1 ドキュメント全体

ドキュメントは UTF-8、行は LF（`\n`）区切り。LF 直前の CR（`\r\n`）は許容して除去する。最終行の改行は省略可。

ドキュメントは、**バージョンヘッダ**に続いて順序づけられた**セクション**群からなる。セクションは列 0 の `@` で始まるヘッダで導入され、各セクションの**エントリ行**は半角 2 スペースで字下げする。

### 1.2 行の分類

CR 除去後、各物理行を先頭の中身で分類する。

| 行の様子 | 種別 |
|----------|------|
| 空、または空白のみ | **空行**（破棄） |
| 先頭の非空白が `#` | **全行コメント**（破棄）。ただし最初の非空行は §1.3 のバージョンヘッダとして特別扱い |
| 列 0 が `@` で始まる | **セクションヘッダ** |
| ちょうど 2 スペース字下げ＋非空白 | **エントリ行** |
| それ以外（1 スペース・3 スペース以上・タブ字下げ・`@`/バージョン以外の列 0 内容） | **字句エラー（E-INDENT）** |

空行と全行コメントはパース前に捨てられ、意味も順序も持たない。バージョンヘッダは字句上はコメント（`#` 始まり）に見えるが、**最初の非空行だけ**を特別にバージョンヘッダとして扱う。それ以降の `#` 始まりの行は通常のコメントである。

### 1.3 字下げ

字下げは**構造的に有意だが固定**: エントリ行は**ちょうど 2 スペース**（1 段）。ネストは無い（`repo-map v1` はフラット）。3 スペース以上・1 スペース・先頭タブは E-INDENT。これにより字句解析は「セクションヘッダ（列 0）か、エントリ（列 2）か」の二択になり、深さを推測しない。

### 1.4 コメント

**全行コメントのみ**サポートする（先頭の非空白が `#` の行）。**インライン／行末コメントは無い**。エントリ行の途中に現れた `#` は通常の文字でありトークンの一部。文法説明の図でフィールド後に書かれた `#` は説明であって文法の一部ではない。

### 1.5 トークン化

エントリ行は、2 スペースの字下げを除いた後、ASCII スペース（`U+0020`）の連続で分割する。複数スペースは 1 区切りとして扱う。タブはエントリ行の値中に現れた場合 W-CHAR 警告とし、分割上はスペース扱い（字下げにタブが来た場合は E-INDENT）。例外は**引用ラベル**（§1.7）で、スペースを含んでも 1 トークンとして扱う。

### 1.6 大文字小文字

- セクションヘッダ（`@meta` `@nodes` `@edges` `@layout`）は**小文字・大小区別あり**。
- バージョンヘッダ `# repo-map v1` は**厳密一致**。
- 列挙値（`kind` / `relation`）は**小文字・大小区別あり**。`System` は同義語ではなく未知値。
- フィールドキー（`root:` `depth:` `rank=` `group=`）は**小文字・大小区別あり**。
- ノード **ID は大小区別あり**（`apiGw` ≠ `apigw`）。大小だけ違う 2 つの ID は別物だが、人間が混同するため**避ける**（W-CASECLASH 警告）。
- **ラベル**は自由文。大小は保持する。

### 1.7 `id` に使える文字

```
id        = id-start { id-cont }
id-start  = ALPHA | "_"
id-cont   = ALPHA | DIGIT | "_" | "-" | "."
ALPHA     = "a".."z" | "A".."Z"
DIGIT     = "0".."9"
```

先頭は英字かアンダースコア。以降は英数字・`_`・`-`・`.`。スペース・スラッシュ・`@`・`#`・引用符は不可。最大 64 文字（超過は E-IDLEN）。ドットを許すのは `apps.web` のようなパス由来 slug が自然に読めるため。スラッシュを除くのは、ID をパスと混同させないため。

**推奨の ID 導出**: ノードのパスを root からの相対にし、先頭の `./` を除き、`/` を `.` に、残りの不正文字を `-` に置換して小文字化する。例: `apps/web` → `apps.web`、`services/auth-api` → `services.auth-api`。同じパスは常に同じ ID を生み、地図の再生成が安定する。

---

## 2. バージョンヘッダ

```
version-header = "# repo-map v1"
```

- ドキュメントの**最初の非空行**で、列 0、`#` の後にスペース 1 個。厳密一致。
- 1 ドキュメントに 1 つ。欠如は E-NOVERSION。別バージョン（`# repo-map v2` 等）は E-BADVERSION（v1 レンダラは推測せず拒否する）。
- 正準バージョン文字列リテラルは **`repo-map v1`**。

---

## 3. セクション文法

### 3.1 セクションと順序

```
document   = version-header meta-section nodes-section edges-section [ layout-section ]
```

- 順序は固定: `@meta` → `@nodes` → `@edges` →（任意）`@layout`。違反は E-ORDER。固定順序により、パーサは前向きの状態機械で済み、地図どうしの diff も安定する。
- `@meta` `@nodes` `@edges` は**必須**。`@layout` は**任意**。
- 各ヘッダは一意。重複は E-DUPSECTION。未知ヘッダ（`@foo`）は E-BADSECTION。
- `@nodes` は 1 行以上（0 行は E-EMPTYNODES）。`@edges` は 0 行可（単一ノードや意図的に辺の無い地図は合法）。

### 3.2 `@meta` のフィールド

各行は `key: value`。

```
meta-line = key-token ":" SP value-rest
key-token = "root" | "depth" | "focus" | "generated"
```

区切りはキー直後のコロン＋スペース 1 個以上、その後が値（行末まで、前後の空白を除去）。値は分割せず逐語的に取る。最初の `:` が区切り。

| key | 必須 | 値 | 制約 |
|-----|------|----|------|
| `root` | **必須** | パス | `.` はリポジトリ直下 |
| `depth` | **必須** | 整数 | `0` / `1` / `2` のみ。他は E-DEPTHVAL |
| `focus` | 任意 | id | `@nodes` 内に存在必須。なければ E-FOCUSREF |
| `generated` | **必須** | ISO 8601 | 不正形式は W-DATEFMT（警告） |

各キーは高々 1 回。重複は E-DUPMETA、未知キーは E-BADMETAKEY。

`depth` の意味: 0 = システム全体（数個の粗いノード）、1 = パッケージ／トップ階層、2 = 範囲を絞った主要ファイル群（§ [scope-and-depth.md](scope-and-depth.md)）。

### 3.3 `@nodes` の行

```
node-line = id SP kind SP label [ SP path ]
kind      = "system" | "package" | "module" | "file-group" | "external" | "datastore"
```

- トークン 1 = `id`、トークン 2 = `kind`、続いて `label`、任意で `path`。
- `id` は §1.7 に従い、ドキュメント内で一意（重複は E-DUPID）。
- `kind` は閉じた集合（§5）。未知は E-BADKIND。
- `label` は必須・非空。`path` は任意。

### 3.4 `@edges` の行

```
edge-line = id SP id SP relation
relation  = "contains" | "imports" | "calls" | "deploys" | "reads" | "owns"
```

- ちょうど 3 トークン（`from` `to` `relation`）。過不足は E-EDGEARITY。
- `from` / `to` は `@nodes` 定義済み ID（未定義は E-EDGEREF）。
- `relation` は閉じた集合（§5）。未知は E-BADREL。
- 自己辺（`from == to`）は E-SELFEDGE。
- 辺にラベル・引用フィールドは無い（純粋な三つ組）。

### 3.5 ラベルとパスの区別（確定ルール）

**ルール: 複数語ラベルは引用で囲み、任意の path はラベル直後の唯一の裸トークンとする。引用なしのラベルは 1 語でなければならない。**

`id` と `kind` を読んだ後、残りトークン R をこう解釈する。

1. R[0] が**引用文字列**（`"..."`）なら、それが `label`。その後にトークンが 1 個なら `path`、0 個なら path 無し、2 個以上なら E-NODEARITY。
2. それ以外（R[0] が裸）なら、`label` は **R[0] の 1 語のみ**。その後にトークンが 1 個なら `path`、0 個なら path 無し、2 個以上なら E-NODEARITY（複数語ラベルは引用必須）。

**引用文字列**は ASCII ダブルクォート `"` で囲み、内部ではバックスラッシュが次の 1 文字をエスケープ（`\"`→`"`、`\\`→`\`）、他は逐語。閉じない引用は E-QUOTE。

**なぜこのルールか。** 「path は `/` や `.` を含む最後のトークン」式の推測は、ラベルが正当にドット（`v2.0` 等）を含むと誤判定し非決定的。`path=` キー方式は明快だが共通行を冗長にする。引用方式なら、必要なときだけ引用が「スペースを含む span」を導入し、トークン数を数えるだけで一意に解析できる。1 語ラベル（`web` 等、最頻）は引用不要、表示名（`"Web Frontend"`）は引用、path は常に「ラベル直後の単一トークン」。あらゆる行に唯一の解析が存在する。

有効な例:

```
web        package   "Web Frontend"     apps/web
authsvc    module    "Auth Service"     services/auth
db         datastore Postgres
queue      external  "Message Queue"
core       package   core               packages/core
```

無効な例:

```
web package Web Frontend apps/web     （E-NODEARITY: 複数語ラベルが未引用）
web package "Web Frontend" a b        （E-NODEARITY: ラベル後に 2 トークン）
web package "Web Frontend             （E-QUOTE: 閉じない引用）
```

### 3.6 `@layout` の行

```
layout-line = id SP layout-prop { SP layout-prop }
layout-prop = "rank=" int | "group=" group-name
int         = [ "-" ] DIGIT { DIGIT }
```

- `rank=`（整数、負可）はそのノードのランクを固定し、自動算出を上書きする。
- `group=`（文字列）は名前付きクラスタに割り当てる。
- ノードは rank のみ・group のみ・両方を指定できる。`@layout` に無いノードは自動ランク（[notation-render の layout-algorithm.md](../../notation-render/references/layout-algorithm.md)）と既定グループ `""`。
- `id` は定義済みノード（未定義は E-LAYOUTREF）、各 ID 高々 1 行（重複は E-LAYOUTDUP）。
- **`@layout` は位置情報のみ**。`rank=` / `group=` 以外（意味情報）が来たら E-LAYOUTSEM。意味層とレイアウト層を混ぜない原則の機械的な番人である。

---

## 4. 内部モデル（パーサ出力＝レンダラ入力）

パーサは 1 つの不変値 `RepoMap` を生成する。これがレンダラの読む唯一の対象。

```ts
type Kind     = "system" | "package" | "module" | "file-group" | "external" | "datastore";
type Relation = "contains" | "imports" | "calls" | "deploys" | "reads" | "owns";

interface Meta  { root: string; depth: 0|1|2; focus?: string; generated: string; }
interface Node  { id: string; kind: Kind; label: string; path?: string; }
interface Edge  { index: number; from: string; to: string; relation: Relation; }
interface LayoutOverride { id: string; rank?: number; group?: string; }

interface RepoMap {
  version: "repo-map v1";
  meta:   Meta;
  nodes:  Map<string, Node>;          // id をキー、挿入順 = ソース順を保持
  edges:  Edge[];                     // ソース順。index が決定的タイブレーク
  layout: Map<string, LayoutOverride>;// @layout が無ければ空
}
```

検証後にレンダラが依拠してよい保証:

1. すべての `edge.from` / `edge.to`、`layout[*].id`、`meta.focus` は `nodes` に存在する。
2. `nodes` のキーは一意で、反復順 = ソース順（あらゆる場面で最後のタイブレークに使う正準順）。
3. `edges` は `edge.index` でソース順を保持する。
4. `layout` は `rank` / `group` のみを持つ（意味フィールドを持たない）。

モデルは描画状態（座標・色）を持たない。位置は [layout-algorithm.md](../../notation-render/references/layout-algorithm.md) がこのモデルから算出する。

---

## 5. 列挙（閉じた集合）

```
kind     ∈ { system, package, module, file-group, external, datastore }
relation ∈ { contains, imports, calls, deploys, reads, owns }
```

両者とも**閉じている**。集合外の値はパーサが**致命エラー**（E-BADKIND / E-BADREL）とし、黙って代替・既定化・描画してはならない。閉じた列挙だからこそ、レンダラは kind ごとに固定の色・形、relation ごとに固定の線種を、フォールバック分岐なしで割り当てられる。

**relation の方向性（レイアウトで使用）:**

- **階層系** = `contains` / `deploys` / `owns`（親 → 子・所有者 → 被所有）。**ランク決定に使い、実線**で描く。
- **依存系** = `imports` / `calls` / `reads`（使う側 → 使われる側）。**ランクには影響させず、破線**で描く。

---

## 6. 補助トークン

- **path**: スペースを含まない非空文字列（`/` 区切りが典型、`.` 可、`.` 単体可）。`@meta root:` の値のみ、ディレクトリ名が実際に空白を含むときに限り空白可（非推奨・W-PATHSPACE）。path は説明用で、レンダラは解決も走査もしない。
- **ISO 8601 タイムスタンプ**: `YYYY-MM-DDThh:mm:ssZ` または数値オフセット `±hh:mm`。不適合は W-DATEFMT（警告）。値は逐語で保持・表示する。

---

## 7. 検証規則

構文解析が成功した後に走らせる。生成側の自己チェックと描画側の入力ゲートで**同一**に使う。**エラーは描画をブロック**し、**警告はブロックしないが必ず報告**する。

### 7.1 メッセージ書式（正準）

各診断は 1 行:

```
<severity> <CODE> [line <n>]: <message> (remedy: <remedy>)
```

- `<severity>` は `error` / `warning`（小文字）。
- `<CODE>` は安定コード（例 `E-EDGEREF`）。
- `[line <n>]` は特定行に対応するとき付け、ドキュメント全体の検査（数の上限等）では省く。
- メッセージは端的な事実、remedy は命令形の処方。

例:

```
error E-EDGEREF [line 23]: edge references undefined node 'paymentsvc' (remedy: define 'paymentsvc' in @nodes or fix the id)
warning W-ORPHAN: node 'legacycache' has no edges (remedy: connect it or remove it)
```

診断は**ソース行の昇順**、続いて全体検査、続いてコードのアルファベット順で出力する（並びも決定的）。

### 7.2 検査一覧

| コード | 重大度 | 条件 | 処方 |
|--------|--------|------|------|
| E-NOVERSION | error | 最初の非空行が `# repo-map v1` でない | 先頭に `# repo-map v1` を置く |
| E-BADVERSION | error | バージョンが v1 でない | このレンダラは v1 のみ対応 |
| E-ORDER | error | セクション順が不正 | @meta→@nodes→@edges→@layout に並べる |
| E-DUPSECTION | error | 同じヘッダが複数回 | 重複セクションを統合する |
| E-BADSECTION | error | 未知の `@…` ヘッダ | 既知セクション名に直す／削除 |
| E-EMPTYNODES | error | `@nodes` が 0 行 | ノードを 1 つ以上追加 |
| E-INDENT | error | エントリ行が 2 スペース字下げでない／列 0 に不正内容 | 2 スペースで字下げ |
| E-DEPTHVAL | error | `depth` が {0,1,2} でない | depth を 0/1/2 に |
| E-DUPMETA | error | meta キー重複 | 各 meta キーは 1 回まで |
| E-BADMETAKEY | error | 未知 meta キー | 未知キーを削除 |
| E-FOCUSREF | error | `focus` が未定義 ID | 定義済みノードを指す |
| E-DUPID | error | ノード ID 重複 | ID を一意にする |
| E-IDLEN | error | ID が 64 文字超 | ID を短くする |
| E-BADKIND | error | kind が集合外 | system/package/module/file-group/external/datastore から選ぶ |
| E-NODEARITY | error | ノード行のトークン数が不正 | 複数語ラベルは引用、path はラベル後の 1 トークン |
| E-QUOTE | error | 閉じない引用 | 引用を閉じる |
| E-EDGEARITY | error | エッジ行が 3 トークンでない | `<from> <to> <relation>` の形に |
| E-EDGEREF | error | エッジ端点が未定義 ID | ノードを定義する／ID を直す |
| E-BADREL | error | relation が集合外 | contains/imports/calls/deploys/reads/owns から選ぶ |
| E-SELFEDGE | error | `from == to` | 自己辺を削除 |
| E-LAYOUTREF | error | `@layout` 行の ID が未定義 | 定義済みノードを指す／行を削除 |
| E-LAYOUTSEM | error | `@layout` 行に rank/group 以外 | @layout には rank/group のみ |
| E-LAYOUTDUP | error | 同一 ID の `@layout` 行が複数 | 各ノード 1 行まで |
| E-MAXNODES | error | ノード数 > 40 | depth を上げる／focus で ≤40 に絞る |
| E-MAXEDGES | error | エッジ数 > 80 | 詳細を畳んで ≤80 に |
| E-MAXLINES | error | 有意行（空行・コメント除く）> 200 | ≤200 行に縮める |
| W-DUPEDGE | warning | 同一 (from,to,relation) の重複 | 重複辺を削除 |
| W-DEPTHEXCEED | warning | kind が depth の許す粒度より細かい（§7.4） | depth を上げる／ノードを粗くする |
| W-ORPHAN | warning | 出入りの辺が無く、単独ノードでも focus でもない | つなぐ／削除 |
| W-CYCLE | warning | 階層系（contains/deploys/owns）に有向閉路 | 包含の循環はほぼ誤り。断ち切る |
| W-DATEFMT | warning | `generated` が ISO-8601 でない | 例 `2026-06-03T12:00:00Z` |
| W-CASECLASH | warning | 大小のみ異なる ID が 2 つ | 大小以外で区別する |
| W-CHAR | warning | エントリ行の値中にタブ | タブをスペースに |

### 7.3 循環の扱い（明示）

- **依存系の循環**（`imports`/`calls`/`reads`）は**許容・無警告**。実在コードに普通にある（相互 import 等）ので、地図は現実を写す。
- **階層系の循環**（`contains`/`deploys`/`owns`）は **W-CYCLE 警告**（致命にはしない）。レイアウトは決定的に 1 か所を断ち切って描画は成功させる（[layout-algorithm.md](../../notation-render/references/layout-algorithm.md)）。

### 7.4 depth と kind の整合（W-DEPTHEXCEED）

| depth | 意図する粒度 | W-DEPTHEXCEED を出す kind |
|-------|--------------|---------------------------|
| 0 | システム | `module`, `file-group` |
| 1 | パッケージ／トップ階層 | `file-group` |
| 2 | 主要ファイル群 | なし |

`system` / `external` / `datastore` は粒度に関わらず全 depth で許可（粗いか境界ノードのため）。警告なので混在しても描画はできるが、地図を粗く保つよう促す。

### 7.5 規模の上限（具体値）

- **ノード ≤ 40**（E-MAXNODES）。40 を超える箱は地図の認知負荷低減を損なう。
- **エッジ ≤ 80**（E-MAXEDGES）。おおむねノードの 2 倍まで。超えると毛玉になる。
- **有意行 ≤ 200**（E-MAXLINES）。meta＋nodes＋edges＋layout のハード上限。

いずれもハードエラーである。処方は常に「**depth を上げる／範囲を絞る／詳細を畳む**」であって、「絵を大きくする」ではない。

---

## 8. 関連

- 思想・原則: [notation-core](../../notation-core/SKILL.md)
- 粒度の選び方: [scope-and-depth.md](scope-and-depth.md)
- 例: [examples.md](examples.md)
- 描画規約（この文法を消費する側）: [notation-render](../../notation-render/SKILL.md)

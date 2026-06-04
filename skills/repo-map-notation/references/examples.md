# examples — `repo-map v1` の入出力例

**架空**のリポジトリを題材に、「入力状況 → 出力 DSL 全文」を 4 例示す。実在 OSS の写しではない。いずれも [grammar.md](grammar.md) の検証規則（未定義参照ゼロ、ノード ≤ 40・エッジ ≤ 80、depth と種別の整合、循環なし）を通過する。各例は [view-patterns.md](view-patterns.md) のどのビューを使っているかを併記する——**同じ固定文法でも、選ぶ `relation` と `focus`/`@layout` で別物の地図になる**ことを示すためである。

---

## 例 A — モノレポ俯瞰（depth 1・8 ノード／Monorepo Workspace View）

**状況。** 製品「Acme Platform」のモノレポ。Web アプリとモバイルアプリが共有コアパッケージを使い、バックエンドに認証・課金の 2 サービス、永続化に DB、外部にメール配信 SaaS がある。「アプリとサービスが何を共有し、誰が DB とメールを使うか」を一目で見たい。

**出力 DSL:**

```text
# repo-map v1
@meta
  root: .
  depth: 1
  focus: core
  generated: 2026-06-03T09:00:00Z

@nodes
  monorepo  system    "Acme Platform"
  web       package   "Web App"          apps/web
  mobile    package   "Mobile App"       apps/mobile
  core      package   "Shared Core"      packages/core
  authsvc   package   "Auth Service"     services/auth
  billsvc   package   "Billing Service"  services/billing
  db        datastore Postgres
  email     external  "Email Provider"

@edges
  monorepo  web      contains
  monorepo  mobile   contains
  monorepo  core     contains
  monorepo  authsvc  contains
  monorepo  billsvc  contains
  web       core     imports
  mobile    core     imports
  authsvc   core     imports
  billsvc   core     imports
  authsvc   db       reads
  billsvc   db       reads
  billsvc   email    calls
```

**描画されると（notation-render で）:** 最上段に暗色の `monorepo`、次段に 5 つの package（web / mobile / core / authsvc / billsvc）が `contains` の実線でぶら下がる。`core` は amber の focus 枠が付き、アプリとサービスから `imports` の破線が収束する。下段に `db`（紫）と `email`（灰）が置かれ、`reads` / `calls` の破線が伸びる——「すべてが core に依存し、課金だけがメールを呼ぶ」が一目で読める地図になる。

---

## 例 B — 1 サービスの深掘り（depth 2・9 ノード／Request Flow View）

**状況。** 例 A の認証サービスの内部を詳しく見たい。範囲を `services/auth` に絞り、内部のファイル群（ハンドラ・ユースケース・リポジトリ・トークン・設定）と、直近の依存先（DB・キャッシュ・外部 OAuth）を depth 2 で描く。

**出力 DSL:**

```text
# repo-map v1
@meta
  root: services/auth
  depth: 2
  focus: handlers
  generated: 2026-06-03T09:30:00Z

@nodes
  authsvc   package    "Auth Service"     services/auth
  handlers  file-group "HTTP Handlers"    src/handlers
  usecases  file-group "Use Cases"        src/usecases
  repo      file-group "Repositories"     src/repo
  tokens    module     "Token Library"    src/tokens
  config    file-group Config             src/config
  db        datastore  Postgres
  cache     datastore  Redis
  oauth     external   "OAuth Provider"

@edges
  authsvc   handlers  contains
  authsvc   usecases  contains
  authsvc   repo      contains
  authsvc   tokens    contains
  authsvc   config    contains
  handlers  usecases  calls
  usecases  repo      calls
  usecases  tokens    imports
  repo      db        reads
  repo      cache     reads
  handlers  oauth     calls
  tokens    config    imports
```

**描画されると:** 最上段に `authsvc`（青）、その下に 5 つの内部ノードが `contains` の実線で並ぶ。リクエストの流れは `calls` の破線で handlers → usecases → repo と上から下へ読め、`handlers` に focus 枠が付く。`repo` から 2 つの紫の datastore（Postgres・Redis）へ `reads` が分岐し、`handlers` は外部 `oauth`（灰）を `calls` する——1 サービスの内部構成が、ファイル群の粒度で整然と見える。

---

## 例 C — データ所有の俯瞰（depth 1・9 ノード／Data Ownership View）

**状況。** EC「Shop Platform」が注文・カタログ・決済の 3 サービスに分かれている。各サービスは自分の DB を持つが、ユーザー情報の `shareddb` は決済が所有し、注文サービスがそれを**越境して読んでいる**。「どのサービスがどのデータを所有し、どこに越境参照があるか」を一目で見たい。例 A/B では使わない `owns` を主役に、`reads` を越境参照として描き分ける。

**出力 DSL:**

```text
# repo-map v1
@meta
  root: .
  depth: 1
  focus: shareddb
  generated: 2026-06-04T10:00:00Z

@nodes
  shop      system    "Shop Platform"
  orders    package   "Order Service"     services/orders
  catalog   package   "Catalog Service"   services/catalog
  payments  package   "Payment Service"   services/payments
  ordersdb  datastore "Orders DB"
  catalogdb datastore "Catalog DB"
  shareddb  datastore "Shared User DB"
  cache     datastore Redis
  psp       external  "Payment Gateway"

@edges
  shop      orders    contains
  shop      catalog   contains
  shop      payments  contains
  orders    ordersdb  owns
  catalog   catalogdb owns
  payments  shareddb  owns
  catalog   cache     owns
  orders    shareddb  reads
  orders    cache     reads
  payments  psp       calls

@layout
  orders    group=orders
  ordersdb  group=orders
  catalog   group=catalog
  catalogdb group=catalog
  payments  group=payments
  shareddb  group=payments
```

**描画されると:** `shop` 配下に 3 サービスが `contains` で並び、各サービスは自分の datastore へ `owns` の実線を引く（所有者が上、データが下のランク）。`group=` で「サービス＋その所有データ」が区画化され、`payments` が所有する `shareddb`（amber の focus 枠）へ `orders` が **group をまたいで** `reads` の破線を伸ばす——越境参照が境界を飛び出す形で読める。`catalog` 所有の `cache` を `orders` が読むのも同様に見え、「所有 vs 越境利用」が一目で分かる地図になる。

---

## 例 D — デプロイ構成（depth 1・8 ノード／Deployment View）

**状況。** 同じ Shop Platform を運用視点で見る。本番クラスタ `prod` に web・API・worker の 3 サービスが載り、共有 DB とジョブキューを使い、外部に CDN とメール配信がある。「何がどこに配置され、どの DB／外部に依存するか」を見たい。例 A〜C では使わない `deploys` を主役にする（配置先 `system` → 配置物 `package`）。

**出力 DSL:**

```text
# repo-map v1
@meta
  root: .
  depth: 1
  focus: prod
  generated: 2026-06-04T10:30:00Z

@nodes
  prod      system    "Prod Cluster"
  web       package   "Web App"           apps/web
  api       package   "API Service"       services/api
  worker    package   "Background Worker"  services/worker
  maindb    datastore Postgres
  queue     datastore "Job Queue"
  cdn       external  "CDN"
  mail      external  "Email Provider"

@edges
  prod      web       deploys
  prod      api       deploys
  prod      worker    deploys
  api       maindb    reads
  worker    maindb    reads
  worker    queue     reads
  api       queue     reads
  web       cdn       calls
  worker    mail      calls

@layout
  web       group=runtime
  api       group=runtime
  worker    group=runtime
```

**描画されると:** `prod` クラスタ（system）が 3 つの配置物へ `deploys` の実線を引き、`deploys` は階層系なので「環境が上、配置物が下」のランクを作る。配置物は `group=runtime` で 1 段に横並びし、そこから `maindb`・`queue` への `reads` と外部 `cdn`・`mail` への `calls` が破線で下方／外へ伸びる。`prod` の focus 枠が「ここが配置元」を示し、「何がどこに載り、どの DB／外部を使うか」が 1 枚で読める。同じ構成でも、`deploys` ではなく `contains` を主役にすれば例 A のような論理構成図（Monorepo Workspace View）になる——**relation の選択がビューを決める**。

---

## この 4 例が検証を通る理由（自己チェックの実演）

| 観点 | 例 A | 例 B | 例 C | 例 D |
|------|------|------|------|------|
| ビュー | Monorepo Workspace | Request Flow | Data Ownership | Deployment |
| 先頭行・セクション順 | OK | OK | OK | OK |
| 必須 meta（root/depth/generated） | OK | OK | OK | OK |
| focus が存在 | `core` ✓ | `handlers` ✓ | `shareddb` ✓ | `prod` ✓ |
| 未定義参照 | なし | なし | なし | なし |
| ID 重複・自己辺 | なし | なし | なし | なし |
| kind/relation が集合内 | OK | OK | `owns`/`reads` を含む ✓ | `deploys` を含む ✓ |
| 複数語ラベルの引用 | `"Web App"` 等 ✓ | `"HTTP Handlers"` 等 ✓ | `"Shared User DB"` 等 ✓ | `"Prod Cluster"` 等 ✓ |
| ノード ≤ 40 / エッジ ≤ 80 | 8 / 12 | 9 / 12 | 9 / 10 | 8 / 9 |
| depth と種別の整合 | depth1 に module/file-group なし ✓ | depth2 は全種別可 ✓ | depth1 に module/file-group なし ✓ | depth1 に module/file-group なし ✓ |
| 階層系の循環 | なし | なし | なし（`owns` 含む） | なし（`deploys` 含む） |

4 例とも提出前にこの表（= [grammar.md](grammar.md) §7 の要点）を通している。生成側は常にこの自己チェックを経てから DSL を出す。**例 A〜D は同じ閉じた文法でありながら、主役にする `relation`（`contains` / `calls` / `owns` / `deploys`）と `focus`・`@layout` の使い方だけで別物の地図になっている**——これがビュー選択（[view-patterns.md](view-patterns.md)）の効果である。

## 関連
- 文法・検証: [grammar.md](grammar.md)
- 範囲と深度: [scope-and-depth.md](scope-and-depth.md)
- ビューパターン（各例がどのビューか）: [view-patterns.md](view-patterns.md)
- これらの DSL を図にする: [notation-render](../../notation-render/SKILL.md)

# examples — `repo-map v1` の入出力例

**架空**のリポジトリを題材に、「入力状況 → 出力 DSL 全文」を 2 例示す。実在 OSS の写しではない。いずれも [grammar.md](grammar.md) の検証規則（未定義参照ゼロ、ノード ≤ 40・エッジ ≤ 80、depth と種別の整合、循環なし）を通過する。

---

## 例 A — モノレポ俯瞰（depth 1・8 ノード）

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

## 例 B — 1 サービスの深掘り（depth 2・9 ノード）

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

## この 2 例が検証を通る理由（自己チェックの実演）

| 観点 | 例 A | 例 B |
|------|------|------|
| 先頭行・セクション順 | OK | OK |
| 必須 meta（root/depth/generated） | OK | OK |
| focus が存在 | `core` ✓ | `handlers` ✓ |
| 未定義参照 | なし | なし |
| ID 重複・自己辺 | なし | なし |
| kind/relation が集合内 | OK | OK |
| 複数語ラベルの引用 | `"Web App"` 等 ✓ | `"HTTP Handlers"` 等 ✓ |
| ノード ≤ 40 / エッジ ≤ 80 | 8 / 12 | 9 / 12 |
| depth と種別の整合 | depth1 に module/file-group なし ✓ | depth2 は全種別可 ✓ |
| 階層系の循環 | なし | なし |

どちらも提出前にこの表（= [grammar.md](grammar.md) §7 の要点）を通している。生成側は常にこの自己チェックを経てから DSL を出す。

## 関連
- 文法・検証: [grammar.md](grammar.md)
- 範囲と深度: [scope-and-depth.md](scope-and-depth.md)
- これらの DSL を図にする: [notation-render](../../notation-render/SKILL.md)

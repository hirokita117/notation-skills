# examples — ドキュメント → `document-map v1` 出力例

文法は [grammar.md](grammar.md)。ここでは典型的なドキュメントを 3 つの depth で地図化した**完全な出力 DSL**を示す。3 例で 9 種の kind と 9 種の relation をすべて使う。値は説明用の架空ドキュメント。

> いずれも全文要約ではなく、**構造・論点・関係の圧縮**であることに注意。本文の言い換えは載せていない。

---

## 例 A — PRD を depth 1 で論点マップ化

**ドキュメント**: 通知基盤の PRD。**成功条件**: 主要セクション・決定事項・未決事項・リスク・担当が 1 枚で分かる。**depth 1**（セクション＋概念＋決定＋未決。個別要件はまだ出さない）。

```
# document-map v1
@meta
  source: docs/prd-notifications.md
  depth: 1
  focus: questions
  generated: 2026-06-04T09:00:00Z

@nodes
  doc          document      "PRD: 通知基盤"            docs/prd-notifications.md
  goals        section       "目的とゴール"             #goals
  scope        section       "スコープ"                 #scope
  delivery     section       "配信チャネル"             #delivery
  decisions    section       "決定事項"                 #decisions
  questions    section       "未決事項"                 #open
  multichannel concept       "マルチチャネル配信"
  d-push       decision      "まず Push のみで MVP"
  d-vendor     decision      "配信は外部ベンダー利用"
  q-mvp        open-question "MVP に何を含めるか"
  q-sla        open-question "SLA は 99.9% で足りるか"
  q-i18n       open-question "多言語対応はいつやるか"
  risk-vendor  risk          "ベンダーロックイン"
  slack        external      Slack
  push         external      "Push (APNs/FCM)"
  pm           actor         PM
  eng          actor         "Eng リード"

@edges
  doc          goals        contains
  doc          scope        contains
  doc          delivery     contains
  doc          decisions    contains
  doc          questions    contains
  delivery     multichannel explains
  delivery     push         references
  delivery     slack        references
  decisions    d-push       contains
  decisions    d-vendor     contains
  questions    q-mvp        contains
  questions    q-sla        contains
  questions    q-i18n       contains
  d-push       q-mvp        decides
  d-vendor     risk-vendor  raises
  q-sla        d-vendor     depends-on
  pm           decisions    owns
  eng          delivery     owns
```

**読み方**: `contains` が縦の構成（PRD → 各セクション → 決定/未決）を作る。横断辺は破線——決定が未決を解消（`decides`）、ベンダー決定がリスクを生む（`raises`）、未決が決定に依存（`depends-on`）、担当（`owns`）。`focus: questions` で未決事項セクションを強調。ノード 17・エッジ 18・depth 1 整合（requirement を出していない）で検証を通る。

---

## 例 B — 設計書の 1 セクションを depth 2 で深掘り

**ドキュメント**: 認証設計書の「認証フロー」セクションだけ。**成功条件**: 要件・依存・リスクと緩和策が分かる。**depth 2**（要件 requirement と依存 depends-on まで）。**全体ではなくセクションに絞る**のが要点。

```
# document-map v1
@meta
  source: docs/design-auth.md#auth-flow
  depth: 2
  focus: r-mfa
  generated: 2026-06-04T10:00:00Z

@nodes
  auth      section       "認証フロー"            #auth-flow
  login     concept       "ログイン処理"
  session   concept       "セッション管理"
  r-mfa     requirement   "MFA 必須"
  r-sso     requirement   "SSO 連携 (SAML)"
  r-expiry  requirement   "セッション有効期限 24h"
  r-revoke  requirement   "即時失効できる"
  q-legacy  open-question "旧ログインの移行方法"
  risk-lock risk          "MFA 必須でロックアウト増"
  idp       external      "IdP (Okta)"
  d-mfa     decision      "MFA は TOTP + SMS"

@edges
  auth      login     contains
  auth      session   contains
  login     r-mfa     contains
  login     r-sso     contains
  session   r-expiry  contains
  session   r-revoke  contains
  r-sso     idp       depends-on
  r-mfa     idp       depends-on
  r-mfa     risk-lock raises
  d-mfa     r-mfa     decides
  d-mfa     risk-lock mitigates
  r-revoke  r-expiry  depends-on
  login     q-legacy  raises
```

**読み方**: セクション → 概念 → 要件 の `contains` 縦構成。要件が IdP に依存（`depends-on`）、MFA 要件がロックアウトリスクを生み（`raises`）、決定がそれを緩和（`mitigates`）かつ要件を確定（`decides`）。`source` にセクションアンカー `#auth-flow` を付けて範囲を明示。depth 2 なので requirement を出してよい。

---

## 例 C — 議事録を depth 1 で関係図化

**ドキュメント**: ロードマップ会議の議事録。**成功条件**: 決定・未決・リスクと担当、対立する論点が分かる。**depth 1**。担当 actor を `@layout` で上段にまとめる。

```
# document-map v1
@meta
  source: notes/2026-06-03-roadmap.md
  depth: 1
  generated: 2026-06-04T11:00:00Z

@nodes
  mtg         document      "ロードマップ会議 2026-06-03"  notes/2026-06-03-roadmap.md
  topic-q3    section       "Q3 優先度"                #q3
  topic-infra section       "インフラ刷新"              #infra
  d-mobile    decision      "Q3 はモバイル優先"
  d-infra     decision      "インフラ刷新は Q4 に延期"
  alt-infra   concept       "インフラ先行案"
  q-hiring    open-question "採用は間に合うか"
  risk-debt   risk          "技術的負債の累積"
  pm          actor         PM
  sre         actor         SRE
  cto         actor         CTO

@edges
  mtg         topic-q3    contains
  mtg         topic-infra contains
  topic-q3    d-mobile    contains
  topic-infra d-infra     contains
  topic-infra alt-infra   contains
  d-infra     risk-debt   raises
  alt-infra   d-infra     conflicts-with
  d-mobile    q-hiring    raises
  q-hiring    d-mobile    depends-on
  pm          d-mobile    owns
  sre         topic-infra owns
  cto         d-infra     owns

@layout
  pm rank=0 group=owners
  sre rank=0 group=owners
  cto rank=0 group=owners
```

**読み方**: 議事録 → 論点セクション → 決定 の `contains`。先行案が延期決定と対立（`conflicts-with`）、決定がリスク・未決を提起（`raises`）、未決が決定に依存（`depends-on`）、担当（`owns`）。`@layout` で 3 人の担当を rank 0・同一グループに固定し、上段にまとめて読みやすくしている（意味は変えず配置だけ）。

---

## 検証の自己チェック（3 例共通）

| 観点 | 例 A / B / C |
|------|--------------|
| 先頭 `# document-map v1`、`@meta`→`@nodes`→`@edges`→（任意）`@layout` 順 | ✓ |
| `@meta` に source / depth / generated | ✓ |
| 全 edge の from/to が @nodes に存在・id 重複なし・自己辺なし | ✓ |
| kind / relation が許可集合のみ | ✓（9 kind・9 relation を 3 例で網羅） |
| depth と粒度が整合（requirement は depth 2 の例 B のみ） | ✓ |
| ノード ≤ 40・エッジ ≤ 80・有意行 ≤ 200 | ✓ |
| 孤立ノードなし（全ノードが何かに接続） | ✓ |

---

## 関連

- 文法・検証（正本）: [grammar.md](grammar.md)
- 範囲・深度の選び方: [scope-and-depth.md](scope-and-depth.md)
- 描画（この DSL を図にする）: [notation-render](../../notation-render/SKILL.md)

# document-map v1
# story: PRD を depth 1 で論点マップ化
# desc: 通知基盤 PRD の主要セクション・決定・未決・リスク・担当を 1 枚に
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

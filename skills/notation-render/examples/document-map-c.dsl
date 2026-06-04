# document-map v1
# story: 議事録を depth 1 で関係図化（@layout で担当を上段に）
# desc: 決定・未決・リスクと担当、対立する論点（conflicts-with / owns / @layout）
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

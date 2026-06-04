# scope-and-depth — 範囲（source）と深度（0/1/2）の選び方

`document-map v1` の大きさは **2 つの軸**で決まる。地図が大きすぎる／的外れになる失敗は、ほぼここの選択ミスに由来する。

- **範囲（source）**: ドキュメント全体か、特定セクションか。
- **深度（depth）**: どの粒度まで掘るか（0 / 1 / 2）。

原則は **「全体を深く」ではなく「範囲を狭めて深く」**。大きなドキュメント全体を depth 2 にしない。

---

## 深度の定義

| depth | 何を出すか | 主な kind | 出さないもの |
|-------|-----------|-----------|--------------|
| **0** | ドキュメント全体の俯瞰。主要テーマと大きな構成だけ | document / section（＋必要なら actor / external） | 個別の要件・決定・未決・リスク |
| **1** | 構成と論点の地図。セクション・主要概念・決定事項・未決事項 | section / concept / decision / open-question（＋ risk / actor / external） | 細かい個別要件（requirement） |
| **2** | 特定セクションの詳細。論点・要件・依存関係 | requirement / concept / open-question / risk | 対象外セクションの詳細 |

迷ったら **depth 1**。

---

## 範囲の選び方（4 ステップ）

1. **読者と成功条件を決める**。「何が分かれば成功か」を 1 文で（例: 「決定事項と未決事項、各セクションの担当が一目で分かる」）。
2. **まず depth 0 か 1 で全体を出す**。ドキュメントが大きい（長い仕様書・複数章）なら depth 0 で俯瞰、中規模なら depth 1。
3. **深掘りが要るセクションを 1 つ選ぶ**。全体ではなく、論点が集中する 1 セクションに絞る。
4. **そのセクションだけ depth 2 で出し直す**（全量置換）。`@meta source` を対象セクションに、`depth: 2` に。

---

## ドキュメント類型別ガイド

| 類型 | まずどう出すか | よく使う kind | 深掘りの当て先 |
|------|----------------|---------------|----------------|
| **PRD / 要件定義** | depth 1。目的・主要機能セクション・決定・未決・リスク | section / requirement / decision / open-question / risk | 論点が割れている機能 1 つを depth 2（要件・依存・未決） |
| **仕様書 / 設計書** | depth 0〜1。全体構成 → 主要コンポーネント概念・決定 | section / concept / decision / depends-on | 1 コンポーネント／1 章を depth 2（要件・依存・リスク） |
| **議事録 / 会議メモ** | depth 1。論点ごとに decision / open-question / risk と担当（owns） | decision / open-question / risk / actor | 持ち越し論点 1 つを depth 2 |
| **README** | depth 0〜1。概要・主要セクション・外部依存 | document / section / external / concept | セットアップ等 1 セクションを depth 2 |
| **設計提案 / RFC** | depth 1。提案・代替案・決定・未決・トレードオフ | concept / decision / open-question / conflicts-with | 争点（conflicts-with）の周辺を depth 2 |

---

## よくある失敗と対処

| 症状 | 原因 | 対処 |
|------|------|------|
| ノードが 40 を超える（E-MAXNODES） | 全文を網羅しようとした | depth を下げる／対象セクションに絞る／近い項目をまとめる |
| 全文要約になっている | 文章を写している | 構造・論点・関係だけに圧縮する。本文の言い換えは載せない |
| depth 0 なのに要件・決定が並ぶ（W-DEPTHEXCEED） | 粒度の不一致 | depth を 1/2 に上げる、または粗いノードにまとめる |
| 図が毛玉（エッジ過多・E-MAXEDGES） | 関係を全部引いた | 重要な関係だけ残す。`contains` の縦構成＋主要な横断辺に絞る |
| 何が言いたい地図か不明 | 成功条件を決めずに作った | STEP 0 の「何が分かれば成功か」から逆算してノード・関係を選ぶ |

---

## 関連

- 文法・検証（正本）: [grammar.md](grammar.md)
- 手順全体: [SKILL.md](../SKILL.md)
- 例: [examples.md](examples.md)

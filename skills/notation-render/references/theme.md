# theme — 固定テーマ定数（色・フォント）

`emit`／描画段で図の見た目を固定するテーマ定数を定める。テーマは 1 つに固定する。地図ごとの色選びはしない。座標・帯順を決める決定的アルゴリズムは [layout-algorithm.md](layout-algorithm.md)、寸法定数（`NODE_W` 等）はそちらの §4。

---

## kind ごとの箱の塗り（repo-map v1）

| kind | 塗り hex | 文字色 |
|------|----------|--------|
| system | `#1F2937` | 白 |
| package | `#2563EB` | 白 |
| module | `#0EA5E9` | 白 |
| file-group | `#14B8A6` | 白 |
| external | `#9CA3AF` | 濃灰 `#111827`（コントラスト確保） |
| datastore | `#7C3AED` | 白 |

## kind ごとの箱の塗り（document-map v1）

repo-map のパレット（slate/blue/cyan/teal/grey/violet）と整合させつつ、9 種を識別できるよう amber/red/emerald を足す。境界=灰（external）は repo-map と同じ意味付け。

| kind | 塗り hex | 文字色 |
|------|----------|--------|
| document | `#1F2937` | 白 |
| section | `#2563EB` | 白 |
| concept | `#0EA5E9` | 白 |
| requirement | `#14B8A6` | 白 |
| decision | `#7C3AED` | 白 |
| open-question | `#D97706` | 白（focus 枠 `#F59E0B` とは別色） |
| risk | `#DC2626` | 白 |
| actor | `#059669` | 白 |
| external | `#9CA3AF` | 濃灰 `#111827` |

実装は `scripts/theme.mjs`（repo-map=`kindFill`/`kindText`、document-map=`documentMapKindFill`/`documentMapKindText`）。どちらを使うかは `scripts/profiles.mjs` のプロファイルが持つ。共通定数（エッジ色・フォント・寸法）は両版で同じ。

## 共通定数

```
EDGE_COLOR      = #4B5563      （全エッジ共通）
EDGE_DEP_DASH   = "4 3"        （依存系 imports/calls/reads は破線）
EDGE_HIER       = 実線          （階層系 contains/deploys/owns は実線）
ARROW           = #4B5563 の塗り三角・8px（to 端）
BACKGROUND      = #FFFFFF
NODE_STROKE     = #111827 1px
NODE_RADIUS     = 8px（角丸）
FOCUS_STROKE    = #F59E0B 3px（focus ノードの枠）
FONT_FAMILY     = "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
FONT_SIZE_LABEL = 13px（ラベル）
FONT_SIZE_ID    = 10px（ラベル下に薄く ID を表示）
FONT_SIZE_LEGEND= 12px
```

- 箱は `NODE_W × NODE_H`（160×48）、ラベルを中央、その下に小さく ID。
- 文字が `NODE_W − 16px` を超えたら末尾を省略（…）。省略は文字列だけの関数なので決定的。
- **線種で階層 / 依存を見分ける**（色を増やさずに 2 種を区別）。階層系=実線、依存系=破線。分類は版で異なる: repo-map は実線=`contains/deploys/owns`・破線=`imports/calls/reads`、document-map は実線=`contains`・破線=その他 8 関係（explains/depends-on/decides/raises/mitigates/owns/references/conflicts-with）。

## 関連
- 決定的レイアウト（座標・帯順・寸法定数）: [layout-algorithm.md](layout-algorithm.md)
- 出力形式（このテーマで HTML を出す）: [output-formats.md](output-formats.md)
- 内部モデル: [grammar.md §4](../../repo-map-notation/references/grammar.md)

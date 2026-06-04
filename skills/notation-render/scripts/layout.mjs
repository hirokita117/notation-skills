// layout — 決定的レイアウト（layout-algorithm.md の実装・決定性の核）
//
// computeLayout(repoMap) は RepoMap の純関数。座標・帯順・エッジ端点は、いつ・何度走らせても一致する。
// あらゆる並び替えは正準順（ノードのソース順 srcIndex / エッジの index）で終わる全順序。
// 乱数・時刻・ヒューリスティックのブレを持ち込まない。grammar.md §4 のモデルを入力に取る。

import { resolveProfile } from "./profiles.mjs";
import { DIMS } from "./theme.mjs";

const { NODE_W, NODE_H, H_GAP, V_GAP, MARGIN } = DIMS;

/**
 * 検証済みモデルから座標を算出する。階層/依存の分類だけがバージョンで異なるのでプロファイルを使う
 * （未指定なら model.version から解決）。座標計算・幾何は両バージョン共通。
 * @returns {{
 *   nodes: Map<string,{x:number,y:number,rank:number,slot:number,group:string}>,
 *   edges: {index:number,from:string,to:string,relation:string,dashed:boolean,x1:number,y1:number,x2:number,y2:number}[],
 *   canvas: {w:number,h:number},
 *   focus: string|undefined
 * }}
 */
export function computeLayout(repoMap, profile) {
  const p = resolveProfile(profile, repoMap);
  const ids = [...repoMap.nodes.keys()]; // ソース順
  const srcIndex = new Map(ids.map((id, i) => [id, i]));

  const rank = computeRanks(repoMap, ids, p);
  const { slot, group } = assignSlots(repoMap, ids, srcIndex, rank);

  // 座標
  const nodes = new Map();
  for (const id of ids) {
    const r = rank.get(id);
    const s = slot.get(id);
    nodes.set(id, {
      x: MARGIN + s * (NODE_W + H_GAP),
      y: MARGIN + r * (NODE_H + V_GAP),
      rank: r,
      slot: s,
      group: group.get(id),
    });
  }

  // キャンバス
  let maxRank = 0;
  let maxSlots = 1;
  const bandCount = new Map();
  for (const id of ids) {
    const r = rank.get(id);
    if (r > maxRank) maxRank = r;
    bandCount.set(r, (bandCount.get(r) ?? 0) + 1);
  }
  for (const c of bandCount.values()) if (c > maxSlots) maxSlots = c;
  const canvas = {
    w: MARGIN * 2 + maxSlots * (NODE_W + H_GAP) - H_GAP,
    h: MARGIN * 2 + (maxRank + 1) * (NODE_H + V_GAP) - V_GAP,
  };

  // エッジ端点（index 順・直線）
  const edges = repoMap.edges.map((e) => {
    const ep = routeEdge(nodes.get(e.from), nodes.get(e.to), rank.get(e.from), rank.get(e.to));
    return { index: e.index, from: e.from, to: e.to, relation: e.relation, dashed: p.isDependency(e.relation), ...ep };
  });

  return { nodes, edges, canvas, focus: repoMap.meta.focus };
}

// --- ランク割り当て（layout-algorithm.md §2） ---

function computeRanks(repoMap, ids, profile) {
  // (1) 階層系エッジのみ（index 順）。自己辺は除外。
  const hierEdges = repoMap.edges.filter((e) => profile.isHierarchy(e.relation) && e.from !== e.to);

  // (2) 決定的フィードバックアーク除去（index 昇順に、閉路を閉じる辺を落とす）
  const keptAdj = new Map(ids.map((id) => [id, []]));
  for (const e of hierEdges) {
    if (!keptAdj.has(e.from) || !keptAdj.has(e.to)) continue;
    if (reaches(keptAdj, e.to, e.from)) continue; // from->to を足すと閉路 → 落とす（描画はする）
    keptAdj.get(e.from).push(e.to);
  }

  // (3) 始点からの最長路（Kahn トポ順・ready は srcIndex 最小から）
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const [u, succ] of keptAdj) for (const v of succ) indeg.set(v, indeg.get(v) + 1);
  const topo = kahnTopo(ids, keptAdj, indeg);
  const rank = new Map(ids.map((id) => [id, 0]));
  for (const u of topo) {
    for (const v of keptAdj.get(u)) {
      if (rank.get(u) + 1 > rank.get(v)) rank.set(v, rank.get(u) + 1);
    }
  }

  // (4) 明示 rank= 上書き（ノードのソース順で適用＝結果は順序非依存だが固定）
  for (const id of ids) {
    const ov = repoMap.layout.get(id);
    if (ov && ov.rank !== undefined) rank.set(id, ov.rank);
  }

  // (5) 孤立・依存のみノード: 階層系辺に一切触れず・rank= 無しなら、edges を index 順に 1 パス走査し
  //     「自分（=to）を指す依存元（=from）のランクの最大 + 1」。to は外部 API/datastore 等で、消費側の下に収まる。
  const touchedByHier = new Set();
  for (const e of hierEdges) { touchedByHier.add(e.from); touchedByHier.add(e.to); }
  const hasOverride = (id) => { const ov = repoMap.layout.get(id); return !!ov && ov.rank !== undefined; };
  for (const e of repoMap.edges) {
    if (!profile.isDependency(e.relation)) continue;
    const cand = e.to;
    if (touchedByHier.has(cand) || hasOverride(cand)) continue;
    if (!rank.has(cand) || !rank.has(e.from)) continue;
    rank.set(cand, Math.max(rank.get(cand), rank.get(e.from) + 1));
  }

  // (6) 負ランクの正規化（最小ランク < 0 なら全体を平行移動して最上段を 0 に）
  let minRank = Infinity;
  for (const r of rank.values()) if (r < minRank) minRank = r;
  if (minRank < 0 && minRank !== Infinity) {
    for (const id of ids) rank.set(id, rank.get(id) - minRank);
  }

  return rank;
}

/** kept グラフ上で src から dst に到達できるか（到達可否のみ・順序非依存で決定的）。 */
function reaches(adj, src, dst) {
  if (src === dst) return true;
  const visited = new Set([src]);
  const stack = [src];
  while (stack.length) {
    const u = stack.pop();
    for (const v of adj.get(u) || []) {
      if (v === dst) return true;
      if (!visited.has(v)) { visited.add(v); stack.push(v); }
    }
  }
  return false;
}

/** Kahn のトポロジカル順序。ready 集合からは常に srcIndex 最小のノードを取り出す（ids がソース順）。 */
function kahnTopo(ids, keptAdj, indeg) {
  const deg = new Map(indeg);
  const emitted = new Set();
  const order = [];
  while (order.length < ids.length) {
    let pick = null;
    for (const id of ids) { // ids はソース順 = srcIndex 昇順
      if (!emitted.has(id) && deg.get(id) === 0) { pick = id; break; }
    }
    if (pick === null) break; // kept は DAG なので通常起きない（防御）
    emitted.add(pick);
    order.push(pick);
    for (const v of keptAdj.get(pick)) deg.set(v, deg.get(v) - 1);
  }
  return order;
}

// --- 帯内グルーピングとスロット（layout-algorithm.md §3） ---

function assignSlots(repoMap, ids, srcIndex, rank) {
  const groupOf = (id) => { const ov = repoMap.layout.get(id); return ov && ov.group !== undefined ? ov.group : ""; };

  // グループ順: 空でない group 名を Unicode コードポイント順、既定 "" は常に最後
  const groupNames = [];
  const seen = new Set();
  for (const id of ids) {
    const g = groupOf(id);
    if (g !== "" && !seen.has(g)) { seen.add(g); groupNames.push(g); }
  }
  groupNames.sort(codepointCompare);
  const groupOrderIndex = new Map();
  groupNames.forEach((g, i) => groupOrderIndex.set(g, i));
  groupOrderIndex.set("", groupNames.length);

  const group = new Map(ids.map((id) => [id, groupOf(id)]));

  // 帯ごとにノードを集め（ソース順）、(グループ順, srcIndex) で並べてスロットを 0 から振る
  const byRank = new Map();
  for (const id of ids) {
    const r = rank.get(id);
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r).push(id);
  }
  const slot = new Map();
  for (const [, band] of byRank) {
    band.sort((a, b) => {
      const ga = groupOrderIndex.get(group.get(a));
      const gb = groupOrderIndex.get(group.get(b));
      if (ga !== gb) return ga - gb;
      return srcIndex.get(a) - srcIndex.get(b);
    });
    band.forEach((id, s) => slot.set(id, s));
  }
  return { slot, group };
}

/** Unicode コードポイント順比較（localeCompare/UTF-16 単位順に依存しない・決定的）。 */
function codepointCompare(a, b) {
  const ax = [...a];
  const bx = [...b];
  const n = Math.min(ax.length, bx.length);
  for (let i = 0; i < n; i++) {
    const ca = ax[i].codePointAt(0);
    const cb = bx[i].codePointAt(0);
    if (ca !== cb) return ca - cb;
  }
  return ax.length - bx.length;
}

// --- エッジ経路（layout-algorithm.md §4・直線） ---

function routeEdge(fromBox, toBox, rf, rt) {
  const cx = (b) => b.x + NODE_W / 2;
  const top = (b) => b.y;
  const bottom = (b) => b.y + NODE_H;
  const left = (b) => b.x;
  const right = (b) => b.x + NODE_W;
  const midY = (b) => b.y + NODE_H / 2;
  if (rt > rf) {
    // 下向き: from 下辺中央 → to 上辺中央
    return { x1: cx(fromBox), y1: bottom(fromBox), x2: cx(toBox), y2: top(toBox) };
  }
  // 同じ帯 または 上向き（後退辺）: from 右辺中央 → to 左辺中央
  return { x1: right(fromBox), y1: midY(fromBox), x2: left(toBox), y2: midY(toBox) };
}

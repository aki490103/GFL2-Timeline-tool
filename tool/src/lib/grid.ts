import type { BossArea, Grid, Position, TurnIndex } from "./types";

export const TURNS = [
  0, 1, 2, 3, 4, 5, 6, 7,
] as const satisfies readonly TurnIndex[];
export const CELL_PX = 55;
export const DESKTOP_MIN_PX = 1280;

// UI の入力欄と復元時の正規化で同じ上下限を使う
export const GRID_MIN = 5;
export const GRID_MAX = 35;

export const defaultGrid: Grid = { cols: 19, rows: 19 };

export const defaultBoss = (g: Grid): BossArea => {
  // 盤中央 3×3（奇数グリッド想定）
  const startX = Math.floor(g.cols / 2) - 1;
  const startY = Math.floor(g.rows / 2) - 1;
  return { x: Math.max(0, startX), y: Math.max(0, startY), w: 3, h: 3 };
};

export const cellKey = (x: number, y: number) => `${x},${y}`;

export const alphaLabel = (n: number) => {
  let s = "";
  let x = n;
  while (x >= 0) {
    s = String.fromCharCode(65 + (x % 26)) + s; // 65 = 'A'
    x = Math.floor(x / 26) - 1;
  }
  return s;
};

/** セルがボス領域に含まれるか */
export const isBossCell = (
  boss: BossArea | undefined,
  grid: Grid,
  x: number,
  y: number,
) => {
  const b = boss ?? defaultBoss(grid);
  return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
};

/** セルがグリッド内に収まっているか */
export const isInGrid = (grid: Grid, p: Position) =>
  p.x >= 0 && p.x < grid.cols && p.y >= 0 && p.y < grid.rows;

/**
 * 配置マップ（cellKey -> actorId[]）を組み立てる。
 * 実在しないアクターと、ボス領域に食い込んだ配置は無視する。
 */
export const buildOccupiedMap = (
  placements: Record<string, Position>,
  actorIds: ReadonlySet<string>,
  boss: BossArea | undefined,
  grid: Grid,
): Map<string, string[]> => {
  const m = new Map<string, string[]>();
  Object.entries(placements ?? {}).forEach(([cid, pos]) => {
    if (!actorIds.has(cid)) return;
    // ボス領域は常に無効（古いURL等で入っていても無視）
    if (isBossCell(boss, grid, pos.x, pos.y)) return;
    const key = cellKey(pos.x, pos.y);
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(cid);
  });
  return m;
};

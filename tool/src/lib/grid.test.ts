import { describe, expect, it } from "vitest";
import {
  alphaLabel,
  buildOccupiedMap,
  cellKey,
  defaultBoss,
  defaultGrid,
  isBossCell,
  isInGrid,
  TURNS,
} from "./grid";

describe("alphaLabel", () => {
  it("0 始まりで A, B, ... Z を返す", () => {
    expect(alphaLabel(0)).toBe("A");
    expect(alphaLabel(1)).toBe("B");
    expect(alphaLabel(25)).toBe("Z");
  });

  it("26 以降は AA, AB ... と桁上がりする", () => {
    expect(alphaLabel(26)).toBe("AA");
    expect(alphaLabel(27)).toBe("AB");
    expect(alphaLabel(51)).toBe("AZ");
    expect(alphaLabel(52)).toBe("BA");
    expect(alphaLabel(701)).toBe("ZZ");
    expect(alphaLabel(702)).toBe("AAA");
  });
});

describe("cellKey", () => {
  it("x,y をカンマ区切りで返す", () => {
    expect(cellKey(0, 0)).toBe("0,0");
    expect(cellKey(3, 12)).toBe("3,12");
  });
});

describe("defaultGrid / defaultBoss", () => {
  it("デフォルトは 19x19", () => {
    expect(defaultGrid).toEqual({ cols: 19, rows: 19 });
  });

  it("盤中央 3x3 を返す", () => {
    expect(defaultBoss({ cols: 19, rows: 19 })).toEqual({
      x: 8,
      y: 8,
      w: 3,
      h: 3,
    });
    expect(defaultBoss({ cols: 5, rows: 5 })).toEqual({
      x: 1,
      y: 1,
      w: 3,
      h: 3,
    });
  });

  it("極小グリッドでも負の座標にならない", () => {
    expect(defaultBoss({ cols: 1, rows: 1 })).toEqual({
      x: 0,
      y: 0,
      w: 3,
      h: 3,
    });
  });
});

describe("isBossCell", () => {
  const grid = { cols: 19, rows: 19 };
  const boss = { x: 8, y: 8, w: 3, h: 3 };

  it("ボス矩形の内側を判定する", () => {
    expect(isBossCell(boss, grid, 8, 8)).toBe(true);
    expect(isBossCell(boss, grid, 10, 10)).toBe(true);
    expect(isBossCell(boss, grid, 9, 9)).toBe(true);
  });

  it("矩形の外側は false", () => {
    expect(isBossCell(boss, grid, 7, 8)).toBe(false);
    expect(isBossCell(boss, grid, 11, 10)).toBe(false);
    expect(isBossCell(boss, grid, 8, 11)).toBe(false);
  });

  it("boss 未設定ならグリッド中央の既定ボスで判定する", () => {
    expect(isBossCell(undefined, grid, 9, 9)).toBe(true);
    expect(isBossCell(undefined, grid, 0, 0)).toBe(false);
  });
});

describe("isInGrid", () => {
  const grid = { cols: 10, rows: 5 };
  it("境界を含めて判定する", () => {
    expect(isInGrid(grid, { x: 0, y: 0 })).toBe(true);
    expect(isInGrid(grid, { x: 9, y: 4 })).toBe(true);
    expect(isInGrid(grid, { x: 10, y: 4 })).toBe(false);
    expect(isInGrid(grid, { x: 9, y: 5 })).toBe(false);
    expect(isInGrid(grid, { x: -1, y: 0 })).toBe(false);
  });
});

describe("TURNS", () => {
  it("準備(0)＋7ターン", () => {
    expect(TURNS).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("buildOccupiedMap", () => {
  const grid = { cols: 19, rows: 19 };
  const boss = { x: 8, y: 8, w: 3, h: 3 };
  const ids = new Set(["c1", "c2", "s1"]);

  it("cellKey ごとにアクターIDをまとめる", () => {
    const m = buildOccupiedMap(
      { c1: { x: 1, y: 1 }, s1: { x: 2, y: 3 } },
      ids,
      boss,
      grid,
    );
    expect(m.get("1,1")).toEqual(["c1"]);
    expect(m.get("2,3")).toEqual(["s1"]);
  });

  it("同じセルに複数いれば全部入る", () => {
    const m = buildOccupiedMap(
      { c1: { x: 1, y: 1 }, c2: { x: 1, y: 1 } },
      ids,
      boss,
      grid,
    );
    expect(m.get("1,1")).toEqual(["c1", "c2"]);
  });

  it("actorIds に無い孤児配置は無視する", () => {
    const m = buildOccupiedMap({ zzz: { x: 1, y: 1 } }, ids, boss, grid);
    expect(m.size).toBe(0);
  });

  it("ボス領域に重なった配置は無視する", () => {
    const m = buildOccupiedMap({ c1: { x: 9, y: 9 } }, ids, boss, grid);
    expect(m.size).toBe(0);
  });

  // 修正の核心: ボス領域を動かすと、同じ placements でも結果が変わらなければならない
  it("ボス領域を動かすと、そこに重なったアクターが消える", () => {
    const placements = { c1: { x: 1, y: 1 } };
    expect(buildOccupiedMap(placements, ids, boss, grid).get("1,1")).toEqual([
      "c1",
    ]);
    const movedBoss = { x: 0, y: 0, w: 3, h: 3 };
    expect(
      buildOccupiedMap(placements, ids, movedBoss, grid).get("1,1"),
    ).toBeUndefined();
  });

  it("placements が空/undefined でも落ちない", () => {
    expect(buildOccupiedMap({}, ids, boss, grid).size).toBe(0);
    expect(
      buildOccupiedMap(
        undefined as unknown as Record<string, never>,
        ids,
        boss,
        grid,
      ).size,
    ).toBe(0);
  });
});

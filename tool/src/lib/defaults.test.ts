import { describe, expect, it } from "vitest";
import {
  createTurn,
  emptyEquip,
  makeDefaultTL,
  slotColor,
  summonColor,
  SUMMON_COLORS,
} from "./defaults";

describe("emptyEquip", () => {
  it("空の装備を返す", () => {
    expect(emptyEquip()).toEqual({
      limitBreak: 0,
      weapon: "",
      uniqueKeySet: [undefined, undefined, undefined],
      commonKeySet: [undefined, undefined, undefined],
    });
  });

  it("呼び出しごとに別インスタンスを返す（共有されない）", () => {
    const a = emptyEquip();
    const b = emptyEquip();
    a.uniqueKeySet[0] = "x";
    expect(b.uniqueKeySet[0]).toBeUndefined();
  });
});

describe("createTurn", () => {
  it("index を保持した空ターンを返す", () => {
    expect(createTurn(3)).toEqual({ index: 3, placements: {}, steps: [] });
  });
});

describe("slotColor", () => {
  it("c1..c5 に固定色を割り当てる", () => {
    expect(slotColor("c1")).toBe("#ef4444");
    expect(slotColor("c2")).toBe("#3b82f6");
    expect(slotColor("c3")).toBe("#10b981");
    expect(slotColor("c4")).toBe("#f59e0b");
    expect(slotColor("c5")).toBe("#8b5cf6");
  });

  it("未知の ID はグレーにフォールバックする", () => {
    expect(slotColor("c9")).toBe("#6b7280");
    expect(slotColor("")).toBe("#6b7280");
  });
});

describe("summonColor", () => {
  it("s1..s10 に固定色を割り当てる", () => {
    expect(summonColor("s1")).toBe(SUMMON_COLORS[0]);
    expect(summonColor("s10")).toBe(SUMMON_COLORS[9]);
  });

  it("10 を超えたら循環する", () => {
    expect(summonColor("s11")).toBe(SUMMON_COLORS[0]);
  });

  it("s+数字 の形式でなければフォールバックする", () => {
    expect(summonColor("c1")).toBe("#64748b");
    expect(summonColor("summon")).toBe("#64748b");
  });
});

describe("makeDefaultTL", () => {
  // 抽出前の App.tsx にあったリテラル定義と 1 バイトも変わらないことを固定する
  it("既定TLの形が変わっていない", () => {
    expect(makeDefaultTL()).toEqual({
      v: 1,
      title: "新規TL",
      grid: { cols: 19, rows: 19 },
      boss: { x: 8, y: 8, w: 3, h: 3 },
      characters: [
        {
          id: "c1",
          name: "",
          alias: "",
          color: "#ef4444",
          equipment: emptyEquip(),
        },
        {
          id: "c2",
          name: "",
          alias: "",
          color: "#3b82f6",
          equipment: emptyEquip(),
        },
        {
          id: "c3",
          name: "",
          alias: "",
          color: "#10b981",
          equipment: emptyEquip(),
        },
        {
          id: "c4",
          name: "",
          alias: "",
          color: "#f59e0b",
          equipment: emptyEquip(),
        },
        {
          id: "c5",
          name: "",
          alias: "",
          color: "#8b5cf6",
          equipment: emptyEquip(),
        },
      ],
      summons: [],
      prep: { index: 0, placements: {}, steps: [] },
      turns: [1, 2, 3, 4, 5, 6, 7].map((i) => ({
        index: i,
        placements: {},
        steps: [],
      })),
    });
  });

  it("呼び出しごとに独立したオブジェクトを返す", () => {
    const a = makeDefaultTL();
    const b = makeDefaultTL();
    a.characters[0].name = "変更";
    a.prep.placements["c1"] = { x: 1, y: 1 };
    a.grid.cols = 30;
    expect(b.characters[0].name).toBe("");
    expect(b.prep.placements).toEqual({});
    // grid はモジュール定数を共有していると他のTLまで汚染される
    expect(b.grid).toEqual({ cols: 19, rows: 19 });
  });
});

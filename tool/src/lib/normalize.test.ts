import { describe, expect, it } from "vitest";
import { makeDefaultTL } from "./defaults";
import { normalizeTimeline } from "./normalize";

describe("normalizeTimeline", () => {
  it("既定TLはそのまま通る", () => {
    expect(normalizeTimeline(makeDefaultTL())).toEqual(makeDefaultTL());
  });

  it("冪等（2回通しても変わらない）", () => {
    const once = normalizeTimeline({ v: 1, title: "x" });
    expect(normalizeTimeline(once)).toEqual(once);
  });

  it.each([null, undefined, 0, "", "abc", [], { v: 1 }])(
    "壊れた入力 %o でも使える TL を返す",
    (input) => {
      const tl = normalizeTimeline(input);
      expect(tl.v).toBe(1);
      expect(tl.grid).toEqual({ cols: 19, rows: 19 });
      expect(tl.characters).toHaveLength(5);
      expect(tl.turns).toHaveLength(7);
      expect(tl.prep.placements).toEqual({});
      expect(tl.summons).toEqual([]);
      expect(tl.boss).toEqual({ x: 8, y: 8, w: 3, h: 3 });
    },
  );

  describe("grid", () => {
    it("上下限にクランプする", () => {
      expect(normalizeTimeline({ grid: { cols: 999, rows: 1 } }).grid).toEqual({
        cols: 35,
        rows: 5,
      });
    });

    it("数値以外は既定値", () => {
      expect(
        normalizeTimeline({ grid: { cols: "x", rows: null } }).grid,
      ).toEqual({ cols: 19, rows: 19 });
    });

    it("小数は切り捨てる", () => {
      expect(
        normalizeTimeline({ grid: { cols: 10.9, rows: 7.2 } }).grid,
      ).toEqual({ cols: 10, rows: 7 });
    });
  });

  describe("boss", () => {
    it("欠けていればグリッド中央の 3x3 を補う", () => {
      expect(normalizeTimeline({ grid: { cols: 11, rows: 11 } }).boss).toEqual({
        x: 4,
        y: 4,
        w: 3,
        h: 3,
      });
    });

    it("負の座標・0 サイズを矯正する", () => {
      expect(
        normalizeTimeline({ boss: { x: -5, y: -1, w: 0, h: -3 } }).boss,
      ).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    });
  });

  describe("characters", () => {
    it("常に c1..c5 の 5 枠になる", () => {
      const tl = normalizeTimeline({
        characters: [{ id: "c1", name: "トロロ" }],
      });
      expect(tl.characters.map((c) => c.id)).toEqual([
        "c1",
        "c2",
        "c3",
        "c4",
        "c5",
      ]);
      expect(tl.characters[0].name).toBe("トロロ");
      expect(tl.characters[4].name).toBe("");
    });

    it("余分な枠は捨てられる", () => {
      const tl = normalizeTimeline({
        characters: Array.from({ length: 9 }, (_, i) => ({
          id: `c${i + 1}`,
          name: "",
        })),
      });
      expect(tl.characters).toHaveLength(5);
    });

    it("id が無ければ並び順で割り当てる", () => {
      const tl = normalizeTimeline({ characters: [{ name: "トロロ" }] });
      expect(tl.characters[0]).toMatchObject({ id: "c1", name: "トロロ" });
    });

    it("alias / ctype / color は候補リストから導出し直す", () => {
      const tl = normalizeTimeline({
        characters: [
          {
            id: "c1",
            name: "ヴェプリー",
            alias: "でたらめ",
            ctype: "SR",
            color: "#000",
          },
        ],
      });
      expect(tl.characters[0].alias).toBe("ヴェプリー");
      expect(tl.characters[0].ctype).toBe("SG");
      expect(tl.characters[0].color).toBe("#ef4444");
    });

    it("候補に無いキャラ名は残すが type は付かない", () => {
      const tl = normalizeTimeline({
        characters: [{ id: "c1", name: "架空のキャラ" }],
      });
      expect(tl.characters[0].name).toBe("架空のキャラ");
      expect(tl.characters[0].ctype).toBeUndefined();
    });
  });

  describe("equipment", () => {
    it("凸数を 0..6 にクランプする", () => {
      const lb = (v: unknown) =>
        normalizeTimeline({
          characters: [
            { id: "c1", limitBreak: 0, equipment: { limitBreak: v } },
          ],
        }).characters[0].equipment.limitBreak;
      expect(lb(99)).toBe(6);
      expect(lb(-3)).toBe(0);
      expect(lb("2")).toBe(0);
      expect(lb(4)).toBe(4);
    });

    it("そのキャラの候補に無い固有キーを落とす", () => {
      const tl = normalizeTimeline({
        characters: [
          {
            id: "c1",
            name: "ヴェプリー",
            equipment: {
              uniqueKeySet: ["安全な鑑賞距離", "他キャラのキー", null],
            },
          },
        ],
      });
      expect(tl.characters[0].equipment.uniqueKeySet).toEqual([
        "安全な鑑賞距離",
        undefined,
        undefined,
      ]);
    });

    it("キーセットは常に長さ 3 に揃う", () => {
      const eq = normalizeTimeline({
        characters: [
          { id: "c1", equipment: { uniqueKeySet: [], commonKeySet: "x" } },
        ],
      }).characters[0].equipment;
      expect(eq.uniqueKeySet).toEqual([undefined, undefined, undefined]);
      expect(eq.commonKeySet).toEqual([undefined, undefined, undefined]);
    });
  });

  describe("summons", () => {
    it("ID を s1.. に振り直し、表示名を導出する", () => {
      const tl = normalizeTimeline({
        summons: [
          { id: "s7", name: "定息鏑（朝暉）" },
          { id: "zzz", name: "未知の召喚物" },
        ],
      });
      expect(tl.summons).toEqual([
        { id: "s1", name: "定息鏑（朝暉）", alias: "定息鏑" },
        { id: "s2", name: "未知の召喚物", alias: "未知の召喚物" },
      ]);
    });

    it("上限 10 件で打ち切る", () => {
      const tl = normalizeTimeline({
        summons: Array.from({ length: 20 }, () => ({ name: "x" })),
      });
      expect(tl.summons).toHaveLength(10);
    });
  });

  describe("turns", () => {
    it("欠けたターンを空ターンで埋め、index を振り直す", () => {
      const tl = normalizeTimeline({
        turns: [{ placements: { c1: { x: 1, y: 1 } } }],
      });
      expect(tl.turns).toHaveLength(7);
      expect(tl.turns.map((t) => t.index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(tl.prep.index).toBe(0);
      expect(tl.turns[0].placements).toEqual({ c1: { x: 1, y: 1 } });
      expect(tl.turns[6].placements).toEqual({});
    });

    it("余分なターンは捨てる", () => {
      const tl = normalizeTimeline({
        turns: Array.from({ length: 20 }, () => ({
          placements: {},
          steps: [],
        })),
      });
      expect(tl.turns).toHaveLength(7);
    });

    it("壊れた座標の配置を落とす", () => {
      const tl = normalizeTimeline({
        characters: [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
        prep: {
          placements: {
            c1: { x: 1, y: 2 },
            c2: { x: "a", y: 2 },
            c3: null,
          },
        },
      });
      expect(tl.prep.placements).toEqual({ c1: { x: 1, y: 2 } });
    });

    it("実在しないアクターの配置を落とす", () => {
      const tl = normalizeTimeline({
        prep: { placements: { c1: { x: 1, y: 1 }, s1: { x: 2, y: 2 } } },
      });
      expect(tl.prep.placements).toEqual({ c1: { x: 1, y: 1 } });
    });
  });

  describe("steps", () => {
    it("範囲外・重複の order を落として並べ替える", () => {
      const tl = normalizeTimeline({
        turns: [
          {
            steps: [
              { order: 3, actorId: "c3", skill: "S3" },
              { order: 1, actorId: "c1", skill: "S1", note: "メモ" },
              { order: 3, actorId: "cX", skill: "重複" },
              { order: 0, actorId: "c0", skill: "範囲外" },
              { order: 99, actorId: "c9", skill: "範囲外" },
              "壊れた要素",
            ],
          },
        ],
      });
      expect(tl.turns[0].steps).toEqual([
        { order: 1, actorId: "c1", skill: "S1", note: "メモ" },
        { order: 3, actorId: "c3", skill: "S3" },
      ]);
    });
  });

  it('title は常に文字列になる（undefined と "" を混在させない）', () => {
    expect(normalizeTimeline({ title: "編成A" }).title).toBe("編成A");
    expect(normalizeTimeline({ title: 123 }).title).toBe("");
    expect(normalizeTimeline({}).title).toBe("");
  });
});

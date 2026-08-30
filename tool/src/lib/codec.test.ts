import { deflate } from "pako";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHARACTER_OPTIONS } from "../data/characters";
import { COMMON_KEY_OPTIONS } from "../data/common_keys";
import { WEAPON_OPTIONS } from "../data/weapons";
import { b64u, decodeTL, encodeTL, encodeTLv1 } from "./codec";
import { makeDefaultTL } from "./defaults";
import { normalizeTimeline } from "./normalize";
import type { TimelineV1 } from "./types";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/** 全欄を埋めた現実的な最大ケース */
const fullTL = (): TimelineV1 => {
  const chars = CHARACTER_OPTIONS.slice(0, 5);
  return normalizeTimeline({
    v: 1,
    title: "深層戦区 3層 ボス編成 v3",
    grid: { cols: 19, rows: 19 },
    boss: { x: 8, y: 8, w: 3, h: 3 },
    characters: chars.map((c, i) => ({
      id: `c${i + 1}`,
      name: c.name,
      equipment: {
        limitBreak: 3,
        weapon: WEAPON_OPTIONS.find((w) => w.type === c.type)!.name,
        uniqueKeySet: c.uniqueKeyOptions.slice(0, 3),
        commonKeySet: COMMON_KEY_OPTIONS.slice(i * 3, i * 3 + 3),
      },
    })),
    summons: [{ name: "定息鏑（朝暉）" }, { name: "クリーチ（ニキータ）" }],
    prep: {
      placements: Object.fromEntries(
        ["c1", "c2", "c3", "c4", "c5", "s1", "s2"].map((id, i) => [
          id,
          { x: i, y: 1 },
        ]),
      ),
    },
    turns: Array.from({ length: 7 }, (_, t) => ({
      placements: Object.fromEntries(
        ["c1", "c2", "c3", "c4", "c5", "s1", "s2"].map((id, i) => [
          id,
          { x: i, y: 2 + t },
        ]),
      ),
      steps: [1, 2, 3, 4, 5].map((order) => ({
        order,
        actorId: `c${order}`,
        skill: "S4>S2",
        note: "左箱回収→戻る",
      })),
    })),
  });
};

const roundTrip = (tl: TimelineV1) => decodeTL("#" + encodeTL(tl));

describe("b64u", () => {
  it("URL セーフな文字だけを出力する（+ / = を含まない）", () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    expect(b64u.enc(bytes)).not.toMatch(/[+/=]/);
  });

  it("enc → dec でバイト列が復元される", () => {
    for (const len of [0, 1, 2, 3, 4, 5, 255, 1000]) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = (i * 7) % 256;
      expect(b64u.dec(b64u.enc(bytes))).toEqual(bytes);
    }
  });
});

describe("encodeTL (v2)", () => {
  it("v2: プレフィックスを付ける", () => {
    expect(encodeTL(makeDefaultTL())).toMatch(/^v2:/);
  });

  it("既定TLがラウンドトリップする", () => {
    const tl = makeDefaultTL();
    expect(roundTrip(tl)).toEqual(tl);
  });

  it("全欄を埋めたTLがラウンドトリップする", () => {
    const tl = fullTL();
    expect(roundTrip(tl)).toEqual(tl);
  });

  it("未選択のキー枠は undefined のまま復元される", () => {
    const back = roundTrip(makeDefaultTL())!;
    expect(back.characters[0].equipment.uniqueKeySet).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("キャラだけ選んで装備が空でもラウンドトリップする", () => {
    const tl = normalizeTimeline({
      v: 1,
      characters: [{ id: "c1", name: "トロロ" }],
    });
    expect(roundTrip(tl)).toEqual(tl);
  });

  it("召喚物と配置がラウンドトリップする", () => {
    const tl = normalizeTimeline({
      v: 1,
      summons: [{ name: "定息鏑（朝暉）" }, { name: "クリーチ（ニキータ）" }],
      prep: { placements: { c3: { x: 7, y: 8 }, s2: { x: 0, y: 0 } } },
    });
    expect(roundTrip(tl)).toEqual(tl);
    expect(roundTrip(tl)!.prep.placements).toEqual({
      c3: { x: 7, y: 8 },
      s2: { x: 0, y: 0 },
    });
  });

  it("行動順（順・キャラ・スキル・備考）がラウンドトリップする", () => {
    const tl = normalizeTimeline({
      v: 1,
      turns: [
        {
          steps: [
            { order: 1, actorId: "c1", skill: "S4>S2", note: "左箱回収" },
            { order: 4, actorId: "c5", skill: "S3", note: "" },
          ],
        },
      ],
    });
    expect(roundTrip(tl)!.turns[0].steps).toEqual(tl.turns[0].steps);
  });

  it("グリッドとボス領域がラウンドトリップする", () => {
    const tl = normalizeTimeline({
      v: 1,
      grid: { cols: 35, rows: 5 },
      boss: { x: 30, y: 1, w: 4, h: 2 },
    });
    const back = roundTrip(tl)!;
    expect(back.grid).toEqual({ cols: 35, rows: 5 });
    expect(back.boss).toEqual({ x: 30, y: 1, w: 4, h: 2 });
  });

  it("候補リストに無い名前は復元時に落ちる（添字化できないため）", () => {
    const tl = normalizeTimeline({
      v: 1,
      characters: [{ id: "c1", name: "架空のキャラ" }],
    });
    expect(tl.characters[0].name).toBe("架空のキャラ");
    expect(roundTrip(tl)!.characters[0].name).toBe("");
  });
});

describe("URL の長さ", () => {
  const PAGE_URL = "https://aki490103.github.io/GFL2-Timeline-tool/#";

  it("全欄を埋めた最大ケースでも 800 文字以内に収まる", () => {
    const len = PAGE_URL.length + encodeTL(fullTL()).length;
    expect(len).toBeLessThan(800);
  });

  it("v1 より大幅に短い", () => {
    const tl = fullTL();
    const v2 = encodeTL(tl).length;
    const v1 = encodeTLv1(tl).length;
    // 実測で約 1/3。半分を切っていることを下限として固定する
    expect(v2).toBeLessThan(v1 / 2);
  });

  it("空のTLは十分短い", () => {
    expect(encodeTL(makeDefaultTL()).length).toBeLessThan(120);
  });
});

describe("decodeTL の後方互換（配布済みの v1 URL）", () => {
  // 実際に v1 実装が生成したハッシュ。ここを書き換えてはいけない。
  // 既にDiscord等に貼られている共有URLが読めなくなっていないかを守る。
  const V1_FIXTURE =
    "v1:eJzFlDFv2kAUx7_Lq7p5wMakxEOldqmqbmWMGIw5GivGds52EoQYwK0aliCaSJFo00gZGpSqRCiVMhSJD3PFhClfoe_OgTikJQytitDp7t3__v69Z9-rwhZosgS-6VsENIgOT7dkFp6x8II1zkGCN9QsglYFw7E8VCoSUGebz1I1CQqO5_HNHdAyElRAUyXYBg1F6ziiwFjXqW74hKJsrQrcCgwZbW29zB_Hwu-sccrCQ_HIAW7olql7v90x_IrLz-Re8IVjORQXj0hJxR9GyGZgumVi-xzIMsum_5wSfSNmIrrr2MK1hWYs3BUTTHEYewe2uRmQV6SSI3h-DUa95uhdl9XPJu321cXnq8ujyccT1EX9TnS8zxpdTtU4YeFbMaKFHVhWnnOVy46dMBqGrP51cjxk9db1YHcuq-tBE00xHvX3xgddXEYHP6IP4eOfgw6eHO-9vzGu1aRp9ZRk9dDwG_7v1O02Nq3Ys9fJiqULWaW0sqhicqJi94vDgaTZcD_nuf0EevoWPUGcZJNThdWsvIgt9Y_Y1AfZSplVkir8D7bMg2zZQsZY_E7_MhtKvIBLEhfbS1zsUa8T1c8nrTb_uD8dRZ1m_K1P4Wf7wK1cSlwObNpFsiNYXUs3CM9D9BdsGXGXkUWXkbGzeNOQIkJKjcd84nKePM79gE7ZYlP5j6Zp4ZDm7Uq5CalxN0uaVsGhRUKFEbY0h76cNTNvw7Qs3pnUpzlxPR1f1ODyy7jXxwTFm4wplDmKu9QzWXo5mbqcLLOcbGU52ZNFsnztF8mZVlk";

  it("v1 の共有URLがそのまま読める", () => {
    const tl = decodeTL("#" + V1_FIXTURE)!;
    expect(tl).not.toBeNull();
    expect(tl.title).toBe("旧v1リンク");
    expect(tl.grid).toEqual({ cols: 12, rows: 10 });
    expect(tl.boss).toEqual({ x: 5, y: 4, w: 2, h: 2 });
    expect(tl.characters[0].name).toBe("ヴェプリー");
    expect(tl.characters[0].equipment.limitBreak).toBe(4);
    expect(tl.characters[0].equipment.weapon).toBe("ハートハンター");
    expect(tl.characters[0].equipment.uniqueKeySet).toEqual([
      "安全な鑑賞距離",
      "汚染エリアツアー",
      undefined,
    ]);
    expect(tl.characters[1].name).toBe("トロロ");
    expect(tl.summons).toEqual([
      { id: "s1", name: "定息鏑（朝暉）", alias: "定息鏑" },
    ]);
    expect(tl.prep.placements).toEqual({
      c1: { x: 1, y: 1 },
      s1: { x: 2, y: 2 },
    });
    expect(tl.turns[0].steps).toEqual([
      { order: 1, actorId: "c1", skill: "S4>S2", note: "左箱" },
    ]);
  });

  it("v1 を読んで v2 で書き直しても内容が変わらない", () => {
    const fromV1 = decodeTL("#" + V1_FIXTURE)!;
    expect(roundTrip(fromV1)).toEqual(fromV1);
  });
});

describe("decodeTL の異常系", () => {
  it("対応外のハッシュは null", () => {
    expect(decodeTL("")).toBeNull();
    expect(decodeTL("#")).toBeNull();
    expect(decodeTL("#v3:abc")).toBeNull();
    expect(decodeTL("#abc")).toBeNull();
    expect(decodeTL(encodeTL(makeDefaultTL()))).toBeNull(); // 先頭 # が無い
  });

  it("壊れた base64 / 壊れた deflate は null（例外を投げない）", () => {
    expect(decodeTL("#v2:!!!!")).toBeNull();
    expect(decodeTL("#v2:AAAAAAAA")).toBeNull();
    const valid = encodeTL(fullTL());
    expect(decodeTL("#" + valid.slice(0, valid.length - 20))).toBeNull();
  });

  it("v1 で v が 1 でない JSON は null", () => {
    expect(
      decodeTL("#" + encodeTLv1({ v: 2 } as unknown as TimelineV1)),
    ).toBeNull();
  });

  const packV2 = (payload: unknown) =>
    "#v2:" +
    b64u.enc(deflate(new TextEncoder().encode(JSON.stringify(payload))));

  it("v2 の中身が壊れていても、使える TL を返す", () => {
    const broken: unknown[] = [
      [2],
      [2, null, null, null, null, null, null],
      [2, "t", "x", 3, "chars", 5, {}],
      [
        2,
        "t",
        [1, 1],
        [0, 0, 1, 1],
        [[999, 0, 999, [99], [99]]],
        [999],
        [[[], []]],
      ],
      [2, "t", [19, 19], [8, 8, 3, 3], [], [], [[[0, 1], []]]], // 座標が欠けた配置
      "not an array",
      42,
    ];
    for (const payload of broken) {
      const tl = decodeTL(packV2(payload))!;
      expect(tl, JSON.stringify(payload)).not.toBeNull();
      expect(tl.characters).toHaveLength(5);
      expect(tl.turns).toHaveLength(7);
      expect(tl.grid.cols).toBeGreaterThanOrEqual(5);
    }
  });

  it("存在しない召喚物スロットを指す配置は落ちる", () => {
    // 召喚物 0 件なのに s1 のスロット(5)を指している
    const tl = decodeTL(
      packV2([2, "", [19, 19], [8, 8, 3, 3], [], [], [[[5, 1, 1], []]]]),
    )!;
    expect(tl.prep.placements).toEqual({});
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { b64u, decodeTL, encodeTL } from "./codec";
import { makeDefaultTL } from "./defaults";
import { normalizeTimeline } from "./normalize";
import type { TimelineV1 } from "./types";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

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

describe("encodeTL / decodeTL", () => {
  it("v1: プレフィックスを付ける", () => {
    expect(encodeTL(makeDefaultTL())).toMatch(/^v1:/);
  });

  it("既定TLがラウンドトリップする", () => {
    const tl = makeDefaultTL();
    expect(decodeTL("#" + encodeTL(tl))).toEqual(tl);
  });

  // JSON は undefined を表現できないため、素の JSON.parse では null になる。
  // decodeTL は normalizeTimeline を通すので undefined に戻る。
  it("未選択のキー枠は undefined のまま復元される", () => {
    const back = decodeTL("#" + encodeTL(makeDefaultTL()))!;
    expect(back.characters[0].equipment.uniqueKeySet).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("日本語や記号を含むTLがラウンドトリップする", () => {
    const tl = normalizeTimeline({
      v: 1,
      title: "紅蓮の作戦 ★2周目 <>&\"'",
      characters: [
        {
          id: "c1",
          name: "ヴェプリー",
          equipment: {
            limitBreak: 3,
            weapon: "ハートハンター",
            uniqueKeySet: ["安全な鑑賞距離"],
            commonKeySet: ["心に響く（ヴェプリー）"],
          },
        },
      ],
      summons: [{ name: "定息鏑（朝暉）" }],
      prep: { placements: { c1: { x: 1, y: 2 }, s1: { x: 3, y: 4 } } },
      turns: [
        { steps: [{ order: 1, actorId: "c1", skill: "S4>S2", note: "左箱" }] },
      ],
    });
    expect(decodeTL("#" + encodeTL(tl))).toEqual(tl);
  });

  it("大きなグリッドと全ターン埋めでもラウンドトリップする", () => {
    const tl = normalizeTimeline({
      v: 1,
      grid: { cols: 35, rows: 35 },
      characters: ["c1", "c2", "c3", "c4", "c5"].map((id) => ({
        id,
        name: "",
      })),
      turns: Array.from({ length: 7 }, (_, ti) => ({
        placements: Object.fromEntries(
          ["c1", "c2", "c3", "c4", "c5"].map((id, i) => [id, { x: i, y: ti }]),
        ),
        steps: [1, 2, 3, 4, 5].map((order) => ({
          order,
          actorId: `c${order}`,
          skill: "S4",
          note: "メモ",
        })),
      })),
    });
    expect(decodeTL("#" + encodeTL(tl))).toEqual(tl);
  });

  it("v1: 以外のハッシュは null", () => {
    expect(decodeTL("")).toBeNull();
    expect(decodeTL("#")).toBeNull();
    expect(decodeTL("#v2:abc")).toBeNull();
    expect(decodeTL(encodeTL(makeDefaultTL()))).toBeNull(); // 先頭 # が無い
  });

  it("壊れた base64 / 壊れた deflate は null（例外を投げない）", () => {
    expect(decodeTL("#v1:!!!!")).toBeNull();
    expect(decodeTL("#v1:AAAAAAAA")).toBeNull();
    const valid = encodeTL(makeDefaultTL());
    expect(decodeTL("#" + valid.slice(0, valid.length - 20))).toBeNull();
  });

  it("v が 1 でない JSON は null", () => {
    expect(
      decodeTL("#" + encodeTL({ v: 2 } as unknown as TimelineV1)),
    ).toBeNull();
  });

  // 手書きハッシュや、途中で切れた URL を開いても画面が落ちないこと
  // （以前は grid / turns が欠けたまま描画に進んで例外になっていた）
  it("v:1 だが中身が壊れていても、使える TL を返す", () => {
    const broken = [
      { v: 1 },
      { v: 1, grid: null, characters: "x", turns: 3, prep: 0 },
      { v: 1, turns: [{}, {}] },
      { v: 1, characters: [{ id: "c1", equipment: null }] },
    ];
    for (const payload of broken) {
      const tl = decodeTL("#" + encodeTL(payload as unknown as TimelineV1))!;
      expect(tl).not.toBeNull();
      expect(tl.grid.cols).toBeGreaterThanOrEqual(5);
      expect(tl.characters).toHaveLength(5);
      expect(tl.turns).toHaveLength(7);
      expect(tl.prep.placements).toEqual({});
    }
  });
});

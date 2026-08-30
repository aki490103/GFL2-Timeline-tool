import { describe, expect, it } from "vitest";
import { SUMMON_OPTIONS } from "../data/summons";
import {
  addSummon,
  aliasForName,
  aliasForSummon,
  countInvalidPlacements,
  getCharOption,
  isSummonId,
  pruneInvalidPlacements,
  pruneOrphanPlacements,
  removeSummon,
  renumberSummons,
  sanitizeCommonKeys,
  sanitizeUniqueKeys,
  uniqueKeyOptionsForName,
} from "./actors";
import { makeDefaultTL } from "./defaults";
import type { Summon, TimelineV1 } from "./types";

const withSummons = (ids: string[]): TimelineV1 => {
  const tl = makeDefaultTL();
  tl.summons = ids.map((id): Summon => ({ id, name: `名前${id}` }));
  return tl;
};

describe("isSummonId", () => {
  it("s で始まる ID を召喚物とみなす", () => {
    expect(isSummonId("s1")).toBe(true);
    expect(isSummonId("s10")).toBe(true);
    expect(isSummonId("c1")).toBe(false);
  });
});

describe("getCharOption / aliasForName", () => {
  it("候補リストからキャラを引ける", () => {
    expect(getCharOption("ヴェプリー")?.type).toBe("SG");
    expect(getCharOption("存在しないキャラ")).toBeUndefined();
  });

  it("alias が無いキャラは名前をそのまま返す", () => {
    expect(aliasForName("ヴェプリー")).toBe("ヴェプリー");
  });

  it("候補に無い名前もそのまま返す", () => {
    expect(aliasForName("未知")).toBe("未知");
  });

  it("空・undefined は空文字", () => {
    expect(aliasForName("")).toBe("");
    expect(aliasForName(undefined)).toBe("");
  });
});

describe("aliasForSummon", () => {
  it("候補リストの alias を返す", () => {
    expect(aliasForSummon("ガーディアン（ペーペーシャ）")).toBe("ガーディアン");
    expect(aliasForSummon("定息鏑（朝暉）")).toBe("定息鏑");
  });

  it("候補に無い名前はそのまま、空は空文字", () => {
    expect(aliasForSummon("未知の召喚物")).toBe("未知の召喚物");
    expect(aliasForSummon(undefined)).toBe("");
  });
});

describe("uniqueKeyOptionsForName", () => {
  it("キャラごとの固有キー候補を返す", () => {
    expect(uniqueKeyOptionsForName("ヴェプリー")).toContain("安全な鑑賞距離");
  });

  it("未知のキャラは空配列", () => {
    expect(uniqueKeyOptionsForName("未知")).toEqual([]);
  });
});

describe("sanitizeUniqueKeys", () => {
  it("そのキャラの候補に無いキーを落とす", () => {
    const r = sanitizeUniqueKeys("ヴェプリー", [
      "安全な鑑賞距離",
      "他キャラのキー",
      undefined,
    ]);
    expect(r).toEqual(["安全な鑑賞距離", undefined, undefined]);
  });

  it("キャラ未選択なら全部落ちる", () => {
    expect(
      sanitizeUniqueKeys("", ["安全な鑑賞距離", undefined, undefined]),
    ).toEqual([undefined, undefined, undefined]);
  });

  it("null や空文字も undefined に正規化される", () => {
    expect(
      sanitizeUniqueKeys("ヴェプリー", [
        null as unknown as string,
        "" as string,
        "安全な鑑賞距離",
      ]),
    ).toEqual([undefined, undefined, "安全な鑑賞距離"]);
  });

  it("入力配列を破壊しない", () => {
    const input: [string?, string?, string?] = [
      "不正キー",
      undefined,
      undefined,
    ];
    sanitizeUniqueKeys("ヴェプリー", input);
    expect(input).toEqual(["不正キー", undefined, undefined]);
  });
});

describe("sanitizeCommonKeys", () => {
  it("共通キー候補に無いものを落とす", () => {
    expect(
      sanitizeCommonKeys(["（汎用）攻撃%会心率", "存在しないキー", undefined]),
    ).toEqual(["（汎用）攻撃%会心率", undefined, undefined]);
  });
});

describe("pruneOrphanPlacements", () => {
  it("characters/summons に存在しない ID の配置を全ターンから消す", () => {
    const tl = withSummons(["s1"]);
    tl.prep.placements = {
      c1: { x: 0, y: 0 },
      s1: { x: 1, y: 1 },
      s9: { x: 2, y: 2 },
    };
    tl.turns[0].placements = { zzz: { x: 3, y: 3 }, c2: { x: 4, y: 4 } };
    pruneOrphanPlacements(tl);
    expect(tl.prep.placements).toEqual({
      c1: { x: 0, y: 0 },
      s1: { x: 1, y: 1 },
    });
    expect(tl.turns[0].placements).toEqual({ c2: { x: 4, y: 4 } });
  });

  it("summons が undefined でも落ちない", () => {
    const tl = makeDefaultTL();
    (tl as { summons?: Summon[] }).summons = undefined;
    tl.prep.placements = { c1: { x: 0, y: 0 }, s1: { x: 1, y: 1 } };
    expect(() => pruneOrphanPlacements(tl)).not.toThrow();
    expect(tl.prep.placements).toEqual({ c1: { x: 0, y: 0 } });
  });
});

describe("renumberSummons", () => {
  it("既に s1..sN 並びなら何も変えない", () => {
    const tl = withSummons(["s1", "s2"]);
    tl.prep.placements = { s1: { x: 0, y: 0 }, s2: { x: 1, y: 1 } };
    const r = renumberSummons(tl, "s2");
    expect(r.next.summons.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(r.next.prep.placements).toEqual({
      s1: { x: 0, y: 0 },
      s2: { x: 1, y: 1 },
    });
    expect(r.newActiveId).toBe("s2");
  });

  it("欠番があれば詰めて振り直し、配置キーも追随する", () => {
    // s2 を削除した直後を想定
    const tl = withSummons(["s1", "s3"]);
    tl.prep.placements = {
      c1: { x: 9, y: 9 },
      s1: { x: 0, y: 0 },
      s3: { x: 2, y: 2 },
    };
    tl.turns[0].placements = { s3: { x: 5, y: 5 } };
    const r = renumberSummons(tl, "s3");
    expect(r.next.summons.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(r.next.summons[1].name).toBe("名前s3"); // 中身は保持
    expect(r.next.prep.placements).toEqual({
      c1: { x: 9, y: 9 },
      s1: { x: 0, y: 0 },
      s2: { x: 2, y: 2 },
    });
    expect(r.next.turns[0].placements).toEqual({ s2: { x: 5, y: 5 } });
    expect(r.newActiveId).toBe("s2");
  });

  it("選択中がキャラなら変更しない", () => {
    const tl = withSummons(["s1", "s3"]);
    expect(renumberSummons(tl, "c1").newActiveId).toBe("c1");
    expect(renumberSummons(withSummons(["s2"]), null).newActiveId).toBeNull();
  });

  it("削除された本人が選択中なら、選択を解除する（他の召喚物にすり替えない）", () => {
    // s1,s2,s3 のうち s2 を削除し、s2 を選択したまま呼んだ状況
    const tl = withSummons(["s1", "s3"]);
    const r = renumberSummons(tl, "s2");
    expect(r.newActiveId).toBeNull();
    // 旧 s3 は s2 に繰り上がるが、選択はそこに移らない
    expect(r.next.summons.find((s) => s.id === "s2")?.name).toBe("名前s3");
  });

  it("最後の1件を削除したら選択を解除する", () => {
    const r = renumberSummons(withSummons([]), "s1");
    expect(r.newActiveId).toBeNull();
  });

  it("選択中の召喚物が生き残っていれば繰り上げ後のIDを指す", () => {
    const r = renumberSummons(withSummons(["s2", "s3"]), "s3");
    expect(r.newActiveId).toBe("s2");
  });
});

describe("addSummon", () => {
  it("末尾に追加し、既定名と表示名が入る", () => {
    const r = addSummon(makeDefaultTL(), null);
    expect(r.next.summons).toHaveLength(1);
    expect(r.next.summons[0].id).toBe("s1");
    expect(r.next.summons[0].name).toBe(SUMMON_OPTIONS[0].name);
    expect(r.next.summons[0].alias).toBe(SUMMON_OPTIONS[0].alias);
    expect(r.newActiveId).toBeNull();
  });

  it("連番で増える", () => {
    let tl = makeDefaultTL();
    for (let i = 0; i < 3; i++) tl = addSummon(tl, null).next;
    expect(tl.summons.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("元の TL を破壊しない", () => {
    const tl = makeDefaultTL();
    addSummon(tl, null);
    expect(tl.summons).toEqual([]);
  });

  it("選択中の召喚物はそのまま維持される", () => {
    const tl = addSummon(addSummon(makeDefaultTL(), null).next, null).next;
    expect(addSummon(tl, "s2").newActiveId).toBe("s2");
  });
});

describe("removeSummon", () => {
  const three = () => {
    let tl = makeDefaultTL();
    for (let i = 0; i < 3; i++) tl = addSummon(tl, null).next;
    tl.prep.placements = {
      c1: { x: 0, y: 0 },
      s1: { x: 1, y: 1 },
      s2: { x: 2, y: 2 },
      s3: { x: 3, y: 3 },
    };
    tl.turns[0].placements = { s3: { x: 4, y: 4 } };
    return tl;
  };

  it("削除した召喚物の配置が全ターンから消える", () => {
    const r = removeSummon(three(), "s2", null);
    expect(r.next.summons.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(r.next.prep.placements).toEqual({
      c1: { x: 0, y: 0 },
      s1: { x: 1, y: 1 },
      s2: { x: 3, y: 3 }, // 旧 s3 が繰り上がり、配置も追随
    });
    expect(r.next.turns[0].placements).toEqual({ s2: { x: 4, y: 4 } });
  });

  it("削除対象が選択中なら選択が解除される", () => {
    expect(removeSummon(three(), "s2", "s2").newActiveId).toBeNull();
  });

  it("削除対象より後ろが選択中なら繰り上げ後のIDになる", () => {
    expect(removeSummon(three(), "s2", "s3").newActiveId).toBe("s2");
  });

  it("削除対象より前が選択中ならそのまま", () => {
    expect(removeSummon(three(), "s2", "s1").newActiveId).toBe("s1");
  });

  it("キャラが選択中なら影響しない", () => {
    expect(removeSummon(three(), "s2", "c3").newActiveId).toBe("c3");
  });

  it("最後の1件を消すと選択も解除される", () => {
    const tl = addSummon(makeDefaultTL(), null).next;
    const r = removeSummon(tl, "s1", "s1");
    expect(r.next.summons).toEqual([]);
    expect(r.newActiveId).toBeNull();
  });

  it("元の TL を破壊しない", () => {
    const tl = three();
    removeSummon(tl, "s2", null);
    expect(tl.summons.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(tl.prep.placements.s3).toEqual({ x: 3, y: 3 });
  });
});

describe("pruneInvalidPlacements", () => {
  const base = () => {
    const tl = makeDefaultTL(); // 19x19, boss = (8,8)-(10,10)
    tl.grid = { cols: 10, rows: 10 };
    tl.boss = { x: 4, y: 4, w: 2, h: 2 };
    return tl;
  };

  it("盤内かつボス領域外の配置だけ残す", () => {
    const tl = base();
    tl.prep.placements = {
      c1: { x: 0, y: 0 }, // 盤内・ボス外 → 残る
      c2: { x: 4, y: 4 }, // ボス領域 → 消える
      c3: { x: 10, y: 0 }, // 盤外(x) → 消える
      c4: { x: 0, y: 10 }, // 盤外(y) → 消える
      c5: { x: -1, y: 0 }, // 負の座標 → 消える
    };
    pruneInvalidPlacements(tl);
    expect(tl.prep.placements).toEqual({ c1: { x: 0, y: 0 } });
  });

  it("prep と全ターンに適用される", () => {
    const tl = base();
    tl.prep.placements = { c1: { x: 9, y: 9 } };
    tl.turns.forEach((t) => {
      t.placements = { c1: { x: 4, y: 5 }, c2: { x: 1, y: 1 } };
    });
    pruneInvalidPlacements(tl);
    expect(tl.prep.placements).toEqual({ c1: { x: 9, y: 9 } });
    tl.turns.forEach((t) => {
      expect(t.placements).toEqual({ c2: { x: 1, y: 1 } });
    });
  });

  it("boss 未設定なら既定のボス領域で判定する", () => {
    const tl = makeDefaultTL();
    delete tl.boss;
    tl.prep.placements = { c1: { x: 9, y: 9 }, c2: { x: 0, y: 0 } };
    pruneInvalidPlacements(tl);
    expect(tl.prep.placements).toEqual({ c2: { x: 0, y: 0 } });
  });
});

describe("countInvalidPlacements", () => {
  it("盤外とボス領域の配置を数える", () => {
    const tl = makeDefaultTL();
    tl.grid = { cols: 10, rows: 10 };
    tl.boss = { x: 4, y: 4, w: 2, h: 2 };
    tl.prep.placements = {
      c1: { x: 0, y: 0 }, // 正常
      c2: { x: 4, y: 4 }, // ボス
      c3: { x: 99, y: 0 }, // 盤外
    };
    tl.turns[0].placements = { c4: { x: 0, y: 99 } }; // 盤外
    expect(countInvalidPlacements(tl)).toBe(3);
  });

  it("問題なければ 0", () => {
    const tl = makeDefaultTL();
    tl.prep.placements = { c1: { x: 0, y: 0 } };
    expect(countInvalidPlacements(tl)).toBe(0);
  });

  it("pruneInvalidPlacements の後は必ず 0 になる", () => {
    const tl = makeDefaultTL();
    tl.grid = { cols: 8, rows: 8 };
    tl.prep.placements = { c1: { x: 20, y: 20 }, c2: { x: 3, y: 3 } };
    pruneInvalidPlacements(tl);
    expect(countInvalidPlacements(tl)).toBe(0);
  });
});

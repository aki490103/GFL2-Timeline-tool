import { describe, expect, it } from "vitest";
import { CHARACTER_OPTIONS } from "./characters";
import { COMMON_KEY_OPTIONS } from "./common_keys";
import { SUMMON_OPTIONS } from "./summons";
import { WEAPON_OPTIONS } from "./weapons";

/**
 * データ定義どうしの整合性を守るテスト。
 * キャラ追加や改名のたびに手で突き合わせるのは現実的でないため、
 * 「括弧内のキャラ名が実在するか」といった規約をここで機械的に検査する。
 */

const CHAR_NAMES = new Set(CHARACTER_OPTIONS.map((c) => c.name));

/** 「表示名（キャラ名）」形式の末尾の括弧からキャラ名を取り出す */
const parenOwner = (label: string): string | null =>
  /（([^（）]+)）$/.exec(label)?.[1] ?? null;

const duplicates = (xs: string[]) => [
  ...new Set(xs.filter((x, i) => xs.indexOf(x) !== i)),
];

describe("CHARACTER_OPTIONS", () => {
  it("名前が重複していない", () => {
    expect(duplicates(CHARACTER_OPTIONS.map((c) => c.name))).toEqual([]);
  });

  it("name / yomi / type が空でない", () => {
    for (const c of CHARACTER_OPTIONS) {
      expect(c.name, "name").not.toBe("");
      expect(c.yomi, `yomi of ${c.name}`).not.toBe("");
      expect(c.type, `type of ${c.name}`).not.toBe("");
    }
  });

  it("固有キーが6個ずつあり、キャラ内で重複していない", () => {
    for (const c of CHARACTER_OPTIONS) {
      expect(c.uniqueKeyOptions, `${c.name} の固有キー数`).toHaveLength(6);
      expect(duplicates(c.uniqueKeyOptions), `${c.name} の固有キー`).toEqual(
        [],
      );
    }
  });

  it("固有キーが空文字を含まない", () => {
    for (const c of CHARACTER_OPTIONS) {
      for (const k of c.uniqueKeyOptions) expect(k).not.toBe("");
    }
  });
});

describe("WEAPON_OPTIONS", () => {
  it("名前が重複していない", () => {
    expect(duplicates(WEAPON_OPTIONS.map((w) => w.name))).toEqual([]);
  });

  it("name / yomi / type が空でない", () => {
    for (const w of WEAPON_OPTIONS) {
      expect(w.name, "name").not.toBe("");
      expect(w.yomi, `yomi of ${w.name}`).not.toBe("");
      expect(w.type, `type of ${w.name}`).not.toBe("");
    }
  });

  it("どのキャラtypeにも武器が1本以上ある（武器欄が空にならない）", () => {
    const weaponTypes = new Set(WEAPON_OPTIONS.map((w) => w.type));
    for (const c of CHARACTER_OPTIONS) {
      expect(weaponTypes, `${c.name}(${c.type}) 用の武器`).toContain(c.type);
    }
  });

  it("どの武器typeにも対応するキャラがいる（選べない武器が残っていない）", () => {
    const charTypes = new Set(CHARACTER_OPTIONS.map((c) => c.type));
    for (const w of WEAPON_OPTIONS) {
      expect(charTypes, `${w.name}(${w.type}) を使えるキャラ`).toContain(
        w.type,
      );
    }
  });
});

describe("COMMON_KEY_OPTIONS", () => {
  it("重複していない", () => {
    expect(duplicates(COMMON_KEY_OPTIONS)).toEqual([]);
  });

  it("括弧内のキャラ名が全て実在する", () => {
    // 「（汎用）〜」だけは所有キャラを持たない
    const owners = COMMON_KEY_OPTIONS.filter(
      (k) => !k.startsWith("（汎用）"),
    ).map((k) => ({ key: k, owner: parenOwner(k) }));

    for (const { key, owner } of owners) {
      expect(owner, `${key} の括弧が「（キャラ名）」形式`).not.toBeNull();
      expect(CHAR_NAMES, `${key} の所有キャラ`).toContain(owner!);
    }
  });

  it("1キャラにつき共通キーは1つまで", () => {
    const owners = COMMON_KEY_OPTIONS.filter(
      (k) => !k.startsWith("（汎用）"),
    ).map((k) => parenOwner(k)!);
    expect(duplicates(owners)).toEqual([]);
  });
});

describe("SUMMON_OPTIONS", () => {
  it("名前が重複していない", () => {
    expect(duplicates(SUMMON_OPTIONS.map((s) => s.name))).toEqual([]);
  });

  it("括弧内の召喚元キャラが全て実在する", () => {
    for (const s of SUMMON_OPTIONS) {
      const owner = parenOwner(s.name);
      expect(owner, `${s.name} の括弧が「（キャラ名）」形式`).not.toBeNull();
      expect(CHAR_NAMES, `${s.name} の召喚元`).toContain(owner!);
    }
  });

  it("表示名(alias)が設定されていて、括弧を含まない", () => {
    for (const s of SUMMON_OPTIONS) {
      expect(s.alias, `${s.name} の alias`).toBeTruthy();
      expect(s.alias, `${s.name} の alias`).not.toMatch(/[（）]/);
    }
  });
});

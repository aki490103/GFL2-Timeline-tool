import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHARACTER_OPTIONS } from "./characters";
import { COMMON_KEY_OPTIONS } from "./common_keys";
import { ORDER_LOCK, type OrderLock } from "./order-lock";
import { SUMMON_OPTIONS } from "./summons";
import { WEAPON_OPTIONS } from "./weapons";

/**
 * order-lock.ts（共有URL v2 の添字表）をデータ定義と同期させる。
 *
 *   通常の `npm test` : 添字表への追記漏れを検出するだけ（書き換えない）
 *   `make lock`       : UPDATE_ORDER_LOCK=1 で走り、不足分を末尾へ追記する
 *
 * 追記しかしないので、このスクリプトが既存URLを壊すことはない。
 * 唯一 人間の判断が要るのは「添字表にあるがデータに無い名前」で、
 * その場合はここで止めて指示を出す（下の ORPHAN_HINT）。
 */

/**
 * 意図的にデータから削除した名前。
 * 削除しても添字が動かないよう、添字表からは消さずにここへ列挙する。
 * （改名の場合はここではなく order-lock.ts の同じ位置を書き換えること）
 */
const RETIRED: string[] = [];

const UPDATE = process.env.UPDATE_ORDER_LOCK === "1";

const ORPHAN_HINT =
  "添字表にあるがデータ定義に無い名前です。\n" +
  "  改名した場合   : order-lock.ts の同じ位置の文字列を書き換える（末尾に追記しない）\n" +
  "  意図的に削除   : order-lock.sync.test.ts の RETIRED に名前を追加する\n" +
  "  どちらでもない : データ定義側の消し忘れを疑う";

/** locked に無い名前だけを、順序を保ったまま末尾へ足す */
const appendMissing = (locked: string[], current: string[]): string[] => [
  ...locked,
  ...current.filter((name) => !locked.includes(name)),
];

const charNames = CHARACTER_OPTIONS.map((c) => c.name);
const weaponNames = WEAPON_OPTIONS.map((w) => w.name);
const summonNames = SUMMON_OPTIONS.map((s) => s.name);

const uniqueKeysOf = (name: string): string[] =>
  CHARACTER_OPTIONS.find((c) => c.name === name)?.uniqueKeyOptions ?? [];

const buildNextLock = (): OrderLock => {
  const characters = appendMissing(ORDER_LOCK.characters, charNames);
  return {
    characters,
    // uniqueKeys は characters と同じ添字で対応させる
    uniqueKeys: characters.map((name, i) =>
      appendMissing(ORDER_LOCK.uniqueKeys[i] ?? [], uniqueKeysOf(name)),
    ),
    weapons: appendMissing(ORDER_LOCK.weapons, weaponNames),
    commonKeys: appendMissing(ORDER_LOCK.commonKeys, COMMON_KEY_OPTIONS),
    summons: appendMissing(ORDER_LOCK.summons, summonNames),
  };
};

/** 添字表にあるが、データ定義にも RETIRED にも無い名前 */
const orphansOf = (locked: string[], current: string[]): string[] => {
  const alive = new Set([...current, ...RETIRED]);
  return locked.filter((name) => !alive.has(name));
};

const allOrphans = (): Record<string, string[]> => {
  const out: Record<string, string[]> = {
    characters: orphansOf(ORDER_LOCK.characters, charNames),
    weapons: orphansOf(ORDER_LOCK.weapons, weaponNames),
    commonKeys: orphansOf(ORDER_LOCK.commonKeys, COMMON_KEY_OPTIONS),
    summons: orphansOf(ORDER_LOCK.summons, summonNames),
  };
  ORDER_LOCK.characters.forEach((name, i) => {
    const o = orphansOf(ORDER_LOCK.uniqueKeys[i] ?? [], uniqueKeysOf(name));
    if (o.length) out[`uniqueKeys[${i}] ${name}`] = o;
  });
  for (const k of Object.keys(out)) if (!out[k].length) delete out[k];
  return out;
};

const missingOf = (locked: string[], current: string[]): string[] => {
  const known = new Set(locked);
  return current.filter((name) => !known.has(name));
};

const allMissing = (): Record<string, string[]> => {
  const out: Record<string, string[]> = {
    characters: missingOf(ORDER_LOCK.characters, charNames),
    weapons: missingOf(ORDER_LOCK.weapons, weaponNames),
    commonKeys: missingOf(ORDER_LOCK.commonKeys, COMMON_KEY_OPTIONS),
    summons: missingOf(ORDER_LOCK.summons, summonNames),
  };
  CHARACTER_OPTIONS.forEach((c) => {
    const i = ORDER_LOCK.characters.indexOf(c.name);
    if (i < 0) return; // キャラ自体が未登録なら characters 側で検出済み
    const m = missingOf(ORDER_LOCK.uniqueKeys[i] ?? [], c.uniqueKeyOptions);
    if (m.length) out[`uniqueKeys[${i}] ${c.name}`] = m;
  });
  for (const k of Object.keys(out)) if (!out[k].length) delete out[k];
  return out;
};

const HEADER = `// 自動生成ファイル。手で並び替え・削除しないこと（\`make lock\` が追記する）。
//
// 共有URL(v2) はキャラ名・武器名・キー名を「この表の添字」として埋め込む。
// したがってここでの位置は公開APIと同じ重みを持つ。
//
//   安全 : 末尾への追加（make lock が行う）
//   安全 : 同じ位置の文字列の書き換え（＝改名）
//   危険 : 並び替え・途中への挿入・削除
//          → 既に配布された共有URLが別の編成として開く
//
// 画面に出す順序とは無関係なので、src/data/*.ts の並びは自由に変えてよい。
// 対応する検査は order-lock.sync.test.ts にある。
`;

const render = (lock: OrderLock): string =>
  `${HEADER}
export type OrderLock = {
  characters: string[];
  uniqueKeys: string[][];
  weapons: string[];
  commonKeys: string[];
  summons: string[];
};

export const ORDER_LOCK: OrderLock = ${JSON.stringify(lock, null, 2)};
`;

describe("共有URLの添字表（order-lock）", () => {
  it("添字表にあるがデータ定義に無い名前が無い", () => {
    expect(allOrphans(), ORPHAN_HINT).toEqual({});
  });

  it("添字表の中で名前が重複していない", () => {
    const dup = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);
    expect(dup(ORDER_LOCK.characters), "characters").toEqual([]);
    expect(dup(ORDER_LOCK.weapons), "weapons").toEqual([]);
    expect(dup(ORDER_LOCK.commonKeys), "commonKeys").toEqual([]);
    expect(dup(ORDER_LOCK.summons), "summons").toEqual([]);
    ORDER_LOCK.uniqueKeys.forEach((keys, i) => {
      expect(dup(keys), `uniqueKeys[${i}] ${ORDER_LOCK.characters[i]}`).toEqual(
        [],
      );
    });
  });

  it("uniqueKeys が characters と同じ件数ある", () => {
    expect(ORDER_LOCK.uniqueKeys).toHaveLength(ORDER_LOCK.characters.length);
  });

  it("データ定義の全要素が添字表に登録されている", () => {
    if (UPDATE) {
      // 孤児がある状態での追記は改名を取り違えるので、先に人間に判断させる
      expect(allOrphans(), ORPHAN_HINT).toEqual({});
      writeFileSync(
        new URL("./order-lock.ts", import.meta.url),
        render(buildNextLock()),
      );
      return;
    }
    expect(
      allMissing(),
      "`make lock` を実行して添字表を更新してください",
    ).toEqual({});
  });
});

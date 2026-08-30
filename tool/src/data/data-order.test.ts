import { describe, expect, it } from "vitest";
import { CHARACTER_OPTIONS } from "./characters";
import { COMMON_KEY_OPTIONS } from "./common_keys";
import { SUMMON_OPTIONS } from "./summons";
import { WEAPON_OPTIONS } from "./weapons";

/**
 * 共有URL(v2)は、キャラ名・武器名・キー名を「候補リストの添字」として
 * 埋め込んでいる。したがって候補リストの並び順は公開APIと同じ重みを持つ。
 *
 *   安全   : 末尾への追加、名前の変更（添字が動かない）
 *   危険   : 並び替え・途中への挿入・削除
 *            → 既にDiscord等に貼られた共有URLが別の編成として開く
 *
 * このスナップショットは並び順の変化を検出するための錠。
 * 意図した変更（末尾追加・改名）なら `npm test -- -u` で更新してよい。
 * 途中挿入や並び替えでこのテストが落ちた場合は、更新ではなく
 * 「末尾に追加する」形へ直すこと。
 */
describe("候補リストの並び順（共有URLの互換性）", () => {
  it("キャラの並び順が変わっていない（並び替え・途中挿入は既存の共有URLを壊す）", () => {
    expect(CHARACTER_OPTIONS.map((c) => c.name)).toMatchSnapshot();
  });

  it("キャラごとの固有キーの並び順が変わっていない", () => {
    expect(
      Object.fromEntries(
        CHARACTER_OPTIONS.map((c, i) => [`${i}:${c.name}`, c.uniqueKeyOptions]),
      ),
    ).toMatchSnapshot();
  });

  it("武器の並び順が変わっていない", () => {
    expect(WEAPON_OPTIONS.map((w) => w.name)).toMatchSnapshot();
  });

  it("共通キーの並び順が変わっていない", () => {
    expect(COMMON_KEY_OPTIONS).toMatchSnapshot();
  });

  it("召喚物の並び順が変わっていない", () => {
    expect(SUMMON_OPTIONS.map((s) => s.name)).toMatchSnapshot();
  });
});

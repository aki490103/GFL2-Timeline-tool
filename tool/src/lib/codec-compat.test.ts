import { describe, expect, it } from "vitest";
import { decodeTL } from "./codec";

/**
 * 配布済み共有URLの回帰テスト。
 *
 * ここに置いた URL は「添字表（src/data/order-lock.ts）を導入する前のコード」で
 * 生成したもので、Discord 等に既に貼られている URL と同じ性質を持つ。
 * 添字表の並び替え・途中挿入・削除が起きると、この URL が別の編成として
 * 開くようになり、このテストが落ちる。
 *
 * 候補リストの先頭・中間・末尾の要素を混ぜてあるため、
 * どの位置に手が入っても検出できる。
 *
 * このテストが落ちたときに期待値を書き換えてはいけない。
 * 添字表を壊した変更の方を取り消すこと。
 */
const SHARED_URL =
  "#v2:eJyLNtJRerZ999O1018sXPG4cd2TXZOe9c9-1rD8cXPb46adj5s7lHSiDS11DC1jdaItdCx0jHWMgaxoAyDDQAdMmcaCaQMdU8tYINMIpMbIEqucqRlIzBirnCFQyBC7LlOQrSZY5MBsUx1DA5CTgEwgBLJAwtEmQLUmMA5JdGwsACI1Uo4";

describe("配布済み共有URL(v2)の互換性", () => {
  const tl = decodeTL(SHARED_URL)!;

  it("読み込める", () => {
    expect(tl).not.toBeNull();
    expect(tl.title).toBe("添字表の互換性テスト");
  });

  it("キャラ・武器・キーが当時と同じ", () => {
    expect(
      tl.characters.map((c) => ({
        name: c.name,
        weapon: c.equipment.weapon,
        uniqueKeySet: c.equipment.uniqueKeySet,
        commonKeySet: c.equipment.commonKeySet,
      })),
    ).toEqual([
      {
        name: "ヴェプリー",
        weapon: "ハートハンター",
        uniqueKeySet: ["安全な鑑賞距離", "ダイノダッシュ", "舞台堅守"],
        commonKeySet: [
          "（汎用）攻撃%会心率",
          "終わらぬ深夜（リンド）",
          "狩猟トラップ（ロッタ）",
        ],
      },
      {
        name: "リヴァ",
        weapon: "ライオンセル",
        uniqueKeySet: ["大人の余裕", "隠密戦略", "準備万端"],
        commonKeySet: [
          "（汎用）攻撃%会心率",
          "終わらぬ深夜（リンド）",
          "狩猟トラップ（ロッタ）",
        ],
      },
      {
        name: "ロッタ",
        weapon: "ソーリングバード",
        uniqueKeySet: ["静かな支援", "慎重回避", "慰撫"],
        commonKeySet: [
          "（汎用）攻撃%会心率",
          "終わらぬ深夜（リンド）",
          "狩猟トラップ（ロッタ）",
        ],
      },
      {
        name: "ペリティア",
        weapon: "ミラージュ",
        uniqueKeySet: [
          "臨時システムメンテナンス",
          "無気力な抵抗",
          "友好的な交流",
        ],
        commonKeySet: [
          "（汎用）攻撃%会心率",
          "終わらぬ深夜（リンド）",
          "狩猟トラップ（ロッタ）",
        ],
      },
      {
        name: "リッタラ",
        weapon: "ネオルド",
        uniqueKeySet: ["計画制定", "隙を突く", "積極攻撃"],
        commonKeySet: [
          "（汎用）攻撃%会心率",
          "終わらぬ深夜（リンド）",
          "狩猟トラップ（ロッタ）",
        ],
      },
    ]);
  });

  it("召喚物が当時と同じ", () => {
    expect(tl.summons.map((s) => s.name)).toEqual([
      "ガーディアン（ペーペーシャ）",
      "連携防御構装（バチルダ）",
      "ペガサス（劉蒔）",
    ]);
  });
});

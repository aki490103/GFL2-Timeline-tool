import { deflate, inflate } from "pako";
import { CHARACTER_OPTIONS } from "../data/characters";
import { COMMON_KEY_OPTIONS } from "../data/common_keys";
import { SUMMON_OPTIONS } from "../data/summons";
import { WEAPON_OPTIONS } from "../data/weapons";
import { CHAR_SLOT_IDS } from "./defaults";
import { defaultBoss } from "./grid";
import { asArray, asInt, asString, atIndex } from "./guards";
import { normalizeTimeline } from "./normalize";
import type { Step, TimelineV1, Turn } from "./types";

// ===============================
// base64url
// ===============================
export const b64u = {
  enc: (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, ""),
  dec: (str: string) => {
    const pad = str.length % 4 ? "=".repeat(4 - (str.length % 4)) : "";
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

const pack = (payload: unknown) =>
  b64u.enc(deflate(new TextEncoder().encode(JSON.stringify(payload))));

const unpack = (body: string): unknown =>
  JSON.parse(new TextDecoder().decode(inflate(b64u.dec(body))));

// ===============================
// v2: 位置配列 + 候補リストへの添字
// ===============================
// v1 は JSON のキー名（"placements" 等）と日本語の名前をそのまま並べていたため
// URL が非常に長くなっていた。v2 では
//   1. オブジェクトを位置配列にしてキー名を消す
//   2. キャラ名・武器名・キー名を候補リストの添字にする
// ことで、全欄を埋めた編成で 1894 文字 → 603 文字になる。
//
// 添字方式の代償として「候補リストの並び替え・途中挿入・削除」は
// 既存の共有URLを壊す。src/data/order-lock.json と data-order.test.ts が
// これを機械的に防いでいる。
// 逆に「名前の変更」は添字が動かないため安全（v1 では URL が壊れていた）。

const NOT_SELECTED = -1;

/** アクターIDと連番スロットの相互変換（0..4 = c1..c5、5.. = s1..sN） */
const actorToSlot = (id: string, summonCount: number): number => {
  const c = CHAR_SLOT_IDS.indexOf(id as (typeof CHAR_SLOT_IDS)[number]);
  if (c >= 0) return c;
  const m = /^s(\d+)$/.exec(id);
  if (!m) return NOT_SELECTED;
  const i = Number(m[1]) - 1;
  return i >= 0 && i < summonCount ? CHAR_SLOT_IDS.length + i : NOT_SELECTED;
};

const slotToActor = (slot: unknown, summonCount: number): string | null => {
  const n = asInt(slot, NOT_SELECTED);
  if (n >= 0 && n < CHAR_SLOT_IDS.length) return CHAR_SLOT_IDS[n];
  const i = n - CHAR_SLOT_IDS.length;
  return i >= 0 && i < summonCount ? `s${i + 1}` : null;
};

const indexOfName = (list: readonly { name: string }[], name?: string) =>
  name ? list.findIndex((o) => o.name === name) : NOT_SELECTED;

/** スキルも備考も空の行は情報を持たないので URL には載せない */
const isBlankStep = (s: Step) => s.skill === "" && (s.note ?? "") === "";

const encodeTurnV2 = (t: Turn, summonCount: number) => [
  Object.entries(t.placements).flatMap(([id, p]) => {
    const slot = actorToSlot(id, summonCount);
    return slot === NOT_SELECTED ? [] : [slot, p.x, p.y];
  }),
  t.steps
    .filter((s) => !isBlankStep(s))
    .map((s) => [
      s.order,
      actorToSlot(s.actorId, summonCount),
      s.skill,
      s.note ?? "",
    ]),
];

const encodeV2 = (tl: TimelineV1): unknown[] => {
  const boss = tl.boss ?? defaultBoss(tl.grid);
  const n = tl.summons.length;
  return [
    2,
    tl.title ?? "",
    [tl.grid.cols, tl.grid.rows],
    [boss.x, boss.y, boss.w, boss.h],
    tl.characters.map((c) => {
      const ci = indexOfName(CHARACTER_OPTIONS, c.name);
      const uniqueOptions = CHARACTER_OPTIONS[ci]?.uniqueKeyOptions ?? [];
      return [
        ci,
        c.equipment.limitBreak,
        indexOfName(WEAPON_OPTIONS, c.equipment.weapon),
        c.equipment.uniqueKeySet.map((k) =>
          k ? uniqueOptions.indexOf(k) : NOT_SELECTED,
        ),
        c.equipment.commonKeySet.map((k) =>
          k ? COMMON_KEY_OPTIONS.indexOf(k) : NOT_SELECTED,
        ),
      ];
    }),
    tl.summons.map((s) => indexOfName(SUMMON_OPTIONS, s.name)),
    [tl.prep, ...tl.turns].map((t) => encodeTurnV2(t, n)),
  ];
};

/**
 * v2 配列を v1 相当のオブジェクトへ戻す。
 * ここでやるのは「添字を名前へ」「スロットをアクターIDへ」の復号だけで、
 * 欠損の補完や範囲チェックは normalizeTimeline に任せる。
 * そのため読めなかった値は 0 などで埋めず、生のまま渡す。
 */
const decodeV2 = (payload: unknown): unknown => {
  const [, title, grid, boss, chars, summons, turns] = asArray(payload);
  const [cols, rows] = asArray(grid);
  const [bx, by, bw, bh] = asArray(boss);

  const summonList = asArray(summons).map((si) => ({
    name: atIndex(SUMMON_OPTIONS, si)?.name ?? "",
  }));
  const n = summonList.length;

  const decodeTurn = (raw: unknown) => {
    const [flatPlacements, steps] = asArray(raw);
    const flat = asArray(flatPlacements);
    const placements: Record<string, unknown> = {};
    for (let i = 0; i + 2 < flat.length; i += 3) {
      const id = slotToActor(flat[i], n);
      if (!id) continue;
      placements[id] = { x: flat[i + 1], y: flat[i + 2] };
    }
    return {
      placements,
      steps: asArray(steps).map((s) => {
        const [order, slot, skill, note] = asArray(s);
        return {
          order,
          actorId: slotToActor(slot, n) ?? "",
          skill: asString(skill),
          note: asString(note),
        };
      }),
    };
  };

  const decodedTurns = asArray(turns).map(decodeTurn);

  return {
    v: 1,
    title: asString(title),
    grid: { cols, rows },
    boss: { x: bx, y: by, w: bw, h: bh },
    characters: asArray(chars).map((raw, i) => {
      const [ci, limitBreak, wi, uks, cks] = asArray(raw);
      const opt = atIndex(CHARACTER_OPTIONS, ci);
      const uniqueOptions = opt?.uniqueKeyOptions ?? [];
      return {
        id: CHAR_SLOT_IDS[i],
        name: opt?.name ?? "",
        equipment: {
          limitBreak,
          weapon: atIndex(WEAPON_OPTIONS, wi)?.name ?? "",
          uniqueKeySet: asArray(uks).map((k) => atIndex(uniqueOptions, k)),
          commonKeySet: asArray(cks).map((k) => atIndex(COMMON_KEY_OPTIONS, k)),
        },
      };
    }),
    summons: summonList,
    prep: decodedTurns[0],
    turns: decodedTurns.slice(1),
  };
};

// ===============================
// 公開API
// ===============================
export const encodeTL = (tl: TimelineV1) => "v2:" + pack(encodeV2(tl));

/** 移行期間の検証用。実際の共有URLは v2 で生成される */
export const encodeTLv1 = (tl: TimelineV1) => "v1:" + pack(tl);

/**
 * 共有URLのハッシュを読み取る。
 * 既に配布済みの v1 URL も読めるよう、両方の形式を受け付ける。
 */
export const decodeTL = (hash: string): TimelineV1 | null => {
  const m = /^#v([12]):(.*)$/s.exec(hash);
  if (!m) return null;
  try {
    const payload = unpack(m[2]);
    if (m[1] === "2") return normalizeTimeline(decodeV2(payload));
    // v1 は JSON をそのまま載せていた形式
    return payload && (payload as { v?: unknown }).v === 1
      ? normalizeTimeline(payload)
      : null;
  } catch (e) {
    console.error("Failed to decode TL from hash:", e);
    return null;
  }
};

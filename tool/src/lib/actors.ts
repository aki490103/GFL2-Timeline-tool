import { CHARACTER_OPTIONS, type CharacterOption } from "../data/characters";
import { COMMON_KEY_OPTIONS } from "../data/common_keys";
import { SUMMON_OPTIONS, type SummonOption } from "../data/summons";
import { isBossCell, isInGrid } from "./grid";
import type { Position, TimelineV1, Turn } from "./types";

// アクター識別（キャラ or 召喚物）
export const isSummonId = (id: string) => id.startsWith("s");

export const getCharOption = (name: string): CharacterOption | undefined =>
  CHARACTER_OPTIONS.find((o) => o.name === name);

// グリッド等で表示する別名は候補リスト由来で固定
export const aliasForName = (name: string | undefined): string =>
  name ? (getCharOption(name)?.alias ?? name) : "";

export const getSummonOption = (name: string): SummonOption | undefined =>
  SUMMON_OPTIONS.find((o) => o.name === name);

export const aliasForSummon = (name: string | undefined) =>
  name ? (getSummonOption(name)?.alias ?? name) : "";

export const uniqueKeyOptionsForName = (name: string): string[] =>
  getCharOption(name)?.uniqueKeyOptions ?? [];

type KeySet = [string?, string?, string?];

export const sanitizeUniqueKeys = (name: string, arr: KeySet): KeySet => {
  const allowed = new Set(uniqueKeyOptionsForName(name));
  return arr.map((v) => (v && allowed.has(v) ? v : undefined)) as KeySet;
};

export const sanitizeCommonKeys = (arr: KeySet): KeySet => {
  const allowed = new Set(COMMON_KEY_OPTIONS);
  return arr.map((v) => (v && allowed.has(v) ? v : undefined)) as KeySet;
};

/** 全ターン（prep 含む）を走査する */
export const eachTurn = (tl: TimelineV1, fn: (t: Turn) => void) => {
  if (tl.prep) fn(tl.prep);
  (tl.turns ?? []).forEach(fn);
};

/** 孤児配置掃除（characters/summonsに無いIDを全ターンから削除） */
export const pruneOrphanPlacements = (next: TimelineV1) => {
  const actorIds = new Set<string>([
    ...next.characters.map((c) => c.id),
    ...(next.summons ?? []).map((s) => s.id),
  ]);
  eachTurn(next, (t) => {
    Object.keys(t.placements).forEach((id) => {
      if (!actorIds.has(id)) delete t.placements[id];
    });
  });
};

/**
 * 召喚物の ID を配列順に s1..sN へ振り直し、配置キーも追随させる。
 * `next` は破壊的に更新される。
 */
export const renumberSummons = (
  next: TimelineV1,
  currentActiveId: string | null,
): { next: TimelineV1; newActiveId: string | null } => {
  // 振り直し前の一覧に選択中IDが存在したか（後段の判定で使う）
  const existedBefore = next.summons.some((s) => s.id === currentActiveId);

  // 旧→新IDマップを作成（配列順に s1..sN）
  const idMap = new Map<string, string>();
  next.summons.forEach((s, i) => {
    const newId = `s${i + 1}`;
    if (s.id !== newId) idMap.set(s.id, newId);
  });

  if (idMap.size > 0) {
    next.summons = next.summons.map((s) =>
      idMap.has(s.id) ? { ...s, id: idMap.get(s.id)! } : s,
    );

    // placements（prep 含む & 各ターン）を置換
    const replacePlacementKeys = (pl: Record<string, Position>) => {
      if (!pl) return pl;
      const out: Record<string, Position> = {};
      Object.entries(pl).forEach(([k, v]) => {
        const nk = idMap.get(k) ?? k;
        out[nk] = v;
      });
      return out;
    };

    eachTurn(next, (t) => {
      t.placements = replacePlacementKeys(t.placements);
    });
  }

  // 選択が召喚物なら新IDへ追随させる。
  // 「振り直し前の一覧」に居ないID（＝削除された本人）は選択を解除する。
  // ここを振り直し後の一覧で判定すると、削除した枠に繰り上がった別の召喚物へ
  // 選択がすり替わってしまう。
  let newActiveId = currentActiveId;
  if (currentActiveId && isSummonId(currentActiveId)) {
    newActiveId = existedBefore
      ? (idMap.get(currentActiveId) ?? currentActiveId)
      : null;
  }

  return { next, newActiveId };
};

/**
 * 盤外・ボス領域に食い込んだ配置を全ターンから取り除く。
 * `next` は破壊的に更新される。
 */
export const pruneInvalidPlacements = (next: TimelineV1) => {
  const grid = next.grid;
  const boss = next.boss;
  eachTurn(next, (t) => {
    for (const id of Object.keys(t.placements)) {
      const p = t.placements[id];
      if (!p || !isInGrid(grid, p) || isBossCell(boss, grid, p.x, p.y)) {
        delete t.placements[id];
      }
    }
  });
};

/** 召喚物を1件追加する（ID の振り直しと選択の追随込み） */
export const addSummon = (
  tl: TimelineV1,
  currentActiveId: string | null,
): { next: TimelineV1; newActiveId: string | null } => {
  const next = structuredClone(tl);
  const name = SUMMON_OPTIONS[0]?.name ?? "召喚物";
  next.summons = [
    ...(next.summons ?? []),
    {
      id: `s${(next.summons ?? []).length + 1}`,
      name,
      alias: aliasForSummon(name),
    },
  ];
  return renumberSummons(next, currentActiveId);
};

/** 召喚物を1件削除する（配置の掃除・ID の振り直し・選択の追随込み） */
export const removeSummon = (
  tl: TimelineV1,
  summonId: string,
  currentActiveId: string | null,
): { next: TimelineV1; newActiveId: string | null } => {
  const next = structuredClone(tl);
  next.summons = (next.summons ?? []).filter((x) => x.id !== summonId);
  // 一覧から消えた時点で、その ID の配置は全ターンで孤児になる
  pruneOrphanPlacements(next);
  return renumberSummons(next, currentActiveId);
};

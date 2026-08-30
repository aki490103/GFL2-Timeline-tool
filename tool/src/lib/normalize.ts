import {
  aliasForName,
  aliasForSummon,
  getCharOption,
  pruneOrphanPlacements,
  sanitizeCommonKeys,
  sanitizeUniqueKeys,
} from "./actors";
import {
  CHAR_SLOT_IDS,
  LIMIT_BREAK_MAX,
  MAX_SUMMONS,
  STEPS_PER_TURN,
  slotColor,
} from "./defaults";
import { GRID_MAX, GRID_MIN, defaultBoss, defaultGrid } from "./grid";
import type {
  BossArea,
  Character,
  Equipment,
  Grid,
  Position,
  Step,
  Summon,
  TimelineV1,
  Turn,
  TurnIndex,
} from "./types";

// ===============================
// プリミティブ
// ===============================
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const asString = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

const asInt = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback;

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// ===============================
// 各パーツ
// ===============================
const normalizeGrid = (v: unknown): Grid => {
  if (!isRecord(v)) return { ...defaultGrid };
  return {
    cols: clamp(asInt(v.cols, defaultGrid.cols), GRID_MIN, GRID_MAX),
    rows: clamp(asInt(v.rows, defaultGrid.rows), GRID_MIN, GRID_MAX),
  };
};

const normalizeBoss = (v: unknown, grid: Grid): BossArea => {
  if (!isRecord(v)) return defaultBoss(grid);
  const fallback = defaultBoss(grid);
  return {
    x: Math.max(0, asInt(v.x, fallback.x)),
    y: Math.max(0, asInt(v.y, fallback.y)),
    w: Math.max(1, asInt(v.w, fallback.w)),
    h: Math.max(1, asInt(v.h, fallback.h)),
  };
};

const normalizePosition = (v: unknown): Position | null => {
  if (!isRecord(v)) return null;
  if (typeof v.x !== "number" || typeof v.y !== "number") return null;
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) return null;
  return { x: Math.trunc(v.x), y: Math.trunc(v.y) };
};

const normalizePlacements = (v: unknown): Record<string, Position> => {
  const out: Record<string, Position> = {};
  if (!isRecord(v)) return out;
  for (const [k, raw] of Object.entries(v)) {
    const pos = normalizePosition(raw);
    if (pos) out[k] = pos;
  }
  return out;
};

const normalizeSteps = (v: unknown): Step[] => {
  const seen = new Set<number>();
  const out: Step[] = [];
  for (const raw of asArray(v)) {
    if (!isRecord(raw)) continue;
    const order = asInt(raw.order, 0);
    if (order < 1 || order > STEPS_PER_TURN || seen.has(order)) continue;
    seen.add(order);
    const step: Step = {
      order,
      actorId: asString(raw.actorId),
      skill: asString(raw.skill),
    };
    if (typeof raw.note === "string") step.note = raw.note;
    out.push(step);
  }
  return out.sort((a, b) => a.order - b.order);
};

const normalizeTurn = (v: unknown, index: TurnIndex): Turn => {
  const src = isRecord(v) ? v : {};
  return {
    index,
    placements: normalizePlacements(src.placements),
    steps: normalizeSteps(src.steps),
  };
};

const toKeySet = (v: unknown): [string?, string?, string?] => {
  const a = asArray(v);
  const one = (x: unknown) => (typeof x === "string" && x ? x : undefined);
  return [one(a[0]), one(a[1]), one(a[2])];
};

const normalizeEquipment = (v: unknown, charName: string): Equipment => {
  const src = isRecord(v) ? v : {};
  return {
    limitBreak: clamp(asInt(src.limitBreak, 0), 0, LIMIT_BREAK_MAX),
    weapon: asString(src.weapon),
    uniqueKeySet: sanitizeUniqueKeys(charName, toKeySet(src.uniqueKeySet)),
    commonKeySet: sanitizeCommonKeys(toKeySet(src.commonKeySet)),
  };
};

const normalizeCharacter = (v: unknown, id: string): Character => {
  const src = isRecord(v) ? v : {};
  const name = asString(src.name);
  // alias / ctype / color は候補リストとスロットから必ず導出する
  // （URL に古い値が入っていても表示や武器の絞り込みがズレないように）
  return {
    id,
    name,
    alias: aliasForName(name),
    ctype: getCharOption(name)?.type,
    color: slotColor(id),
    equipment: normalizeEquipment(src.equipment, name),
  };
};

const normalizeSummons = (v: unknown): Summon[] =>
  asArray(v)
    .slice(0, MAX_SUMMONS)
    .map((raw, i): Summon => {
      const src = isRecord(raw) ? raw : {};
      const name = asString(src.name);
      return { id: `s${i + 1}`, name, alias: aliasForSummon(name) };
    });

// ===============================
// 本体
// ===============================
/**
 * 任意の入力（共有URL・localStorage・手書きハッシュ）を、
 * 画面が前提としている形の TimelineV1 へ必ず変換する。
 *
 * 欠けている項目は既定値で補い、想定外の値は落とす。ここを通っていれば
 * 画面側は grid / turns / characters の存在を仮定してよい。
 */
export const normalizeTimeline = (input: unknown): TimelineV1 => {
  const src = isRecord(input) ? input : {};

  const grid = normalizeGrid(src.grid);
  const chars = asArray(src.characters);

  const tl: TimelineV1 = {
    v: 1,
    title: typeof src.title === "string" ? src.title : undefined,
    grid,
    boss: normalizeBoss(src.boss, grid),
    characters: CHAR_SLOT_IDS.map((id, i) =>
      normalizeCharacter(
        chars.find((c) => isRecord(c) && c.id === id) ?? chars[i],
        id,
      ),
    ),
    summons: normalizeSummons(src.summons),
    prep: normalizeTurn(src.prep, 0),
    turns: [1, 2, 3, 4, 5, 6, 7].map((i) =>
      normalizeTurn(asArray(src.turns)[i - 1], i as TurnIndex),
    ) as TimelineV1["turns"],
  };

  pruneOrphanPlacements(tl);
  return tl;
};

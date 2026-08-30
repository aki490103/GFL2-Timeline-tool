import type { Equipment, TimelineV1, Turn, TurnIndex } from "./types";
import { defaultBoss, defaultGrid } from "./grid";

export const emptyEquip = (): Equipment => ({
  limitBreak: 0,
  weapon: "",
  uniqueKeySet: [undefined, undefined, undefined],
  commonKeySet: [undefined, undefined, undefined],
});

export const createTurn = (i: TurnIndex): Turn => ({
  index: i,
  placements: {},
  steps: [],
});

export const SLOT_COLORS: Record<string, string> = {
  c1: "#ef4444", // 赤
  c2: "#3b82f6", // 青
  c3: "#10b981", // 緑
  c4: "#f59e0b", // 橙
  c5: "#8b5cf6", // 紫
};
export const slotColor = (id: string) => SLOT_COLORS[id] ?? "#6b7280";

// 召喚物の固定色（s1..s10 用）
export const SUMMON_COLORS = [
  "#06b6d4",
  "#14b8a6",
  "#eab308",
  "#f97316",
  "#a855f7",
  "#22c55e",
  "#f43f5e",
  "#0ea5e9",
  "#84cc16",
  "#d946ef",
];
export const summonColor = (sid: string) => {
  const m = /^s(\d+)$/.exec(sid);
  if (!m) return "#64748b";
  const i = (parseInt(m[1], 10) - 1) % SUMMON_COLORS.length;
  return SUMMON_COLORS[i];
};

export const MAX_SUMMONS = 10;
export const STEPS_PER_TURN = 5;
export const LIMIT_BREAK_MAX = 6;
export const CHAR_SLOT_IDS = ["c1", "c2", "c3", "c4", "c5"] as const;

export const makeDefaultTL = (): TimelineV1 => ({
  v: 1,
  title: "新規TL",
  grid: { ...defaultGrid },
  boss: defaultBoss(defaultGrid),
  characters: CHAR_SLOT_IDS.map((id) => ({
    id,
    name: "",
    alias: "",
    color: slotColor(id),
    equipment: emptyEquip(),
  })),
  summons: [],
  prep: createTurn(0),
  turns: [
    createTurn(1),
    createTurn(2),
    createTurn(3),
    createTurn(4),
    createTurn(5),
    createTurn(6),
    createTurn(7),
  ],
});

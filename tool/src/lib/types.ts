// ===============================
// 型定義
// ===============================
export type Grid = { cols: number; rows: number };
export type BossArea = { x: number; y: number; w: number; h: number };
export type Position = { x: number; y: number };
export type Summon = { id: string; name: string; alias?: string };

export type Equipment = {
  limitBreak: number;
  weapon?: string;
  uniqueKeySet: [string?, string?, string?];
  commonKeySet: [string?, string?, string?];
};

export type Character = {
  id: string;
  name: string;
  alias?: string;
  ctype?: string;
  color: string;
  equipment: Equipment;
};

export type Step = {
  order: number;
  actorId: string;
  skill: string;
  note?: string;
};

export type TurnIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Turn = {
  index: TurnIndex;
  placements: Record<string /* actorId */, Position>;
  steps: Step[];
};

export type TimelineV1 = {
  v: 1;
  title?: string;
  grid: Grid;
  boss?: BossArea;
  characters: Character[];
  summons: Summon[];
  prep: Turn;
  turns: [Turn, Turn, Turn, Turn, Turn, Turn, Turn];
};

// 召喚物の名前と別名（必要に応じて編集）
export type SummonOption = {
  name: string;
  alias?: string;
};

export const SUMMON_OPTIONS: SummonOption[] = [
  {
    name: "ガーディアン（ペーペーシャ）",
    alias: "ガーディアン",
  },
  {
    name: "定息鏑（朝暉）",
    alias: "定息鏑",
  },
  {
    name: "クリーチ（ニキータ）",
    alias: "クリーチ",
  },
  {
    name: "自動砲塔（アンドリス）",
    alias: "自動砲塔",
  },
  {
    name: "アリオス（フローレンス）",
    alias: "アリオス",
  },
];

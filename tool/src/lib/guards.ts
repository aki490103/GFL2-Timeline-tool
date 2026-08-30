/**
 * 外部由来の値（共有URL・localStorage）を安全に読むための小道具。
 * ここを通さずに as でキャストしないこと。
 */

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export const asString = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

export const asInt = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback;

export const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

/** 候補リストの添字として妥当なら要素を、外れていれば undefined を返す */
export const atIndex = <T>(list: readonly T[], i: unknown): T | undefined => {
  const n = asInt(i, -1);
  return n >= 0 && n < list.length ? list[n] : undefined;
};

import { normalizeTimeline } from "./normalize";
import { asInt, asString, isRecord } from "./guards";
import type { TimelineV1 } from "./types";

export type CachedTL = {
  id: string;
  title: string;
  data: TimelineV1;
  savedAt: number;
};

export const CACHE_KEY = "dlf2_tl_cache_v1";
export const MAX_CACHED = 50;

/**
 * localStorage の中身を読む。手で書き換えられていたり、古い形式が
 * 残っていたりしうるので、1件ずつ検証して壊れたものは捨てる。
 */
export const parseCache = (raw: string | null): CachedTL[] => {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item): CachedTL[] => {
    if (!isRecord(item)) return [];
    const id = asString(item.id);
    const title = asString(item.title);
    if (!id || !title) return [];
    return [
      {
        id,
        title,
        data: normalizeTimeline(item.data),
        savedAt: asInt(item.savedAt, 0),
      },
    ];
  });
};

export type UpsertResult = {
  list: CachedTL[];
  /** 既存の同名エントリを上書きしたか */
  overwrote: boolean;
  /** 上限を超えて捨てられた件数 */
  dropped: number;
};

/**
 * 保存一覧へ1件入れる。
 * 同じタイトルがあれば新規追加ではなく上書きする（毎回押すたびに
 * 同名が積み上がると、どれが最新か分からなくなるため）。
 */
export const upsertCache = (
  list: readonly CachedTL[],
  entry: CachedTL,
): UpsertResult => {
  const idx = list.findIndex((x) => x.title === entry.title);
  const overwrote = idx >= 0;
  const rest = overwrote ? list.filter((_, i) => i !== idx) : list;
  const merged = [overwrote ? { ...entry, id: list[idx].id } : entry, ...rest];
  return {
    list: merged.slice(0, MAX_CACHED),
    overwrote,
    dropped: Math.max(0, merged.length - MAX_CACHED),
  };
};

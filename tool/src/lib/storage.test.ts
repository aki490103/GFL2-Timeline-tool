import { describe, expect, it } from "vitest";
import { makeDefaultTL } from "./defaults";
import { MAX_CACHED, parseCache, upsertCache, type CachedTL } from "./storage";

const entry = (title: string, savedAt = 1): CachedTL => ({
  id: `id-${title}`,
  title,
  data: makeDefaultTL(),
  savedAt,
});

describe("parseCache", () => {
  it("空・null・壊れた JSON は空配列", () => {
    expect(parseCache(null)).toEqual([]);
    expect(parseCache("")).toEqual([]);
    expect(parseCache("{{{")).toEqual([]);
    expect(parseCache('{"a":1}')).toEqual([]);
  });

  it("正常な保存データを読める", () => {
    const raw = JSON.stringify([entry("編成A", 123)]);
    const got = parseCache(raw);
    expect(got).toHaveLength(1);
    expect(got[0].title).toBe("編成A");
    expect(got[0].savedAt).toBe(123);
    expect(got[0].data).toEqual(makeDefaultTL());
  });

  it("id または title が欠けた要素は捨てる", () => {
    const raw = JSON.stringify([
      { id: "a", title: "有効", data: makeDefaultTL(), savedAt: 1 },
      { id: "", title: "IDなし", data: makeDefaultTL() },
      { id: "b", title: "", data: makeDefaultTL() },
      null,
      "文字列",
    ]);
    expect(parseCache(raw).map((x) => x.title)).toEqual(["有効"]);
  });

  it("中身が壊れた TL は正規化して救う（保存が丸ごと消えない）", () => {
    const raw = JSON.stringify([{ id: "a", title: "壊れ", data: { v: 1 } }]);
    const got = parseCache(raw);
    expect(got).toHaveLength(1);
    expect(got[0].data.characters).toHaveLength(5);
    expect(got[0].data.turns).toHaveLength(7);
    expect(got[0].savedAt).toBe(0);
  });
});

describe("upsertCache", () => {
  it("新規は先頭に積む", () => {
    const r = upsertCache([entry("A")], entry("B"));
    expect(r.list.map((x) => x.title)).toEqual(["B", "A"]);
    expect(r.overwrote).toBe(false);
    expect(r.dropped).toBe(0);
  });

  it("同じタイトルは新規追加ではなく上書きする", () => {
    const before = [entry("A", 1), entry("B", 2)];
    const r = upsertCache(before, { ...entry("A", 999) });
    expect(r.list).toHaveLength(2);
    expect(r.overwrote).toBe(true);
    expect(r.list[0].title).toBe("A");
    expect(r.list[0].savedAt).toBe(999);
  });

  it("上書き時は元の id を引き継ぐ（呼び出し中のリンクが切れない）", () => {
    const before = [{ ...entry("A"), id: "original" }];
    const r = upsertCache(before, { ...entry("A"), id: "new" });
    expect(r.list[0].id).toBe("original");
  });

  it("上限を超えたら末尾を捨て、捨てた件数を返す", () => {
    const before = Array.from({ length: MAX_CACHED }, (_, i) => entry(`T${i}`));
    const r = upsertCache(before, entry("新規"));
    expect(r.list).toHaveLength(MAX_CACHED);
    expect(r.list[0].title).toBe("新規");
    expect(r.dropped).toBe(1);
    expect(r.list.some((x) => x.title === `T${MAX_CACHED - 1}`)).toBe(false);
  });

  it("上限ちょうどで上書きなら何も捨てない", () => {
    const before = Array.from({ length: MAX_CACHED }, (_, i) => entry(`T${i}`));
    const r = upsertCache(before, entry("T3", 999));
    expect(r.list).toHaveLength(MAX_CACHED);
    expect(r.dropped).toBe(0);
  });

  it("元の配列を破壊しない", () => {
    const before = [entry("A")];
    upsertCache(before, entry("B"));
    expect(before.map((x) => x.title)).toEqual(["A"]);
  });
});

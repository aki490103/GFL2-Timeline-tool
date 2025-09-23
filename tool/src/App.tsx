import React, { useEffect, useMemo, useState } from "react";
// import { compressToEncodedURIComponent as enc, decompressFromEncodedURIComponent as dec } from 'lz-string';
import { deflate, inflate } from "pako";
import { CHARACTER_OPTIONS, type CharacterOption } from "./data/characters";
import { COMMON_KEY_OPTIONS } from "./data/common_keys";
import { WEAPON_OPTIONS } from "./data/weapons";
import { SUMMON_OPTIONS, type SummonOption } from "./data/summons";

// ===============================
// 型定義
// ===============================
type Grid = { cols: number; rows: number };
type Position = { x: number; y: number };
type Summon = { id: string; name: string; alias?: string };

type Equipment = {
  limitBreak: number;
  weapon?: string;
  uniqueKeySet: [string?, string?, string?];
  commonKeySet: [string?, string?, string?];
};

type Character = {
  id: string;
  name: string;
  alias?: string;
  ctype?: string;
  color: string;
  equipment: Equipment;
};

type Step = {
  order: number;
  actorId: string;
  skill: string;
  note?: string;
};

type Turn = {
  index: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  placements: Record<string /* actorId */, Position>;
  steps: Step[];
};

type TimelineV1 = {
  v: 1;
  title?: string;
  grid: Grid;
  characters: Character[];
  summons: Summon[];
  prep: Turn;
  turns: [Turn, Turn, Turn, Turn, Turn, Turn, Turn];
};

// ===============================
// 初期値
// ===============================
const emptyEquip = (): Equipment => ({
  limitBreak: 0,
  weapon: "",
  uniqueKeySet: [undefined, undefined, undefined],
  commonKeySet: [undefined, undefined, undefined],
});

const createTurn = (i: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7): Turn => ({
  index: i,
  placements: {},
  steps: [],
});

const makeDefaultTL = (): TimelineV1 => ({
  v: 1,
  title: "新規TL",
  grid: { cols: 19, rows: 19 },
  characters: [
    {
      id: "c1",
      name: "",
      alias: "",
      color: "#ef4444",
      equipment: emptyEquip(),
    },
    {
      id: "c2",
      name: "",
      alias: "",
      color: "#3b82f6",
      equipment: emptyEquip(),
    },
    {
      id: "c3",
      name: "",
      alias: "",
      color: "#10b981",
      equipment: emptyEquip(),
    },
    {
      id: "c4",
      name: "",
      alias: "",
      color: "#f59e0b",
      equipment: emptyEquip(),
    },
    {
      id: "c5",
      name: "",
      alias: "",
      color: "#8b5cf6",
      equipment: emptyEquip(),
    },
  ],
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

// ===============================
// URLエンコード/デコード
// ===============================
// base64url
const b64u = {
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
const encodeTL = (tl: TimelineV1) => {
  const json = JSON.stringify(tl);
  const utf8 = new TextEncoder().encode(json);
  const z = deflate(utf8);
  return "v1:" + b64u.enc(z);
};

const decodeTL = (hash: string): TimelineV1 | null => {
  if (!hash.startsWith("#v1:")) return null;
  try {
    const raw = b64u.dec(hash.slice(4));
    const utf8 = inflate(raw);
    const json = new TextDecoder().decode(utf8);
    const obj = JSON.parse(json);
    if (obj?.v === 1) return obj as TimelineV1;
  } catch (e) {
    console.error("Failed to decode TL from hash:", e);
  }
  return null;
};

// const encodeTL = (tl: TimelineV1) => `v1:` + enc(JSON.stringify(tl));
// const decodeTL = (hash: string): TimelineV1 | null => {
//   if (!hash.startsWith('#v1:')) return null;
//   try {
//     const json = dec(hash.slice(4));
//     if (!json) return null;
//     const obj = JSON.parse(json);
//     if (obj?.v === 1) return obj as TimelineV1;
//   } catch (e) {
//     console.error('Failed to decode TL from hash:', e);
//     return null;
//   }
//   return null;
// };

const cellKey = (x: number, y: number) => `${x},${y}`;
const isBossCell = (x: number, y: number) =>
  x >= 8 && x <= 10 && y >= 8 && y <= 10;
const TURNS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const CELL_PX = 55;
const DESKTOP_MIN_PX = 1280;
const COL_LABELS = Array.from(
  { length: 19 },
  (_, i) => String.fromCharCode(65 + i) // 65='A'
);

const SLOT_COLORS: Record<string, string> = {
  c1: "#ef4444", // 赤
  c2: "#3b82f6", // 青
  c3: "#10b981", // 緑
  c4: "#f59e0b", // 橙
  c5: "#8b5cf6", // 紫
};
const slotColor = (id: string) => SLOT_COLORS[id] ?? "#6b7280";

// 召喚物の固定色（s1..s10 用）
const SUMMON_COLORS = [
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
const summonColor = (sid: string) => {
  const m = /^s(\d+)$/.exec(sid);
  if (!m) return "#64748b";
  const i = (parseInt(m[1], 10) - 1) % SUMMON_COLORS.length;
  return SUMMON_COLORS[i];
};

const getSummonOption = (name: string): SummonOption | undefined =>
  SUMMON_OPTIONS.find((o) => o.name === name);
const aliasForSummon = (name: string | undefined) =>
  name ? getSummonOption(name)?.alias ?? name : "";

// アクター識別（キャラ or 召喚物）
const isSummonId = (id: string) => id.startsWith("s");

const weaponNamesForType = (ctype?: string) =>
  WEAPON_OPTIONS.filter((w) => !ctype || w.type === ctype).map((w) => w.name);

const getCharOption = (name: string): CharacterOption | undefined =>
  CHARACTER_OPTIONS.find((o) => o.name === name);

// グリッド等で表示する別名は候補リスト由来で固定
const aliasForName = (name: string | undefined): string =>
  name ? getCharOption(name)?.alias ?? name : "";

const uniqueKeyOptionsForName = (name: string): string[] =>
  getCharOption(name)?.uniqueKeyOptions ?? [];

const sanitizeUniqueKeys = (name: string, arr: [string?, string?, string?]) => {
  const allowed = new Set(uniqueKeyOptionsForName(name));
  return arr.map((v) => (v && allowed.has(v) ? v : undefined)) as [
    string?,
    string?,
    string?
  ];
};

const sanitizeCommonKeys = (arr: [string?, string?, string?]) => {
  const allowed = new Set(COMMON_KEY_OPTIONS);
  return arr.map((v) => (v && allowed.has(v) ? v : undefined)) as [
    string?,
    string?,
    string?
  ];
};

// ===============================
// コンポーネント
// ===============================
export default function App() {
  const [activeTurn, setActiveTurn] = useState<number>(0);

  // 並び替え用 Collator
  const collator = useMemo(
    () =>
      new Intl.Collator(["ja", "en"], { numeric: true, sensitivity: "base" }),
    []
  );

  const sortedCharacterOptions = useMemo(() => {
    return [...CHARACTER_OPTIONS].sort((a, b) =>
      collator.compare(a.yomi ?? a.name, b.yomi ?? b.name)
    );
  }, [collator]);

  const sortedWeaponNamesForType = (ctype?: string) => {
    const items = WEAPON_OPTIONS.filter((w) => !ctype || w.type === ctype).map(
      (w) => ({ name: w.name, key: w.yomi ?? w.name })
    );
    items.sort((a, b) => collator.compare(a.key, b.key));
    return items.map((x) => x.name);
  };

  const [tl, setTl] = useState<TimelineV1>(() => {
    const restored = decodeTL(location.hash);
    return restored ?? makeDefaultTL();
  });

  const turn = useMemo(() => {
    return activeTurn === 0
      ? tl.prep
      : tl.turns[(activeTurn - 1) as 0 | 1 | 2 | 3 | 4 | 5 | 6];
  }, [tl, activeTurn]);

  const getActiveTurnRef = (next: TimelineV1): Turn => {
    return activeTurn === 0
      ? next.prep
      : next.turns[(activeTurn - 1) as 0 | 1 | 2 | 3 | 4 | 5 | 6];
  };

  const getTurnByIndex = (next: TimelineV1, idx: number): Turn => {
    return idx === 0
      ? next.prep
      : next.turns[(idx - 1) as 0 | 1 | 2 | 3 | 4 | 5 | 6];
  };

  // ==== TLキャッシュ ====
  type CachedTL = {
    id: string;
    title: string;
    data: TimelineV1;
    savedAt: number;
  };
  const CACHE_KEY = "dlf2_tl_cache_v1";

  const uid = () => Math.random().toString(36).slice(2, 10);

  const renumberSummons = (
    next: TimelineV1,
    currentActiveId: string | null
  ): { next: TimelineV1; newActiveId: string | null } => {
    // 旧→新IDマップを作成（配列順に s1..sN）
    const idMap = new Map<string, string>();
    next.summons.forEach((s, i) => {
      const newId = `s${i + 1}`;
      if (s.id !== newId) idMap.set(s.id, newId);
    });

    // 召喚物配列のIDを更新
    if (idMap.size > 0) {
      next.summons = next.summons.map((s) =>
        idMap.has(s.id) ? { ...s, id: idMap.get(s.id)! } : s
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

      if (next.prep)
        next.prep.placements = replacePlacementKeys(next.prep.placements);

      next.turns.forEach((t) => {
        t.placements = replacePlacementKeys(t.placements);
      });
    }

    const newActiveId =
      currentActiveId && currentActiveId.startsWith("s")
        ? idMap.get(currentActiveId) ?? currentActiveId
        : currentActiveId;

    return { next, newActiveId };
  };

  const loadCache = (): CachedTL[] => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as CachedTL[];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };
  const saveCache = (list: CachedTL[]) => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  };

  const [savedList, setSavedList] = useState<CachedTL[]>(() => loadCache());

  const saveCurrentTL = () => {
    const title = (tl.title ?? "").trim();
    if (!title) {
      alert("タイトルを入力してください。");
      return;
    }
    const item: CachedTL = { id: uid(), title, data: tl, savedAt: Date.now() };
    const next = [item, ...savedList].slice(0, 50);
    setSavedList(next);
    saveCache(next);
    alert("ローカルに保存しました。");
  };

  // 呼び出し
  const loadTL = (id: string) => {
    const item = savedList.find((x) => x.id === id);
    if (!item) return;
    setTl(item.data);
    setActiveTurn(0);
    location.hash = "#" + encodeTL(item.data);
  };

  // 削除
  const deleteTL = (id: string) => {
    const next = savedList.filter((x) => x.id !== id);
    setSavedList(next);
    saveCache(next);
  };

  // ハッシュからの復元（リンクを開いた時や手動書換え時）
  useEffect(() => {
    const onHash = () => {
      const restored = decodeTL(location.hash);
      if (restored) setTl(restored);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    setTl((prev) => {
      const next = structuredClone(prev) as TimelineV1;
      let changed = false;
      next.characters = next.characters.map((c) => {
        const a = sanitizeUniqueKeys(c.name, c.equipment.uniqueKeySet);
        const b = sanitizeCommonKeys(c.equipment.commonKeySet);
        if (a !== c.equipment.uniqueKeySet || b !== c.equipment.commonKeySet) {
          changed = true;
          return {
            ...c,
            equipment: { ...c.equipment, uniqueKeySet: a, commonKeySet: b },
          };
        }
        return c;
      });
      const before = JSON.stringify(next.turns);
      pruneOrphanPlacements(next);
      if (JSON.stringify(next.turns) !== before) changed = true;
      return changed ? next : prev;
    });
  }, []);

  const setCharacterEquip = (id: string, patch: Partial<Equipment>) => {
    setTl((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        c.id === id ? { ...c, equipment: { ...c.equipment, ...patch } } : c
      ),
    }));
  };

  const placeActiveChar = (x: number, y: number) => {
    // ボス領域は配置不可
    if (isBossCell(x, y)) return;
    if (!activeActorId) return;

    setTl((prev) => {
      const next = structuredClone(prev) as TimelineV1;
      const t = getActiveTurnRef(next);

      // すでに他キャラがこのセルにいるか？
      const occupiedByOther = Object.entries(t.placements).some(
        ([cid, pos]) => cid !== activeActorId && pos.x === x && pos.y === y
      );
      if (occupiedByOther) {
        return prev;
      }

      // 自キャラの旧配置は消してから新しい場所に置く（移動）
      Object.keys(t.placements).forEach((cid) => {
        if (cid === activeActorId) delete t.placements[cid];
      });

      t.placements[activeActorId] = { x, y };
      return next;
    });
  };

  const copyTurnFromPrev = () => {
    if (activeTurn === 0) return;
    setTl((prev) => {
      const next = structuredClone(prev) as TimelineV1;
      const from = getTurnByIndex(next, activeTurn === 1 ? 0 : activeTurn - 1); // 1 の「前」は 0（準備）
      const to = getActiveTurnRef(next);
      to.placements = structuredClone(from.placements);
      to.steps = structuredClone(from.steps);
      return next;
    });
  };

  const [activeActorId, setActiveActorId] = useState<string | null>(null);

  // 折りたたみ: 使い方（デフォルト閉）と各キャラカード（デフォルト開）
  const [showUsage, setShowUsage] = useState<boolean>(false);
  const [showRoster, setShowRoster] = useState<boolean>(true);
  const [showGrids, setShowGrids] = useState<boolean>(true);

  const actorIds = useMemo(() => {
    const sums = (tl.summons ?? []).map((s) => s.id);
    return new Set<string>([...tl.characters.map((c) => c.id), ...sums]);
  }, [tl.characters, tl.summons]);

  const occupiedMap = useMemo(() => {
    const m = new Map<string, string[]>();
    Object.entries(turn.placements).forEach(([cid, pos]) => {
      if (!actorIds.has(cid)) return;
      // ボス領域は常に無効（古いURL等で入っていても無視）
      if (isBossCell(pos.x, pos.y)) return;
      const key = cellKey(pos.x, pos.y);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(cid);
    });
    return m;
  }, [actorIds, turn]);

  // 孤児配置掃除（characters/summonsに無いIDを全ターンから削除）
  const pruneOrphanPlacements = (next: TimelineV1) => {
    const actorIds = new Set<string>([
      ...next.characters.map((c) => c.id),
      ...(next.summons ?? []).map((s) => s.id),
    ]);
    const sweep = (t: Turn) => {
      Object.keys(t.placements).forEach((id) => {
        if (!actorIds.has(id)) delete t.placements[id];
      });
    };
    if (next.prep) sweep(next.prep);
    next.turns.forEach(sweep);
  };

  const copyUrl = async () => {
    const url = `${location.origin}${location.pathname}#${encodeTL(tl)}`;
    try {
      await navigator.clipboard.writeText(url);
      alert("共有URLをコピーしました！");
    } catch {
      prompt("コピーに失敗しました。手動でコピーしてください", url);
    }
  };

  // カード背景クリックで選択。ただしフォーム要素上のクリックは無視
  const onCardClick = (e: React.MouseEvent, id: string) => {
    const t = e.target as HTMLElement;
    if (t.closest("input, select, button, textarea, label")) return;
    setActiveActorId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="min-h-screen p-6 bg-[#202124] text-[#e8eaed]">
      <div className="w-full overflow-x-auto">
        <div
          className="max-w-6xl mx-auto space-y-6"
          style={{ minWidth: DESKTOP_MIN_PX }}
        >
          {/* ヘッダ */}
          <header className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-wide">
              ドールズフロントライン2 編成・TL共有ツール（β版）
            </h1>
            <span className="text-xs text-gray-400">v0.0.1</span>
          </header>

          {/* 注意 */}
          <section className="text-sm text-white">
            <ul className="list-disc ml-5 mt-1">
              これはドールズフロントライン2の塵煙前線においてチームへ編成やTLなどを共有する目的で作られたものです
              <br />
              本ツールは日本鯖のチーム「漆黒の宴」が作成、管理しています
            </ul>
          </section>

          {/* 使い方（折りたたみ） */}
          <section className="bg-[#2b2c2f] rounded-xl shadow p-4">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold">使い方</h2>
              <button
                className="ml-auto px-3 py-1 text-sm border rounded hover:bg-[#33353a] border-gray-600"
                onClick={() => setShowUsage((v) => !v)}
              >
                {showUsage ? "閉じる" : "開く"}
              </button>
            </div>

            {showUsage && (
              <div className="mt-3 text-sm text-white space-y-2">
                <p>
                  1. 編成カードのキャラ名をプルダウンから選択
                  <br />
                  2. 武器や固有キーが絞り込まれるので情報を入力していく
                  <br />
                  3. 編成カードの背景を選択
                  <br />
                  4. ターンごとにキャラを配置
                  <br />
                  5. キャラごとの行動順を入力
                  <br />
                </p>
                <p></p>
                <p>
                  <strong>共有方法</strong>
                  <br />
                  1. 画面下部の「保存・共有」でタイトルを入力しURL生成
                  <br />
                  2. 自動的にURLがコピーされるので相手に共有
                </p>
                <p></p>
                <p>
                  <strong>その他</strong>
                  <br />
                  ・キャラの配置が重要でない場合は配置場所を折りたたんで使用してください
                  <br />
                  ・ニキータやアンドリスなどの何かを召喚するキャラの場合は召喚物をご利用ください（最大10個まで配置可）
                  <br />
                  ・共有せずに保存だけ行いたい場合は画面下部で「保存（ブラウザ）」を選択するとキャッシュに保存されます
                  <br />
                  ・URLに編成のハッシュを埋め込ませる関係上URLが長くなります。もし文字数制限で共有できない場合は外部の短縮URLなどをご利用ください
                </p>
              </div>
            )}
          </section>

          {/* 編成 */}
          <section className="bg-[#33353a] border-gray-600 rounded-xl shadow p-4">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-semibold">編成</h2>
              <button
                className="ml-auto px-3 py-1 text-sm border rounded hover:bg-[#33353a] border-gray-600"
                onClick={() => setShowRoster((v) => !v)}
              >
                {showRoster ? "折りたたみ" : "展開"}
              </button>
            </div>

            {showRoster && (
              <div className="grid grid-cols-1 gap-4">
                {tl.characters.map((c) => (
                  <div
                    key={c.id}
                    onClick={(e) => onCardClick(e, c.id)}
                    className={`rounded-xl p-4 border select-none cursor-pointer transition
                    ${activeActorId === c.id ? "ring-2 ring-blue-500" : ""}`}
                    style={{
                      background:
                        activeActorId === c.id
                          ? slotColor(c.id) + "88"
                          : slotColor(c.id) + "66",
                    }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      {/* キャラ名（固定リスト） */}
                      <label className="flex items-center gap-2">
                        <span className="w-16 text-white text-sm">
                          キャラ名
                        </span>
                        <select
                          value={c.name ?? ""}
                          onChange={(e) => {
                            const selected = e.target.value;
                            const opt = getCharOption(selected);
                            const allowed = sortedWeaponNamesForType(c.ctype);
                            const currentWeapon = c.equipment.weapon ?? "";
                            const weapon = allowed.includes(currentWeapon)
                              ? currentWeapon
                              : allowed[0] ?? "";
                            setTl((prev) => ({
                              ...prev,
                              characters: prev.characters.map((cc) =>
                                cc.id === c.id
                                  ? {
                                      ...cc,
                                      name: selected,
                                      alias: aliasForName(selected),
                                      ctype: opt?.type,
                                      equipment: {
                                        ...cc.equipment,
                                        weapon,
                                        uniqueKeySet: sanitizeUniqueKeys(
                                          selected,
                                          cc.equipment.uniqueKeySet
                                        ),
                                        commonKeySet: sanitizeCommonKeys(
                                          cc.equipment.commonKeySet
                                        ),
                                      },
                                    }
                                  : cc
                              ),
                            }));
                          }}
                          className="min-w-[12rem] px-2 py-1 border rounded bg-white text-gray-900 border-gray-300"
                        >
                          <option value="" disabled>
                            選択
                          </option>
                          {sortedCharacterOptions.map((o) => (
                            <option key={o.name} value={o.name}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {/* 表示名（グリッド用：固定） */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-16 text-white text-sm">表示名</span>
                      <div className="px-2 py-1 border rounded bg-white border-gray-300 text-sm min-w-[12rem]">
                        {c.name ? (
                          <span className="text-gray-900">
                            {aliasForName(c.name)}
                          </span>
                        ) : (
                          <span className="text-gray-400">未選択</span>
                        )}
                      </div>
                    </div>

                    {/* 装備（武器：固定リスト） */}
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      <label className="flex items-center gap-2">
                        <span className="w-16 text-white">凸</span>
                        <input
                          type="number"
                          min={0}
                          max={6}
                          value={c.equipment.limitBreak}
                          onChange={(e) =>
                            setCharacterEquip(c.id, {
                              limitBreak: +e.target.value,
                            })
                          }
                          className="w-24 px-2 py-1 border rounded bg-white text-gray-900 border-gray-300"
                        />
                      </label>

                      <label className="flex items-center gap-2">
                        <span className="w-16 text-white">武器</span>
                        <div className="min-w-[12rem]">
                          <div className="text-xs text-white/80 mb-1 leading-none h-4">
                            {/* c.ctype が無い場合は「タイプ:」だけ表示 */}
                            タイプ{c.ctype ? `: ${c.ctype}` : ":"}
                          </div>
                          {(() => {
                            const hasChar = !!c.name;
                            const allowed = hasChar
                              ? weaponNamesForType(c.ctype)
                              : [];
                            const value =
                              hasChar &&
                              allowed.includes(c.equipment.weapon ?? "")
                                ? c.equipment.weapon ?? ""
                                : "";
                            return (
                              <select
                                value={value}
                                onChange={(e) =>
                                  setCharacterEquip(c.id, {
                                    weapon: e.target.value,
                                  })
                                }
                                disabled={!hasChar}
                                className={`min-w-[12rem] px-2 py-1 border rounded bg-white border-gray-300 ${
                                  hasChar ? "text-gray-900" : "text-gray-400"
                                }`}
                              >
                                <option value="">
                                  {hasChar ? "選択" : "（キャラ未選択）"}
                                </option>
                                {hasChar &&
                                  allowed.map((w) => (
                                    <option key={w} value={w}>
                                      {w}
                                    </option>
                                  ))}
                              </select>
                            );
                          })()}
                        </div>
                      </label>

                      <div className="sm:col-span-2 grid gap-2">
                        <div>
                          <span className="text-white mr-2">固有キー</span>
                          <div className="grid grid-cols-3 gap-2 mt-1">
                            {([0, 1, 2] as const).map((i) => {
                              const hasChar = !!c.name;
                              const options = hasChar
                                ? uniqueKeyOptionsForName(c.name)
                                : [];
                              const value = c.equipment.uniqueKeySet[i] ?? "";
                              const onChange = (
                                e: React.ChangeEvent<HTMLSelectElement>
                              ) => {
                                const v = e.target.value || undefined;
                                const arr = [...c.equipment.uniqueKeySet] as [
                                  string?,
                                  string?,
                                  string?
                                ];
                                arr[i] = v;
                                setCharacterEquip(c.id, {
                                  uniqueKeySet: sanitizeUniqueKeys(c.name, arr),
                                });
                              };
                              return (
                                <select
                                  key={i}
                                  value={
                                    hasChar && options.includes(value)
                                      ? (value as string)
                                      : ""
                                  }
                                  onChange={onChange}
                                  disabled={!hasChar}
                                  className={`min-w-[12rem] px-2 py-1 border rounded bg-white border-gray-300 ${
                                    hasChar ? "text-gray-900" : "text-gray-400"
                                  }`}
                                >
                                  <option value="">
                                    {hasChar ? "選択" : "（キャラ未選択）"}
                                  </option>
                                  {hasChar &&
                                    options.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                </select>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <span className="text-white mr-2">共通キー</span>
                          <div className="grid grid-cols-3 gap-2 mt-1">
                            {([0, 1, 2] as const).map((i) => {
                              const hasChar = !!c.name;
                              const options = hasChar ? COMMON_KEY_OPTIONS : [];
                              const value = c.equipment.commonKeySet[i] ?? "";
                              const onChange = (
                                e: React.ChangeEvent<HTMLSelectElement>
                              ) => {
                                const v = e.target.value || undefined;
                                const arr = [...c.equipment.commonKeySet] as [
                                  string?,
                                  string?,
                                  string?
                                ];
                                arr[i] = v;
                                setCharacterEquip(c.id, {
                                  commonKeySet: sanitizeCommonKeys(arr),
                                });
                              };
                              return (
                                <select
                                  key={i}
                                  value={
                                    hasChar && options.includes(value)
                                      ? (value as string)
                                      : ""
                                  }
                                  onChange={onChange}
                                  disabled={!hasChar}
                                  className={`min-w-[12rem] px-2 py-1 border rounded bg-white border-gray-300 ${
                                    hasChar ? "text-gray-900" : "text-gray-400"
                                  }`}
                                >
                                  <option value="">
                                    {hasChar ? "選択" : "（キャラ未選択）"}
                                  </option>
                                  {hasChar &&
                                    options.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                </select>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 召喚物（最大10） */}
          <section className="bg-[#33353a] border-gray-600 rounded-xl shadow p-4">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-semibold">召喚物</h2>
              <button
                onClick={() =>
                  setTl((prev) => {
                    if (prev.summons.length >= 10) {
                      alert("召喚物は最大10個までです");
                      return prev;
                    }
                    const next = structuredClone(prev) as TimelineV1;
                    const id = `s${next.summons.length + 1}`;
                    // デフォはリストの先頭
                    const def = SUMMON_OPTIONS[0]?.name ?? "召喚物";
                    next.summons.push({
                      id,
                      name: def,
                      alias: aliasForSummon(def),
                    });
                    const r = renumberSummons(
                      next,
                      /* 現在の選択ID */ activeActorId ?? null
                    );
                    if (r.newActiveId !== (activeActorId ?? null))
                      setActiveActorId(r.newActiveId ?? "c1");
                    return r.next;
                  })
                }
                className="ml-auto px-3 py-1 text-sm border rounded bg-white text-gray-900 border-gray-300 hover:bg-gray-100"
              >
                召喚物を追加
              </button>
            </div>

            {tl.summons.length === 0 ? (
              <div className="text-sm text-gray-400">（まだありません）</div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {tl.summons.map((s) => (
                  <div
                    key={s.id}
                    onClick={(e) => {
                      const t = e.target as HTMLElement;
                      if (t.closest("input, select, button, textarea, label"))
                        return;
                      setActiveActorId(s.id);
                    }}
                    className={`rounded-xl p-3 border select-none cursor-pointer transition
                    ${activeActorId === s.id ? "ring-2 ring-blue-500" : ""}`}
                    style={{
                      background:
                        activeActorId === s.id
                          ? summonColor(s.id) + "66"
                          : summonColor(s.id) + "44",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded bg-white/80 text-gray-900">
                        {s.id.toUpperCase()}
                      </span>

                      <label className="flex items-center gap-2">
                        <span className="w-16 text-white text-sm">名前</span>
                        <select
                          value={s.name}
                          onChange={(e) =>
                            setTl((prev) => {
                              const next = structuredClone(prev) as TimelineV1;
                              const value = e.target.value;
                              next.summons = next.summons.map((x) =>
                                x.id === s.id
                                  ? {
                                      ...x,
                                      name: value,
                                      alias: aliasForSummon(value),
                                    }
                                  : x
                              );
                              return next;
                            })
                          }
                          className="min-w-[12rem] px-2 py-1 border rounded bg-white text-gray-900 border-gray-300"
                        >
                          {SUMMON_OPTIONS.map((o) => (
                            <option key={o.name} value={o.name}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex items-center gap-2">
                        <span className="w-16 text-white text-sm">表示名</span>
                        <div className="px-2 py-1 border rounded bg-white text-gray-900 border-gray-300 text-sm min-w-[12rem]">
                          {aliasForSummon(s.name)}
                        </div>
                      </label>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTl((prev) => {
                            const next = structuredClone(prev) as TimelineV1;
                            // ★ 全ターン（prep含む）から当該IDの配置を削除
                            if (next.prep) {
                              Object.keys(next.prep.placements).forEach((k) => {
                                if (k === s.id) delete next.prep.placements[k];
                              });
                            }
                            // この召喚物の配置も全ターンから除去
                            next.turns.forEach((t) => {
                              Object.keys(t.placements).forEach((k) => {
                                if (k === s.id) delete t.placements[k];
                              });
                            });

                            // 召喚物リストから除外
                            next.summons = (next.summons ?? []).filter(
                              (x) => x.id !== s.id
                            );
                            pruneOrphanPlacements(next);

                            // 採番し直し & 選択IDの追随
                            const r = renumberSummons(
                              next,
                              activeActorId ?? null
                            );
                            if (r.newActiveId !== (activeActorId ?? null)) {
                              setActiveActorId(r.newActiveId ?? "c1");
                            }
                            return r.next;
                            return next;
                          });
                        }}
                        className="ml-auto px-2 py-1 text-red-600 hover:underline"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 盤面エディタ */}
          <section className="bg-[#33353a] border-gray-600 rounded-xl shadow p-4">
            <div className="flex items-center justify-between border-b border-gray-700 -mx-4 px-4 pb-2 mb-3">
              {/* タブ群（見出し左側） */}
              <div
                role="tablist"
                aria-label="ターン"
                className="flex gap-1 overflow-x-auto"
              >
                {TURNS.map((i) => {
                  const selected = activeTurn === i;
                  const label = i === 0 ? "準備" : `ターン${i}`;
                  return (
                    <button
                      key={i}
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActiveTurn(i)}
                      className={`px-4 py-2 rounded-t-md border-b-2 whitespace-nowrap
                      ${
                        selected
                          ? "border-blue-500 text-white font-semibold"
                          : "border-transparent text-gray-300 hover:text-white hover:border-gray-500"
                      }`}
                      title={`${label}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {/* 右側：前ターンからコピー */}
              <button
                onClick={copyTurnFromPrev}
                className="px-3 py-2 rounded border bg-white text-gray-900 border-gray-300 hover:bg-gray-100"
                title="一つ前のターンの配置と行動をコピー"
              >
                前ターンからコピー
              </button>
              <button
                className="ml-auto px-3 py-1 text-sm border rounded hover:bg-[#33353a] border-gray-600"
                onClick={() => setShowGrids((v) => !v)}
              >
                {showGrids ? "折りたたみ" : "展開"}
              </button>
            </div>

            {showGrids && (
              <div className="inline-block">
                <table className="border-collapse table-fixed">
                  <thead>
                    <tr>
                      {/* 左上の空き角（サイズはセルと同じ） */}
                      <th
                        className="border border-gray-700"
                        style={{ width: CELL_PX, height: CELL_PX }}
                      />
                      {/* 横ヘッダ：a..s */}
                      {COL_LABELS.map((label) => (
                        <th
                          key={label}
                          className="border border-gray-700 text-xs font-medium text-gray-300 text-center"
                          style={{ width: CELL_PX, height: CELL_PX }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {Array.from({ length: 19 }, (_, ry) => (
                      <tr key={ry}>
                        {/* 縦ヘッダ：1..19 */}
                        <th
                          className="border border-gray-700 text-xs font-medium text-gray-300 text-center"
                          style={{ width: CELL_PX, height: CELL_PX }}
                        >
                          {ry + 1}
                        </th>

                        {/* セル本体（従来の19個） */}
                        {Array.from({ length: 19 }, (_, cx) => {
                          const key = cellKey(cx, ry);
                          const cids = occupiedMap.get(key) ?? [];
                          const bg =
                            cids.length === 1
                              ? isSummonId(cids[0])
                                ? summonColor(cids[0]) + "88"
                                : slotColor(cids[0]) + "88"
                              : cids.length > 1
                              ? "#9ca3af"
                              : "#f3f4f6";

                          return (
                            <td
                              key={cx}
                              onClick={() => {
                                if (isBossCell(cx, ry)) return;

                                if (
                                  cids.length === 1 &&
                                  cids[0] !== activeActorId
                                ) {
                                  setActiveActorId(cids[0]);
                                  return;
                                }

                                if (!activeActorId && cids.length >= 1) {
                                  setActiveActorId(cids[0]);
                                  return;
                                }

                                if (activeActorId) placeActiveChar(cx, ry);
                              }}
                              className={`align-top ${
                                isBossCell(cx, ry)
                                  ? "cursor-not-allowed"
                                  : "cursor-pointer"
                              } rounded-none p-0 border border-gray-700 text-[14px] leading-tight select-none`}
                              style={{
                                width: CELL_PX,
                                height: CELL_PX,
                                background: isBossCell(cx, ry) ? "#d1d5db" : bg,
                              }}
                              role="button"
                              title={
                                isBossCell(cx, ry)
                                  ? "ボス領域（配置不可）"
                                  : activeActorId
                                  ? "クリックで配置"
                                  : cids[0]
                                  ? isSummonId(cids[0])
                                    ? `クリックで ${aliasForSummon(
                                        tl.summons?.find(
                                          (s) => (s.id as string) === cids[0]
                                        )?.name
                                      )} を選択`
                                    : `クリックで ${aliasForName(
                                        tl.characters?.find(
                                          (s) => (s.id as string) === cids[0]
                                        )?.name
                                      )} を選択`
                                  : "クリックで選択"
                              }
                            >
                              {/* 中央表示＆折返し（長い別名対策） */}
                              <div className="w-full h-full flex items-center justify-center px-1">
                                {cids.map((cid) => {
                                  const isSummon = isSummonId
                                    ? isSummonId(cid)
                                    : cid.startsWith("s");
                                  if (isSummon) {
                                    const s = tl.summons?.find(
                                      (ss) => ss.id === cid
                                    );
                                    if (!s) return null; // ← 孤児は描かない
                                    return (
                                      <div
                                        key={cid}
                                        className="text-center break-all leading-tight"
                                      >
                                        {aliasForSummon(s.name)}
                                      </div>
                                    );
                                  } else {
                                    const ch = tl.characters.find(
                                      (c) => c.id === cid
                                    );
                                    if (!ch) return null; // ← 念のため
                                    return (
                                      <div
                                        key={cid}
                                        className="text-center break-all leading-tight"
                                      >
                                        {aliasForName(ch.name)}
                                      </div>
                                    );
                                  }
                                })}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 行動順エディタ */}
          <section className="bg-[#33353a] border-gray-600 rounded-xl shadow p-4">
            <h2 className="font-semibold mb-3">
              行動順（{activeTurn === 0 ? "準備" : `Turn ${activeTurn}`}）
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white">
                  <th className="w-16">順</th>
                  <th className="w-40">キャラ</th>
                  <th className="w-48">スキル</th>
                  <th>備考</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }, (_, i) => i + 1).map((ord) => {
                  const idx = turn.steps.findIndex((s) => s.order === ord);
                  const step = idx >= 0 ? turn.steps[idx] : null;
                  const setStep = (patch: Partial<Step>) =>
                    setTl((prev) => {
                      const next = structuredClone(prev) as TimelineV1;
                      const t = getActiveTurnRef(next);
                      const j = t.steps.findIndex((s) => s.order === ord);
                      if (j >= 0) t.steps[j] = { ...t.steps[j], ...patch };
                      else
                        t.steps.push({
                          order: ord,
                          actorId: tl.characters[0]?.id ?? "c1",
                          skill: "",
                          note: "",
                          ...patch,
                        } as Step);
                      t.steps.sort((a, b) => a.order - b.order);
                      return next;
                    });
                  const remove = () =>
                    setTl((prev) => {
                      const next = structuredClone(prev) as TimelineV1;
                      const t = getActiveTurnRef(next);
                      t.steps = t.steps.filter((s) => s.order !== ord);
                      return next;
                    });
                  return (
                    <tr key={ord} className="border-t">
                      <td className="py-2 pr-2">{ord}</td>
                      <td className="pr-2">
                        <select
                          value={step?.actorId ?? ""}
                          onChange={(e) => setStep({ actorId: e.target.value })}
                          className="w-full px-2 py-1 border rounded bg-white text-gray-900 border-gray-300"
                        >
                          <option value="" disabled>
                            選択
                          </option>
                          {tl.characters.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="pr-2">
                        <input
                          value={step?.skill ?? ""}
                          onChange={(e) => setStep({ skill: e.target.value })}
                          placeholder="S4 / S4>S2 など"
                          className="w-full px-2 py-1 border rounded bg-white text-gray-900 border-gray-300"
                        />
                      </td>
                      <td className="pr-2">
                        <input
                          value={step?.note ?? ""}
                          onChange={(e) => setStep({ note: e.target.value })}
                          placeholder="補足（例: 左箱回収→戻る）"
                          className="w-full px-2 py-1 border rounded bg-white text-gray-900 border-gray-300"
                        />
                      </td>
                      <td>
                        <button
                          onClick={remove}
                          className="px-2 py-1 text-red-600 hover:underline"
                        >
                          クリア
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-2 text-xs text-white">
              ※空行は保存されません（未入力はURL縮小のため省略）。
            </div>
          </section>

          {/* 保存・共有（画面下部） */}
          <section className="bg-[#33353a] border-gray-600 rounded-xl shadow p-4">
            <h2 className="font-semibold mb-3">保存・共有</h2>

            {/* タイトル＆操作 */}
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <label className="flex items-center gap-2">
                <span className="text-white text-sm">タイトル</span>
                <input
                  className="px-2 py-1 border rounded bg-white text-gray-900 border-gray-300 min-w-[16rem]"
                  value={tl.title ?? ""}
                  onChange={(e) => setTl({ ...tl, title: e.target.value })}
                  placeholder="TLタイトル"
                />
              </label>

              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={saveCurrentTL}
                  className="px-3 py-2 rounded border bg-white text-gray-900 border-gray-300 hover:bg-gray-100"
                >
                  保存（ブラウザ）
                </button>
                <button
                  onClick={copyUrl}
                  className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                >
                  URL生成
                </button>
              </div>
            </div>

            {/* 一覧 */}
            <div className="border-t border-gray-700 pt-3">
              <h3 className="font-semibold mb-2">保存済みTL</h3>
              {savedList.length === 0 ? (
                <div className="text-sm text-gray-400">
                  まだ保存はありません。
                </div>
              ) : (
                <ul className="space-y-2">
                  {savedList.map((item) => (
                    <li key={item.id} className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="font-medium">{item.title}</div>
                        <div className="text-xs text-gray-400">
                          {new Date(item.savedAt).toLocaleString()}
                        </div>
                      </div>
                      <button
                        onClick={() => loadTL(item.id)}
                        className="px-2 py-1 rounded border bg-white text-gray-900 border-gray-300 hover:bg-gray-100"
                      >
                        呼び出し
                      </button>
                      <button
                        onClick={() => deleteTL(item.id)}
                        className="px-2 py-1 rounded border border-red-400 text-red-400 hover:bg-red-50/10"
                      >
                        削除
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

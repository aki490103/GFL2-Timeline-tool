import React, { useEffect, useMemo, useState } from "react";
import { CHARACTER_OPTIONS } from "./data/characters";
import { COMMON_KEY_OPTIONS } from "./data/common_keys";
import { WEAPON_OPTIONS } from "./data/weapons";
import { SUMMON_OPTIONS } from "./data/summons";
import {
  addSummon,
  aliasForName,
  aliasForSummon,
  getCharOption,
  countInvalidPlacements,
  isSummonId,
  pruneInvalidPlacements,
  removeSummon,
  sanitizeCommonKeys,
  sanitizeUniqueKeys,
  uniqueKeyOptionsForName,
} from "./lib/actors";
import { encodeTL, decodeTL } from "./lib/codec";
import {
  LIMIT_BREAK_MAX,
  MAX_SUMMONS,
  makeDefaultTL,
  slotColor,
  summonColor,
} from "./lib/defaults";
import {
  CELL_PX,
  DESKTOP_MIN_PX,
  GRID_MAX,
  GRID_MIN,
  TURNS,
  alphaLabel,
  buildOccupiedMap,
  cellKey,
  defaultBoss,
  isBossCell,
} from "./lib/grid";
import { NumberField } from "./components/NumberField";
import { normalizeTimeline } from "./lib/normalize";
import {
  CACHE_KEY,
  MAX_CACHED,
  parseCache,
  upsertCache,
  type CachedTL,
} from "./lib/storage";
import type {
  BossArea,
  Equipment,
  Position,
  Step,
  TimelineV1,
  Turn,
} from "./lib/types";

const TURN_PANEL_ID = "turn-panel";
const turnTabId = (i: number) => `turn-tab-${i}`;

type Toast = { text: string; kind: "info" | "error"; at: number };
const TOAST_DURATION_MS = 4000;

// URL 同期の待ち時間（ms）。Safari の replaceState 制限
// （30秒に100回）に対して十分な余裕を取る。
const HASH_SYNC_DEBOUNCE_MS = 500;

// ===============================
// コンポーネント
// ===============================
export default function App() {
  const [activeTurn, setActiveTurn] = useState<number>(0);

  // alert / prompt はモーダルで操作を止めてしまうため、
  // 画面隅の非ブロッキングな通知に置き換える
  const [toast, setToast] = useState<Toast | null>(null);
  const showToast = (text: string, kind: Toast["kind"] = "info") =>
    setToast({ text, kind, at: Date.now() });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // 並び替え用 Collator
  const collator = useMemo(
    () =>
      new Intl.Collator(["ja", "en"], { numeric: true, sensitivity: "base" }),
    [],
  );

  const sortedCharacterOptions = useMemo(() => {
    return [...CHARACTER_OPTIONS].sort((a, b) =>
      collator.compare(a.yomi ?? a.name, b.yomi ?? b.name),
    );
  }, [collator]);

  const sortedWeaponNamesForType = (ctype?: string) => {
    const items = WEAPON_OPTIONS.filter((w) => !ctype || w.type === ctype).map(
      (w) => ({ name: w.name, key: w.yomi ?? w.name }),
    );
    items.sort((a, b) => collator.compare(a.key, b.key));
    return items.map((x) => x.name);
  };

  const [tl, setTl] = useState<TimelineV1>(
    () => decodeTL(location.hash) ?? makeDefaultTL(),
  );

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

  const isBossCellAt = (x: number, y: number) =>
    isBossCell(tl.boss, tl.grid, x, y);

  // タブは左右キーで移動できるのが WAI-ARIA の tabs パターン
  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const delta =
      e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowLeft"
          ? -1
          : e.key === "Home"
            ? -TURNS.length
            : e.key === "End"
              ? TURNS.length
              : 0;
    if (!delta) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(TURNS.length - 1, activeTurn + delta));
    setActiveTurn(next);
    document.getElementById(turnTabId(next))?.focus();
  };

  /** 盤面のうちタブ順に入れる1マス（roving tabindex）。361マスを全てタブ対象にしない */
  const [focusedCell, setFocusedCell] = useState<Position>({ x: 0, y: 0 });
  const focusX = Math.min(focusedCell.x, tl.grid.cols - 1);
  const focusY = Math.min(focusedCell.y, tl.grid.rows - 1);

  const moveFocus = (x: number, y: number) => {
    const nx = Math.max(0, Math.min(tl.grid.cols - 1, x));
    const ny = Math.max(0, Math.min(tl.grid.rows - 1, y));
    setFocusedCell({ x: nx, y: ny });
    // 再レンダー前でも tabIndex=-1 の要素にはフォーカスできる
    document.querySelector<HTMLElement>(`[data-cell="${nx},${ny}"]`)?.focus();
  };

  const onCellKeyDown = (e: React.KeyboardEvent, x: number, y: number) => {
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        return moveFocus(x - 1, y);
      case "ArrowRight":
        e.preventDefault();
        return moveFocus(x + 1, y);
      case "ArrowUp":
        e.preventDefault();
        return moveFocus(x, y - 1);
      case "ArrowDown":
        e.preventDefault();
        return moveFocus(x, y + 1);
      case "Home":
        e.preventDefault();
        return moveFocus(0, y);
      case "End":
        e.preventDefault();
        return moveFocus(tl.grid.cols - 1, y);
      case "Enter":
      case " ":
        e.preventDefault();
        return activateCell(x, y);
    }
  };

  // ==== TLキャッシュ（ブラウザ保存） ====
  const uid = () => Math.random().toString(36).slice(2, 10);

  const [savedList, setSavedList] = useState<CachedTL[]>(() => {
    try {
      return parseCache(localStorage.getItem(CACHE_KEY));
    } catch {
      // プライベートモード等で localStorage 自体が触れないことがある
      return [];
    }
  });

  /** 保存に成功したら true。失敗時はトーストで知らせる */
  const persistCache = (list: CachedTL[]): boolean => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.error("Failed to persist TL cache:", e);
      showToast(
        "ブラウザに保存できませんでした。保存領域がいっぱいか、プライベートモードの可能性があります。",
        "error",
      );
      return false;
    }
  };

  const saveCurrentTL = () => {
    const title = (tl.title ?? "").trim();
    if (!title) {
      showToast("タイトルを入力してください。", "error");
      return;
    }
    const { list, overwrote, dropped } = upsertCache(savedList, {
      id: uid(),
      title,
      data: tl,
      savedAt: Date.now(),
    });
    if (!persistCache(list)) return;
    setSavedList(list);
    showToast(
      overwrote
        ? `「${title}」を上書き保存しました。`
        : dropped > 0
          ? `保存しました。上限${MAX_CACHED}件を超えたため古い${dropped}件を削除しました。`
          : "ブラウザに保存しました。",
    );
  };

  // 呼び出し
  const loadTL = (id: string) => {
    const item = savedList.find((x) => x.id === id);
    if (!item) return;
    // localStorage の中身も古い形式でありうるので正規化して読み込む。
    // ハッシュへの反映は上の同期 effect が行う。
    setTl(normalizeTimeline(item.data));
    setActiveTurn(0);
    setActiveActorId(null);
  };

  // 削除
  const deleteTL = (id: string) => {
    const next = savedList.filter((x) => x.id !== id);
    if (!persistCache(next)) return;
    setSavedList(next);
  };

  // ハッシュからの復元（リンクを開いた時や手動書換え時）。
  // 欠損の補完・不正値の除去は decodeTL 内の normalizeTimeline が担う。
  useEffect(() => {
    const onHash = () => {
      const restored = decodeTL(location.hash);
      if (restored) setTl(restored);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // 編集内容を常にアドレスバーへ反映する。
  // これが無いとリロードやタブ復元で作業内容が消える。
  // replaceState なので履歴は汚さず、hashchange も発火しない。
  //
  // デバウンスを短くしすぎないこと: Safari は replaceState を
  // 「30秒に100回」で打ち切るため、連続入力でも上限に触れない間隔にする。
  useEffect(() => {
    const timer = setTimeout(() => {
      const hash = "#" + encodeTL(tl);
      if (location.hash === hash) return;
      try {
        history.replaceState(
          null,
          "",
          location.pathname + location.search + hash,
        );
      } catch (e) {
        // URL 同期に失敗しても編集は続行できるべきなので握りつぶす
        console.warn("Failed to sync TL to URL:", e);
      }
    }, HASH_SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [tl]);

  const setCharacterEquip = (id: string, patch: Partial<Equipment>) => {
    setTl((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        c.id === id ? { ...c, equipment: { ...c.equipment, ...patch } } : c,
      ),
    }));
  };

  const placeActiveChar = (x: number, y: number) => {
    // ボス領域は配置不可
    if (isBossCellAt(x, y)) return;
    if (!activeActorId) return;

    setTl((prev) => {
      const next = structuredClone(prev) as TimelineV1;
      const t = getActiveTurnRef(next);

      // すでに他キャラがこのセルにいるか？
      const occupiedByOther = Object.entries(t.placements).some(
        ([cid, pos]) => cid !== activeActorId && pos.x === x && pos.y === y,
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

  // 召喚物の追加・削除は「新しい TL と新しい選択ID」を同時に決める必要がある。
  // setTl の updater 内で setActiveActorId を呼ぶと updater が純粋でなくなるため、
  // 純粋関数で結果を求めてから両方の state を更新する。
  const addSummonHandler = () => {
    if ((tl.summons ?? []).length >= MAX_SUMMONS) {
      showToast(`召喚物は最大${MAX_SUMMONS}個までです。`, "error");
      return;
    }
    const { next, newActiveId } = addSummon(tl, activeActorId);
    setTl(next);
    setActiveActorId(newActiveId);
  };

  const removeSummonHandler = (summonId: string) => {
    const { next, newActiveId } = removeSummon(tl, summonId, activeActorId);
    setTl(next);
    setActiveActorId(newActiveId);
  };

  /** 盤面のマスを操作したときの挙動（クリックとキーボードで共通） */
  const activateCell = (x: number, y: number) => {
    if (isBossCellAt(x, y)) return;
    const cids = occupiedMap.get(cellKey(x, y)) ?? [];
    // 他のアクターが居るマスは「選択の切り替え」、それ以外は「配置」
    if (cids.length === 1 && cids[0] !== activeActorId) {
      setActiveActorId(cids[0]);
      return;
    }
    if (!activeActorId && cids.length >= 1) {
      setActiveActorId(cids[0]);
      return;
    }
    if (activeActorId) placeActiveChar(x, y);
  };

  /** 盤面やツールチップに出す表示名 */
  const actorLabel = (cid: string): string =>
    isSummonId(cid)
      ? aliasForSummon(tl.summons?.find((s) => s.id === cid)?.name)
      : aliasForName(tl.characters.find((c) => c.id === cid)?.name);

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

  // tl.boss / tl.grid を依存に含めないと、ボス領域を動かしても
  // そこに重なったアクターが盤面に残り続ける
  const invalidPlacementCount = useMemo(() => countInvalidPlacements(tl), [tl]);

  const occupiedMap = useMemo(
    () => buildOccupiedMap(turn.placements, actorIds, tl.boss, tl.grid),
    [turn, actorIds, tl.boss, tl.grid],
  );

  const copyUrl = async () => {
    const url = `${location.origin}${location.pathname}#${encodeTL(tl)}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("共有URLをコピーしました。");
    } catch {
      // 編集内容は常にアドレスバーへ同期しているので、そこからコピーできる
      showToast(
        "コピーできませんでした。アドレスバーのURLをそのまま共有してください。",
        "error",
      );
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
      {/* 通知（alert の置き換え）。操作を止めない */}
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 pointer-events-none"
      >
        {toast && (
          <div
            className={`max-w-sm rounded-lg px-4 py-3 text-sm shadow-lg border ${
              toast.kind === "error"
                ? "bg-red-950 border-red-700 text-red-100"
                : "bg-[#2b2c2f] border-gray-600 text-[#e8eaed]"
            }`}
          >
            {toast.text}
          </div>
        )}
      </div>
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
            <span className="text-xs text-gray-400">v{__APP_VERSION__}</span>
          </header>

          {/* 注意 */}
          <section className="text-sm text-white">
            <ul className="list-disc ml-5 mt-1 space-y-1">
              <li>
                これはドールズフロントライン2の塵煙前線においてチームへ編成やTLなどを共有する目的で作られたものです
              </li>
              <li>
                本ツールは日本鯖のチーム「漆黒の宴」が作成、管理しています
              </li>
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
                  3. 編成カードの背景、もしくは「キャラ配置」ボタンをクリック
                  <br />
                  4. マス目にキャラを配置
                  <br />
                  5. キャラごとの行動順を入力
                  <br />
                </p>
                <p></p>
                <p>
                  <strong>キャラの配置について</strong>
                  <br />
                  一度キャラを配置した後はキャラのマスをクリックすることでそのキャラを選択し移動することができます
                  <br />
                  次のターンにキャラを配置したい場合は「前ターンからコピー」ボタンをクリックした後、次のターンでキャラを移動することで素早く配置することが可能です
                  <br />
                  盤面は矢印キーでも移動でき、Enter または Space
                  で配置・選択ができます
                </p>
                <p></p>
                <p>
                  <strong>共有方法</strong>
                  <br />
                  編集内容は自動的にアドレスバーのURLへ反映されます。そのままコピーして共有できます
                  <br />
                  画面下部の「URL生成」を押すと、共有用URLをクリップボードにコピーします
                </p>
                <p></p>
                <p>
                  <strong>その他</strong>
                  <br />
                  ・キャラの配置が重要でない場合は配置場所を折りたたんで使用してください
                  <br />
                  ・ニキータやアンドリスなどの何かを召喚するキャラの場合は召喚物をご利用ください（最大10個まで配置可）
                  <br />
                  ・共有せずに保存だけ行いたい場合は画面下部で「保存（ブラウザ）」を選択するとブラウザのキャッシュに保存されます（cookieのクリアなどに注意）。同じタイトルで保存し直すと上書きされます
                  <br />
                  ・URLに編成のハッシュを埋め込ませる関係上URLが長くなります。もし文字数制限で共有できない場合は外部の短縮URLなどをご利用ください
                  <br />※
                  Xなど文字数制限があるものを除き、文字に対するリンク埋め込み機能でも共有可能です（discordでは「[埋め込みたい文字](URL)」
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
                              : "";
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
                                          cc.equipment.uniqueKeySet,
                                        ),
                                        commonKeySet: sanitizeCommonKeys(
                                          cc.equipment.commonKeySet,
                                        ),
                                      },
                                    }
                                  : cc,
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
                      {/* 配置ボタン */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveActorId(c.id);
                        }}
                        aria-pressed={activeActorId === c.id}
                        className="ml-auto px-2 py-1 text-xs rounded border bg-white text-gray-900 border-gray-300 hover:bg-gray-100"
                        title="このキャラを配置"
                      >
                        キャラ配置
                      </button>
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
                      <NumberField
                        label="凸"
                        value={c.equipment.limitBreak}
                        min={0}
                        max={LIMIT_BREAK_MAX}
                        className="w-24 px-2 py-1 border rounded bg-white text-gray-900 border-gray-300"
                        onCommit={(limitBreak) =>
                          setCharacterEquip(c.id, { limitBreak })
                        }
                      />

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
                              ? sortedWeaponNamesForType(c.ctype)
                              : [];
                            const value =
                              hasChar &&
                              allowed.includes(c.equipment.weapon ?? "")
                                ? (c.equipment.weapon ?? "")
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
                                e: React.ChangeEvent<HTMLSelectElement>,
                              ) => {
                                const v = e.target.value || undefined;
                                const arr = [...c.equipment.uniqueKeySet] as [
                                  string?,
                                  string?,
                                  string?,
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
                                e: React.ChangeEvent<HTMLSelectElement>,
                              ) => {
                                const v = e.target.value || undefined;
                                const arr = [...c.equipment.commonKeySet] as [
                                  string?,
                                  string?,
                                  string?,
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
                onClick={addSummonHandler}
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
                                  : x,
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
                          removeSummonHandler(s.id);
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
                      id={turnTabId(i)}
                      aria-selected={selected}
                      aria-controls={TURN_PANEL_ID}
                      // 選択中のタブだけをタブ順に入れる（WAI-ARIA の tabs パターン）
                      tabIndex={selected ? 0 : -1}
                      onKeyDown={onTabKeyDown}
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
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <NumberField
                label="縦"
                value={tl.grid.rows}
                min={GRID_MIN}
                max={GRID_MAX}
                className="w-20 px-2 py-1 border rounded bg-white text-gray-900 border-gray-300"
                onCommit={(rows) =>
                  setTl((prev) => ({ ...prev, grid: { ...prev.grid, rows } }))
                }
              />
              <span aria-hidden="true">×</span>
              <NumberField
                label="横"
                value={tl.grid.cols}
                min={GRID_MIN}
                max={GRID_MAX}
                className="w-20 px-2 py-1 border rounded bg-white text-gray-900 border-gray-300"
                onCommit={(cols) =>
                  setTl((prev) => ({ ...prev, grid: { ...prev.grid, cols } }))
                }
              />

              {/* ボス領域 */}
              <span className="ml-4 text-white/80" id="boss-area-label">
                ボス領域
              </span>
              {(() => {
                const b = tl.boss ?? defaultBoss(tl.grid);
                const g = tl.grid;
                // グリッドの外にボスを置けてしまうと、盤面に出ないまま
                // 配置不可の領域だけが残る
                const setBoss = (patch: Partial<BossArea>) =>
                  setTl((prev) => ({
                    ...prev,
                    boss: {
                      ...(prev.boss ?? defaultBoss(prev.grid)),
                      ...patch,
                    },
                  }));
                const cls =
                  "w-16 px-2 py-1 border rounded bg-white text-gray-900 border-gray-300";
                return (
                  <>
                    <NumberField
                      label="X"
                      value={b.x}
                      min={0}
                      max={Math.max(0, g.cols - 1)}
                      className={cls}
                      labelClassName="flex items-center gap-1"
                      onCommit={(x) =>
                        setBoss({ x, w: Math.min(b.w, g.cols - x) })
                      }
                    />
                    <NumberField
                      label="Y"
                      value={b.y}
                      min={0}
                      max={Math.max(0, g.rows - 1)}
                      className={cls}
                      labelClassName="flex items-center gap-1"
                      onCommit={(y) =>
                        setBoss({ y, h: Math.min(b.h, g.rows - y) })
                      }
                    />
                    <NumberField
                      label="W"
                      value={b.w}
                      min={1}
                      max={Math.max(1, g.cols - b.x)}
                      className={cls}
                      labelClassName="flex items-center gap-1"
                      onCommit={(w) => setBoss({ w })}
                    />
                    <NumberField
                      label="H"
                      value={b.h}
                      min={1}
                      max={Math.max(1, g.rows - b.y)}
                      className={cls}
                      labelClassName="flex items-center gap-1"
                      onCommit={(h) => setBoss({ h })}
                    />
                  </>
                );
              })()}

              {/* はみ出し/ボス被りを一括クリーン */}
              {/* グリッド縮小やボス移動で盤面から消えた配置はデータには残る。
                  黙って消すと取り返しがつかないので、件数を出して手動で掃除させる。 */}
              {invalidPlacementCount > 0 && (
                <span className="ml-2 text-amber-300">
                  盤外・ボス領域に{invalidPlacementCount}件の配置が隠れています
                </span>
              )}
              <button
                className="ml-2 px-3 py-1 rounded border bg-white text-gray-900 border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                title="盤外やボス領域にある配置を削除して整合性を保ちます"
                disabled={invalidPlacementCount === 0}
                onClick={() => {
                  setTl((prev) => {
                    const next = structuredClone(prev);
                    pruneInvalidPlacements(next);
                    return next;
                  });
                  showToast(
                    `隠れていた${invalidPlacementCount}件の配置を削除しました。`,
                  );
                }}
              >
                適用
              </button>
            </div>
            {showGrids && (
              // ① 親を横スクロール可能に
              <div
                className="w-full overflow-x-auto"
                role="tabpanel"
                id={TURN_PANEL_ID}
                aria-labelledby={turnTabId(activeTurn)}
              >
                {/* ② テーブルの最小幅 = (左上角セル + 列数) * CELL_PX */}
                <div
                  className="inline-block"
                  style={{ minWidth: (tl.grid.cols + 1) * CELL_PX }}
                >
                  {/* ③ table は固定レイアウトのまま */}
                  <table
                    role="grid"
                    aria-label={`盤面（${activeTurn === 0 ? "準備" : `ターン${activeTurn}`}）`}
                    className="border-collapse table-fixed"
                    // Safari の収縮対策（念のため明示）
                    style={{ tableLayout: "fixed" as const }}
                  >
                    <thead>
                      <tr>
                        {/* 左上の空き角 */}
                        <th
                          className="border border-gray-700"
                          style={{ width: CELL_PX, height: CELL_PX }}
                        />
                        {/* 横ヘッダ（列数に追従） */}
                        {Array.from({ length: tl.grid.cols }, (_, cx) => (
                          <th
                            key={cx}
                            className="border border-gray-700 text-xs font-medium text-gray-300 text-center"
                            style={{ width: CELL_PX, height: CELL_PX }}
                          >
                            {alphaLabel(cx)}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {Array.from({ length: tl.grid.rows }, (_, ry) => (
                        <tr key={ry}>
                          {/* 縦ヘッダ */}
                          <th
                            className="border border-gray-700 text-xs font-medium text-gray-300 text-center"
                            style={{ width: CELL_PX, height: CELL_PX }}
                          >
                            {ry + 1}
                          </th>

                          {/* セル本体（従来の19個） */}
                          {Array.from({ length: tl.grid.cols }, (_, cx) => {
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

                            const isBoss = isBossCellAt(cx, ry);
                            const coord = `${alphaLabel(cx)}${ry + 1}`;
                            const occupants = cids.map(actorLabel).join("、");

                            return (
                              <td
                                key={cx}
                                data-cell={`${cx},${ry}`}
                                role="gridcell"
                                aria-disabled={isBoss || undefined}
                                aria-label={
                                  isBoss
                                    ? `${coord} ボス領域`
                                    : occupants
                                      ? `${coord} ${occupants}`
                                      : `${coord} 空き`
                                }
                                // 361マス全てをタブ対象にすると操作不能になるため、
                                // タブ順に入るのは1マスだけ。移動は矢印キーで行う。
                                tabIndex={
                                  cx === focusX && ry === focusY ? 0 : -1
                                }
                                onFocus={() => setFocusedCell({ x: cx, y: ry })}
                                onKeyDown={(e) => onCellKeyDown(e, cx, ry)}
                                onClick={() => activateCell(cx, ry)}
                                className={`align-top ${
                                  isBoss
                                    ? "cursor-not-allowed"
                                    : "cursor-pointer"
                                } rounded-none p-0 border border-gray-700 text-[14px] leading-tight select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-inset`}
                                style={{
                                  width: CELL_PX,
                                  height: CELL_PX,
                                  background: isBoss ? "#d1d5db" : bg,
                                }}
                                title={
                                  isBoss
                                    ? "ボス領域（配置不可）"
                                    : activeActorId
                                      ? "クリックで配置"
                                      : occupants
                                        ? `クリックで ${occupants} を選択`
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
                                        (ss) => ss.id === cid,
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
                                        (c) => c.id === cid,
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
                          {tl.characters.map((c, ci) => (
                            <option key={c.id} value={c.id}>
                              {c.name
                                ? aliasForName(c.name)
                                : `（キャラ${ci + 1} 未選択）`}
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

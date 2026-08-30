// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { deflate } from "pako";
import { b64u, decodeTL, encodeTL } from "./lib/codec";
import { makeDefaultTL } from "./lib/defaults";

const setHash = (hash: string) => {
  window.history.replaceState(null, "", hash || window.location.pathname);
};

beforeEach(() => {
  setHash("");
  localStorage.clear();
});

afterEach(cleanup);

/** 中身が壊れた v2 ハッシュを組み立てる */
const brokenHash = (payload: unknown) =>
  "#v2:" + b64u.enc(deflate(new TextEncoder().encode(JSON.stringify(payload))));

/** 盤面のセル（行ヘッダを除いた td）を取得する */
const boardCells = () =>
  document.querySelectorAll<HTMLTableCellElement>("td[data-cell]");

const cellAt = (x: number, y: number) =>
  document.querySelector<HTMLTableCellElement>(`td[data-cell="${x},${y}"]`)!;

describe("App スモーク", () => {
  it("初期表示で落ちない", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", {
        name: /編成・TL共有ツール/,
      }),
    ).toBeInTheDocument();
  });

  it("既定の 19x19 盤面が描画される", () => {
    render(<App />);
    expect(boardCells()).toHaveLength(19 * 19);
  });

  it("準備＋7ターンのタブが出る", () => {
    render(<App />);
    expect(screen.getAllByRole("tab")).toHaveLength(8);
    expect(screen.getByRole("tab", { name: "準備" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "ターン7" })).toBeInTheDocument();
  });

  it("中央 3x3 がボス領域として配置不可になっている", () => {
    render(<App />);
    expect(cellAt(9, 9)).toHaveAttribute("title", "ボス領域（配置不可）");
    expect(cellAt(0, 0)).not.toHaveAttribute("title", "ボス領域（配置不可）");
  });
});

describe("キャラの選択と配置", () => {
  it("キャラ配置ボタン → セルクリックで盤面に表示される", async () => {
    const user = userEvent.setup();
    render(<App />);

    // c1 にキャラを設定
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "ヴェプリー");

    await user.click(screen.getAllByRole("button", { name: "キャラ配置" })[0]);
    await user.click(cellAt(2, 3));

    expect(within(cellAt(2, 3)).getByText("ヴェプリー")).toBeInTheDocument();
  });

  it("同じキャラを別セルに置き直すと移動する（複製されない）", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getAllByRole("combobox")[0], "ヴェプリー");
    await user.click(screen.getAllByRole("button", { name: "キャラ配置" })[0]);

    await user.click(cellAt(2, 3));
    await user.click(cellAt(5, 6));

    expect(within(cellAt(2, 3)).queryByText("ヴェプリー")).toBeNull();
    expect(within(cellAt(5, 6)).getByText("ヴェプリー")).toBeInTheDocument();
  });

  it("ボス領域には配置できない", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getAllByRole("combobox")[0], "ヴェプリー");
    await user.click(screen.getAllByRole("button", { name: "キャラ配置" })[0]);

    await user.click(cellAt(9, 9));
    expect(within(cellAt(9, 9)).queryByText("ヴェプリー")).toBeNull();
  });
});

describe("URL 復元", () => {
  it("ハッシュ付きで開くと内容が復元される", () => {
    const tl = makeDefaultTL();
    tl.title = "復元テスト";
    tl.characters[0].name = "ヴェプリー";
    tl.prep.placements = { c1: { x: 4, y: 5 } };
    setHash("#" + encodeTL(tl));

    render(<App />);
    expect(screen.getByDisplayValue("復元テスト")).toBeInTheDocument();
    expect(within(cellAt(4, 5)).getByText("ヴェプリー")).toBeInTheDocument();
  });

  // 修正前は grid / turns 欠落のまま描画に進んで例外になっていた
  it("壊れたハッシュで開いても落ちず、既定TLで立ち上がる", () => {
    setHash(brokenHash([2]));
    render(<App />);
    expect(boardCells()).toHaveLength(19 * 19);
  });

  it("解読できないハッシュは無視される", () => {
    setHash("#v2:!!!!not-base64!!!!");
    render(<App />);
    expect(boardCells()).toHaveLength(19 * 19);
  });
});

describe("回帰: ボス領域を動かしたときの盤面更新", () => {
  it("ボス領域を移動すると、そこに重なったキャラが盤面から消える", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getAllByRole("combobox")[0], "ヴェプリー");
    await user.click(screen.getAllByRole("button", { name: "キャラ配置" })[0]);
    await user.click(cellAt(1, 1));
    expect(within(cellAt(1, 1)).getByText("ヴェプリー")).toBeInTheDocument();

    // ボス領域を (0,0) 起点の 3x3 へ動かす → (1,1) はボス領域の内側になる
    const bossX = screen.getByLabelText("X");
    const bossY = screen.getByLabelText("Y");
    await user.clear(bossX);
    await user.type(bossX, "0");
    await user.clear(bossY);
    await user.type(bossY, "0");

    expect(cellAt(1, 1)).toHaveAttribute("title", "ボス領域（配置不可）");
    // 修正前は occupiedMap が再計算されず、ボスマスの上にキャラが残っていた
    expect(within(cellAt(1, 1)).queryByText("ヴェプリー")).toBeNull();
  });
});

describe("回帰: 召喚物の削除と選択の追随", () => {
  const summonCard = (label: string) =>
    screen.getByText(label).closest("div.rounded-xl") as HTMLElement;

  it("選択中の召喚物を削除すると、別の召喚物にすり替わらない", async () => {
    const user = userEvent.setup();
    render(<App />);
    const add = screen.getByRole("button", { name: "召喚物を追加" });
    await user.click(add);
    await user.click(add);
    await user.click(add);

    // 3件それぞれに違う名前を割り当てて区別できるようにする
    const names = [
      "ガーディアン（ペーペーシャ）",
      "定息鏑（朝暉）",
      "クリーチ（ニキータ）",
    ];
    for (const [i, name] of names.entries()) {
      await user.selectOptions(
        within(summonCard(`S${i + 1}`)).getByRole("combobox"),
        name,
      );
    }

    // S2 を選択してから S2 を削除する
    await user.click(screen.getByText("S2"));
    await user.click(
      within(summonCard("S2")).getByRole("button", { name: "削除" }),
    );

    // S3 が S2 に繰り上がる
    expect(screen.queryByText("S3")).toBeNull();
    expect(
      within(summonCard("S2")).getByDisplayValue("クリーチ（ニキータ）"),
    ).toBeInTheDocument();

    // 修正前はここで選択が「繰り上がった旧S3」に移っており、
    // セルをクリックすると意図しない召喚物が配置されていた
    await user.click(cellAt(0, 0));
    expect(cellAt(0, 0).textContent).toBe("");
  });

  it("最後の1件を削除しても選択が残らない（再追加時に勝手に配置されない）", async () => {
    const user = userEvent.setup();
    render(<App />);
    const add = screen.getByRole("button", { name: "召喚物を追加" });
    await user.click(add);
    await user.click(screen.getByText("S1"));
    await user.click(
      within(summonCard("S1")).getByRole("button", { name: "削除" }),
    );
    expect(screen.getByText("（まだありません）")).toBeInTheDocument();

    // 修正前は選択が消えた s1 を指したままで、ここで placements["s1"] が
    // 書き込まれていた。画面には出ないが、召喚物を追加し直した瞬間に
    // 置いた覚えのない召喚物として現れる。
    await user.click(cellAt(0, 0));
    await user.click(add);

    expect(cellAt(0, 0).textContent).toBe("");
  });
});

describe("回帰: 編集内容の URL への反映", () => {
  it("編集するとアドレスバーのハッシュが追随する", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(window.location.hash).toBe("");

    const title = screen.getByPlaceholderText("TLタイトル");
    await user.clear(title);
    await user.type(title, "オートで同期される");

    // 修正前は「URL生成」を押すまでハッシュが一切更新されず、
    // リロードやタブ復元で編集内容が失われていた
    await waitFor(
      () => {
        expect(window.location.hash).toMatch(/^#v2:/);
        expect(decodeTL(window.location.hash)?.title).toBe(
          "オートで同期される",
        );
      },
      { timeout: 3000 },
    );
  });

  it("同期されたハッシュから開き直すと内容が戻る（リロード相当）", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getAllByRole("combobox")[0], "ヴェプリー");
    await user.click(screen.getAllByRole("button", { name: "キャラ配置" })[0]);
    await user.click(cellAt(7, 2));
    await waitFor(() => expect(window.location.hash).toMatch(/^#v2:/), {
      timeout: 3000,
    });

    cleanup();
    render(<App />);
    expect(within(cellAt(7, 2)).getByText("ヴェプリー")).toBeInTheDocument();
  });

  it("ハッシュ同期は履歴を増やさない（replaceState）", async () => {
    const user = userEvent.setup();
    const before = window.history.length;
    render(<App />);
    await user.type(screen.getByPlaceholderText("TLタイトル"), "abc");
    await waitFor(() => expect(window.location.hash).toMatch(/^#v2:/), {
      timeout: 3000,
    });
    expect(window.history.length).toBe(before);
  });
});

describe("ブラウザ保存", () => {
  const saveButton = () =>
    screen.getByRole("button", { name: "保存（ブラウザ）" });
  const setTitle = async (user: UserEvent, text: string) => {
    const input = screen.getByPlaceholderText("TLタイトル");
    await user.clear(input);
    if (text) await user.type(input, text);
  };

  it("タイトルが空だと保存せず、理由を通知する", async () => {
    const user = userEvent.setup();
    render(<App />);
    await setTitle(user, "");
    await user.click(saveButton());

    expect(screen.getByRole("status")).toHaveTextContent(
      "タイトルを入力してください。",
    );
    expect(screen.getByText("まだ保存はありません。")).toBeInTheDocument();
  });

  it("保存すると一覧に出て、リロード後も残る", async () => {
    const user = userEvent.setup();
    render(<App />);
    await setTitle(user, "深層3層");
    await user.click(saveButton());

    expect(screen.getByRole("status")).toHaveTextContent("保存しました");
    expect(screen.getByText("深層3層")).toBeInTheDocument();

    cleanup();
    render(<App />);
    expect(screen.getByText("深層3層")).toBeInTheDocument();
  });

  // 修正前は押すたびに同名エントリが積み上がり、どれが最新か分からなくなっていた
  it("同じタイトルで保存し直すと増えずに上書きされる", async () => {
    const user = userEvent.setup();
    render(<App />);
    await setTitle(user, "深層3層");
    await user.click(saveButton());
    await user.click(saveButton());

    expect(screen.getByRole("status")).toHaveTextContent("上書き保存しました");
    expect(screen.getAllByText("深層3層")).toHaveLength(1);
  });

  it("呼び出すと保存時の内容が復元される", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getAllByRole("combobox")[0], "ヴェプリー");
    await user.click(screen.getAllByRole("button", { name: "キャラ配置" })[0]);
    await user.click(cellAt(6, 6));
    await setTitle(user, "保存テスト");
    await user.click(saveButton());

    cleanup();
    render(<App />);
    expect(within(cellAt(6, 6)).queryByText("ヴェプリー")).toBeNull();
    await user.click(screen.getByRole("button", { name: "呼び出し" }));
    expect(within(cellAt(6, 6)).getByText("ヴェプリー")).toBeInTheDocument();
  });

  it("削除すると一覧から消え、リロード後も戻らない", async () => {
    const user = userEvent.setup();
    render(<App />);
    await setTitle(user, "消す予定");
    await user.click(saveButton());
    await user.click(screen.getAllByRole("button", { name: "削除" })[0]);

    expect(screen.getByText("まだ保存はありません。")).toBeInTheDocument();
    cleanup();
    render(<App />);
    expect(screen.getByText("まだ保存はありません。")).toBeInTheDocument();
  });

  it("localStorage が壊れていても起動する", () => {
    localStorage.setItem("dlf2_tl_cache_v1", "{{{ broken");
    render(<App />);
    expect(screen.getByText("まだ保存はありません。")).toBeInTheDocument();
  });
});

describe("キーボード操作", () => {
  it("盤面のタブ順に入るのは1マスだけ（361マスがタブ対象にならない）", () => {
    render(<App />);
    const focusable = [...boardCells()].filter(
      (c) => c.getAttribute("tabindex") === "0",
    );
    expect(focusable).toHaveLength(1);
    expect(focusable[0]).toBe(cellAt(0, 0));
  });

  it("矢印キーでフォーカスが移動する", async () => {
    const user = userEvent.setup();
    render(<App />);
    cellAt(0, 0).focus();

    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowDown}");
    expect(document.activeElement).toBe(cellAt(2, 1));

    await user.keyboard("{ArrowLeft}{ArrowUp}");
    expect(document.activeElement).toBe(cellAt(1, 0));
  });

  it("盤の端で止まる", async () => {
    const user = userEvent.setup();
    render(<App />);
    cellAt(0, 0).focus();
    await user.keyboard("{ArrowLeft}{ArrowUp}");
    expect(document.activeElement).toBe(cellAt(0, 0));

    await user.keyboard("{End}");
    expect(document.activeElement).toBe(cellAt(18, 0));
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(cellAt(18, 0));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(cellAt(0, 0));
  });

  it("Enter でキャラを配置できる（マウスなしで操作が完結する）", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getAllByRole("combobox")[0], "ヴェプリー");
    await user.click(screen.getAllByRole("button", { name: "キャラ配置" })[0]);

    cellAt(0, 0).focus();
    await user.keyboard("{ArrowRight}{ArrowDown}{Enter}");
    expect(within(cellAt(1, 1)).getByText("ヴェプリー")).toBeInTheDocument();
  });

  it("Space でも配置できる", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getAllByRole("combobox")[0], "ヴェプリー");
    await user.click(screen.getAllByRole("button", { name: "キャラ配置" })[0]);

    cellAt(3, 3).focus();
    await user.keyboard(" ");
    expect(within(cellAt(3, 3)).getByText("ヴェプリー")).toBeInTheDocument();
  });

  it("マスに座標と中身が読み上げ用のラベルとして付く", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(cellAt(0, 0)).toHaveAttribute("aria-label", "A1 空き");
    expect(cellAt(9, 9)).toHaveAttribute("aria-label", "J10 ボス領域");
    expect(cellAt(9, 9)).toHaveAttribute("aria-disabled", "true");

    await user.selectOptions(screen.getAllByRole("combobox")[0], "ヴェプリー");
    await user.click(screen.getAllByRole("button", { name: "キャラ配置" })[0]);
    await user.click(cellAt(2, 4));
    expect(cellAt(2, 4)).toHaveAttribute("aria-label", "C5 ヴェプリー");
  });

  it("ターンタブが左右キーで切り替わる", async () => {
    const user = userEvent.setup();
    render(<App />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(tabs[1]).toHaveAttribute("tabindex", "-1");

    tabs[0].focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent(
      "ターン2",
    );
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent(
      "ターン1",
    );
  });

  it("タブと盤面が aria で結びついている", () => {
    render(<App />);
    const panel = screen.getByRole("tabpanel");
    const selectedTab = screen.getByRole("tab", { selected: true });
    expect(selectedTab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", selectedTab.id);
  });
});

describe("盤面サイズとボス領域の入力", () => {
  /** 入力して確定（フォーカスアウト）まで行う */
  const enter = async (user: UserEvent, el: HTMLElement, v: string) => {
    await user.clear(el);
    if (v) await user.type(el, v);
    await user.tab();
  };

  // 修正前は毎キーストロークで下限クランプしていたため、値を消して
  // 打ち直すと "1" が即 5 になり、続く "2" で "52"→35 に化けていた
  it("下限より小さい桁から始まる値を入力できる", async () => {
    const user = userEvent.setup();
    render(<App />);
    const rows = screen.getByLabelText("縦");
    await enter(user, rows, "12");
    expect(rows).toHaveValue(12);

    const cols = screen.getByLabelText("横");
    await enter(user, cols, "31");
    expect(cols).toHaveValue(31);
  });

  it("グリッドは 5〜35 に収まる", async () => {
    const user = userEvent.setup();
    render(<App />);
    const rows = screen.getByLabelText("縦");
    await enter(user, rows, "999");
    expect(rows).toHaveValue(35);
    await enter(user, rows, "1");
    expect(rows).toHaveValue(5);
    await enter(user, rows, "");
    expect(rows).toHaveValue(5);
  });

  it("ボス領域はグリッドの外に出せない", async () => {
    const user = userEvent.setup();
    render(<App />);
    const bossX = screen.getByLabelText("X");
    const bossW = screen.getByLabelText("W");

    await enter(user, bossX, "999");
    expect(bossX).toHaveValue(18); // cols - 1

    await enter(user, bossW, "999");
    expect(bossW).toHaveValue(1); // cols - x = 19 - 18

    await enter(user, bossX, "0");
    await enter(user, bossW, "999");
    expect(bossW).toHaveValue(19);
  });

  it("ボス領域は負の値にならない", async () => {
    const user = userEvent.setup();
    render(<App />);
    const bossY = screen.getByLabelText("Y");
    await enter(user, bossY, "-5");
    expect(bossY).toHaveValue(0);
  });

  it("グリッドを縮めた後にボス領域を編集すると内側に収まる", async () => {
    const user = userEvent.setup();
    render(<App />);
    await enter(user, screen.getByLabelText("X"), "15");
    await enter(user, screen.getByLabelText("W"), "4");
    await enter(user, screen.getByLabelText("縦"), "8");
    await enter(user, screen.getByLabelText("横"), "8");

    // 盤を縮めた時点では自動で潰さない（入力途中の一時的な縮小で
    // ボス領域が失われるのを避けるため）。触った時点で内側へ収まる。
    await enter(user, screen.getByLabelText("X"), "9");
    expect(screen.getByLabelText("X")).toHaveValue(7);
    expect(
      Number((screen.getByLabelText("W") as HTMLInputElement).value),
    ).toBeLessThanOrEqual(1);
  });

  it("凸は 0〜6 に収まる", async () => {
    const user = userEvent.setup();
    render(<App />);
    const lb = screen.getAllByLabelText("凸")[0];
    await enter(user, lb, "99");
    expect(lb).toHaveValue(6);
    await enter(user, lb, "3");
    expect(lb).toHaveValue(3);
  });
});

describe("盤外に隠れた配置", () => {
  const applyButton = () => screen.getByRole("button", { name: "適用" });

  it("問題が無いときは警告が出ず、適用ボタンも押せない", () => {
    render(<App />);
    expect(screen.queryByText(/配置が隠れています/)).toBeNull();
    expect(applyButton()).toBeDisabled();
  });

  // グリッドを縮めた配置は画面から消えるがデータには残る。
  // 黙って消さず、件数を出して利用者に判断させる。
  it("グリッドを縮めると隠れた配置の件数が出て、適用で掃除できる", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getAllByRole("combobox")[0], "ヴェプリー");
    await user.click(screen.getAllByRole("button", { name: "キャラ配置" })[0]);
    await user.click(cellAt(17, 17));

    const rows = screen.getByLabelText("縦");
    await user.clear(rows);
    await user.type(rows, "8");

    expect(screen.getByText(/1件の配置が隠れています/)).toBeInTheDocument();
    expect(applyButton()).toBeEnabled();

    await user.click(applyButton());
    expect(screen.queryByText(/配置が隠れています/)).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "1件の配置を削除しました",
    );
  });

  it("ボス領域を配置に重ねても隠れた配置として数えられる", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getAllByRole("combobox")[0], "ヴェプリー");
    await user.click(screen.getAllByRole("button", { name: "キャラ配置" })[0]);
    await user.click(cellAt(1, 1));

    const bossX = screen.getByLabelText("X");
    const bossY = screen.getByLabelText("Y");
    await user.clear(bossX);
    await user.type(bossX, "0");
    await user.clear(bossY);
    await user.type(bossY, "0");

    expect(screen.getByText(/1件の配置が隠れています/)).toBeInTheDocument();
  });
});

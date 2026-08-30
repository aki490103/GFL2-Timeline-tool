// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { inflate } from "pako";
import { b64u, encodeTL } from "./lib/codec";
import { makeDefaultTL } from "./lib/defaults";

const setHash = (hash: string) => {
  window.history.replaceState(null, "", hash || window.location.pathname);
};

beforeEach(() => {
  setHash("");
  localStorage.clear();
});

afterEach(cleanup);

/**
 * URL ハッシュを（正規化を通さず）そのままデコードする。
 * decodeTL は normalizeTimeline を通すため、書き込まれた不正データが
 * 消えてしまい検証にならない。
 */
const rawPayload = () =>
  JSON.parse(
    new TextDecoder().decode(inflate(b64u.dec(window.location.hash.slice(4)))),
  );

/** 盤面のセル（行ヘッダを除いた td）を取得する */
const boardCells = () =>
  document.querySelectorAll<HTMLTableCellElement>('td[role="button"]');

const cellAt = (x: number, y: number, cols = 19) => boardCells()[y * cols + x];

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
    setHash("#" + encodeTL({ v: 1 } as never));
    render(<App />);
    expect(boardCells()).toHaveLength(19 * 19);
  });

  it("解読できないハッシュは無視される", () => {
    setHash("#v1:!!!!not-base64!!!!");
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

  it("最後の1件を削除すると選択が解除され、幽霊配置がURLに残らない", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "召喚物を追加" }));
    await user.click(screen.getByText("S1"));
    await user.click(
      within(summonCard("S1")).getByRole("button", { name: "削除" }),
    );
    expect(screen.getByText("（まだありません）")).toBeInTheDocument();

    await user.click(cellAt(0, 0));
    expect(cellAt(0, 0).textContent).toBe("");

    // 画面には出ないが、修正前は存在しない s1 の配置が書き込まれ
    // 共有URLにそのまま載っていた
    await waitFor(
      () => {
        expect(window.location.hash).toMatch(/^#v1:/);
        expect(rawPayload().prep.placements).toEqual({});
      },
      { timeout: 3000 },
    );
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
        expect(window.location.hash).toMatch(/^#v1:/);
        expect(rawPayload().title).toBe("オートで同期される");
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
    await waitFor(() => expect(window.location.hash).toMatch(/^#v1:/), {
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
    await waitFor(() => expect(window.location.hash).toMatch(/^#v1:/), {
      timeout: 3000,
    });
    expect(window.history.length).toBe(before);
  });
});

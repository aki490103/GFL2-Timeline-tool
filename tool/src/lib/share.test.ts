import { describe, expect, it } from "vitest";
import { discordMaskedLink, escapeDiscordText } from "./share";

const URL_ = "https://aki490103.github.io/GFL2-Timeline-tool/#v2:abc-_123";

describe("escapeDiscordText", () => {
  it("普通の文字はそのまま", () => {
    expect(escapeDiscordText("深層戦区3層 ボス編成")).toBe(
      "深層戦区3層 ボス編成",
    );
  });

  it("記法を壊す括弧をエスケープする", () => {
    expect(escapeDiscordText("編成[A](暫定)")).toBe("編成\\[A\\]\\(暫定\\)");
  });

  it("Markdown の装飾文字をエスケープする", () => {
    expect(escapeDiscordText("*強調* _下線_ ~取消~ `コード` |伏字|")).toBe(
      "\\*強調\\* \\_下線\\_ \\~取消\\~ \\`コード\\` \\|伏字\\|",
    );
  });

  it("バックスラッシュを二重にしない", () => {
    expect(escapeDiscordText("a\\b")).toBe("a\\\\b");
  });

  // -, #, > は行頭でしか意味を持たない。表示文字の中では素通しし、
  // タイトルによくある "3層-A" のような表記をそのまま見せる
  it("行頭でしか効かない記号は素通しする", () => {
    expect(escapeDiscordText("深層3層-A")).toBe("深層3層-A");
    expect(escapeDiscordText("# 見出し")).toBe("# 見出し");
    expect(escapeDiscordText("> 引用")).toBe("> 引用");
  });

  it("改行や連続空白は空白1つに潰す", () => {
    expect(escapeDiscordText("前半\n後半")).toBe("前半 後半");
    expect(escapeDiscordText("  前後の空白  ")).toBe("前後の空白");
    expect(escapeDiscordText("間に   空白")).toBe("間に 空白");
  });

  it("空文字は空文字", () => {
    expect(escapeDiscordText("")).toBe("");
    expect(escapeDiscordText("   ")).toBe("");
  });
});

describe("discordMaskedLink", () => {
  it("タイトルとURLを記法に包む", () => {
    expect(discordMaskedLink("深層3層TL", URL_)).toBe(`[深層3層TL](${URL_})`);
  });

  it("タイトルが空なら既定の文言を使う", () => {
    expect(discordMaskedLink("", URL_)).toBe(
      `[ドールズフロントライン2 編成・TL](${URL_})`,
    );
    expect(discordMaskedLink("   ", URL_)).toBe(
      `[ドールズフロントライン2 編成・TL](${URL_})`,
    );
  });

  it("タイトルの括弧で記法が壊れない", () => {
    const link = discordMaskedLink("編成(暫定)", URL_);
    expect(link).toBe(`[編成\\(暫定\\)](${URL_})`);
    // 表示文字の部分に生の ] や ( が残っていない
    expect(link.slice(1, link.lastIndexOf("]("))).not.toMatch(/(?<!\\)[[\]()]/);
  });

  it("URL 側はそのまま保たれる", () => {
    const link = discordMaskedLink("題", URL_);
    expect(link.slice(link.lastIndexOf("](") + 2, -1)).toBe(URL_);
  });
});

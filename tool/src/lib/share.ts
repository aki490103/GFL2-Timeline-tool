/**
 * Discord のリンク埋め込み記法 `[表示文字](URL)` を組み立てる。
 *
 * 共有URLは編成の中身をそのまま載せている都合で長くなるため、
 * Discord では記法で包んで貼るのが実用的だが、毎回手で書くのは面倒。
 * ここで文字列を組み立てて、ボタン一つでコピーできるようにする。
 */

/** 表示文字の中で Markdown として解釈される文字を打ち消す */
export const escapeDiscordText = (text: string): string =>
  text
    // 改行が入ると記法が途中で切れるので空白に潰す
    .replace(/\s+/g, " ")
    .trim()
    // 表示文字の中で意味を持つものだけを対象にする。
    // -, #, > は行頭でしか効かないので、ここでは打ち消さない
    // （タイトルによく入る "-" が \- として見えてしまうため）
    .replace(/[\\[\]()*_~`|]/g, (c) => "\\" + c);

const DEFAULT_LABEL = "ドールズフロントライン2 編成・TL";

/**
 * `[タイトル](URL)` を返す。タイトルが空なら既定の文言を使う。
 * URL 側は base64url と `#:/.` しか含まないため括弧で壊れることはない。
 */
export const discordMaskedLink = (title: string, url: string): string => {
  const label = escapeDiscordText(title) || escapeDiscordText(DEFAULT_LABEL);
  return `[${label}](${url})`;
};

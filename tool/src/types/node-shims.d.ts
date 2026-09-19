/**
 * アプリ本体はブラウザ専用なので @types/node は入れていない。
 * 一方 order-lock.sync.test.ts だけは添字表を書き出すために Node の API を使う。
 * そのためだけに @types/node を足すと、アプリ側でも process や Buffer が
 * 型エラーにならなくなってしまうので、必要な分だけをここで宣言する。
 */

declare module "node:fs" {
  export function writeFileSync(path: URL | string, data: string): void;
}

declare const process: {
  env: Record<string, string | undefined>;
};

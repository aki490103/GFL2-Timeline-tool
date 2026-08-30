import { deflate, inflate } from "pako";
import { normalizeTimeline } from "./normalize";
import type { TimelineV1 } from "./types";

// base64url
export const b64u = {
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

export const encodeTL = (tl: TimelineV1) => {
  const json = JSON.stringify(tl);
  const utf8 = new TextEncoder().encode(json);
  const z = deflate(utf8);
  return "v1:" + b64u.enc(z);
};

export const decodeTL = (hash: string): TimelineV1 | null => {
  if (!hash.startsWith("#v1:")) return null;
  try {
    const raw = b64u.dec(hash.slice(4));
    const utf8 = inflate(raw);
    const json = new TextDecoder().decode(utf8);
    const obj = JSON.parse(json);
    // v は互換性の門番。形の検証と補完は normalizeTimeline に任せるので、
    // 途中で切れた URL や手書きハッシュでも画面が落ちない。
    if (obj?.v === 1) return normalizeTimeline(obj);
  } catch (e) {
    console.error("Failed to decode TL from hash:", e);
  }
  return null;
};

import { useState } from "react";

const clampInt = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.trunc(n) || 0));

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
  className?: string;
  labelClassName?: string;
};

/**
 * 範囲つきの数値入力。
 *
 * 毎キーストロークで下限へクランプすると、値を消して打ち直すときに
 * 打った桁が下限に化けて目的の値を入力できなくなる
 * （下限5の欄で "12" と打つと "1"→5 になり、続く "2" で "52"→35 になる）。
 *
 * そのため入力中は文字列のまま保持し、
 *   - 範囲内になった時点で即反映
 *   - フォーカスが外れた時点でクランプして確定
 * という挙動にしている。
 */
export function NumberField({
  label,
  value,
  min,
  max,
  onCommit,
  className,
  labelClassName,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <label className={labelClassName ?? "flex items-center gap-2"}>
      <span className="text-white/80">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        className={className}
        value={draft ?? String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const n = Number(raw);
          // 範囲内に収まっている間だけ即座に反映する
          if (raw !== "" && Number.isFinite(n) && n >= min && n <= max) {
            onCommit(Math.trunc(n));
          }
        }}
        onBlur={() => {
          const n = Number(draft ?? value);
          onCommit(clampInt(Number.isFinite(n) ? n : value, min, max));
          setDraft(null);
        }}
      />
    </label>
  );
}

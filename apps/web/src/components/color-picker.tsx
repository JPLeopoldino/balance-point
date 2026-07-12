"use client";

import { Label } from "@balance-point/ui/components/label";
import { PipetteIcon } from "lucide-react";
import { useId } from "react";

import { useT } from "@/i18n";

/** Dark-friendly preset palette shared by accounts, categories and cards. */
export const PRESET_COLORS = [
  "#eab308", // yellow (brand)
  "#f59e0b", // amber
  "#f97316", // orange
  "#ef4444", // red
  "#ec4899", // pink
  "#d946ef", // fuchsia
  "#a855f7", // purple
  "#8b5cf6", // violet
  "#6366f1", // indigo
  "#3b82f6", // blue
  "#0ea5e9", // sky
  "#06b6d4", // cyan
  "#14b8a6", // teal
  "#10b981", // emerald
  "#84cc16", // lime
  "#a1a1aa", // gray
];

/**
 * Swatch picker: 16 presets + a custom color well. `allowInherit` prepends a
 * "no color" swatch (value null) — used by cards to inherit the host account's
 * color. Legacy `var(--chart-N)` values render as a custom selection.
 */
export function ColorPicker({
  value,
  onChange,
  allowInherit = false,
  inheritLabel,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
  allowInherit?: boolean;
  inheritLabel?: string;
}) {
  const t = useT();
  const customId = useId();
  const isCustom = value !== null && !PRESET_COLORS.includes(value);
  const customValue = isCustom && value.startsWith("#") ? value : "#eab308";
  const inheritText = inheritLabel ?? t("colorPicker.inherit");

  return (
    <div className="flex flex-wrap items-center gap-2 md:gap-1.5">
      {allowInherit ? (
        <button
          type="button"
          title={inheritText}
          aria-label={inheritText}
          aria-pressed={value === null}
          className={`flex size-8 items-center justify-center rounded-full border-2 border-dashed text-[10px] text-muted-foreground md:size-6 md:text-[9px] ${
            value === null ? "border-foreground" : "border-border"
          }`}
          onClick={() => onChange(null)}
        >
          A
        </button>
      ) : null}
      {PRESET_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={t("colorPicker.colorAria", { color })}
          aria-pressed={value === color}
          className={`size-8 rounded-full border-2 md:size-6 ${
            value === color ? "border-foreground" : "border-transparent"
          }`}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
        />
      ))}
      <Label
        htmlFor={customId}
        title={t("colorPicker.custom")}
        className={`relative flex size-8 cursor-pointer items-center justify-center rounded-full border-2 md:size-6 ${
          isCustom ? "border-foreground" : "border-border"
        }`}
        style={isCustom ? { backgroundColor: customValue } : undefined}
      >
        {!isCustom ? <PipetteIcon className="size-4 text-muted-foreground md:size-3" /> : null}
        <input
          id={customId}
          type="color"
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          value={customValue}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t("colorPicker.custom")}
        />
      </Label>
    </div>
  );
}

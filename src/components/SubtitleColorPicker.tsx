"use client";

import React from "react";
import { SUBTITLE_COLORS, type SubtitleColorId } from "@/lib/subtitles";

interface SubtitleColorPickerProps {
  value: SubtitleColorId;
  onChange: (id: SubtitleColorId) => void;
  size?: "sm" | "md";
  className?: string;
}

/** Шесть цветных точек: белый, жёлтый, красный, синий, фиолетовый, зелёный. */
export const SubtitleColorPicker: React.FC<SubtitleColorPickerProps> = ({ value, onChange, size = "md", className }) => {
  const dot = size === "sm" ? "w-5 h-5" : "w-7 h-7";
  return (
    <div role="radiogroup" aria-label="Цвет субтитров" className={"flex items-center gap-1.5 " + (className || "")}>
      {SUBTITLE_COLORS.map((c) => {
        const active = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={c.label}
            onClick={(e) => {
              e.stopPropagation();
              onChange(c.id);
            }}
            className={
              `${dot} rounded-full border-2 transition-transform cursor-pointer shrink-0 ` +
              (active ? "border-white scale-110 shadow-[0_0_0_2px_rgba(0,0,0,0.6)]" : "border-black/60 hover:scale-105")
            }
            style={{ backgroundColor: c.hex }}
          />
        );
      })}
    </div>
  );
};

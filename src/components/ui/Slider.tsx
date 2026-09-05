"use client";

import React from "react";
import { cn } from "./cn";

export interface SliderProps {
  /** null = пользователь ещё не выбирал. Значения по умолчанию нет — это требование ТЗ. */
  value: number | null;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Подпись слева, когда значение уже выбрано. */
  valueLabel?: React.ReactNode;
  /** Текст-приглашение, пока ничего не выбрано. */
  placeholder?: string;
  ticks?: number[];
  className?: string;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  min,
  max,
  step = 1,
  onChange,
  valueLabel,
  placeholder = "Выберите значение",
  ticks,
  className,
}) => {
  const untouched = value === null;
  // Нативный range не умеет быть пустым, поэтому в невыбранном состоянии
  // ставим ползунок посередине и глушим его визуально.
  const shown = untouched ? (min + max) / 2 : value;
  const percent = ((shown - min) / (max - min)) * 100;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-3 min-w-0">
        {untouched ? (
          <span className="text-[15px] sm:text-[14px] font-semibold text-warn-text">{placeholder}</span>
        ) : (
          <span className="text-[15px] sm:text-[14px] font-semibold text-ink tabular">{valueLabel}</span>
        )}
      </div>

      <div className="relative">
        <div className="h-2 w-full rounded-full bg-surface-3 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", untouched ? "bg-transparent" : "bg-accent")}
            style={{ width: `${untouched ? 0 : percent}%` }}
          />
        </div>

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={shown}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerDown={() => untouched && onChange(shown)}
          aria-label={placeholder}
          className={cn(
            "absolute inset-0 w-full h-2 appearance-none bg-transparent cursor-pointer",
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5",
            "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2",
            "[&::-webkit-slider-thumb]:shadow-soft [&::-webkit-slider-thumb]:cursor-pointer",
            untouched
              ? "[&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:border-border-strong"
              : "[&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:border-surface",
            "[&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full",
            "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:cursor-pointer",
            untouched
              ? "[&::-moz-range-thumb]:bg-surface [&::-moz-range-thumb]:border-border-strong"
              : "[&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:border-surface"
          )}
        />
      </div>

      {ticks && ticks.length > 0 && (
        <div className="flex justify-between text-[11px] text-faint tabular select-none">
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
};

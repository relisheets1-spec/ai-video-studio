"use client";

import React from "react";
import { cn } from "./cn";

export interface SelectCardProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  selected?: boolean;
  title: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  /** Строка справа снизу: цена, длительность и т.п. */
  meta?: React.ReactNode;
  layout?: "vertical" | "horizontal";
}

/**
 * Выбираемая карточка: жанр, стиль, хронометраж, голос.
 * Выделение — заливка + тонкая акцентная рамка + точка-маркер,
 * без ring-2 лаймом, который делал сетки визуально «жирными».
 */
export const SelectCard: React.FC<SelectCardProps> = ({
  selected = false,
  title,
  hint,
  icon,
  meta,
  layout = "vertical",
  className,
  ...rest
}) => (
  <button
    type="button"
    aria-pressed={selected}
    className={cn(
      "group relative text-left rounded-control border p-3.5 min-w-0",
      "transition-colors duration-150 cursor-pointer",
      selected
        ? "bg-surface-2 border-accent"
        : "bg-surface border-hairline hover:border-hairline-strong hover:bg-surface-2",
      className
    )}
    {...rest}
  >
    <span
      className={cn(
        "absolute top-3 right-3 w-2 h-2 rounded-full bg-accent transition-opacity",
        selected ? "opacity-100" : "opacity-0"
      )}
    />
    <div
      className={cn(
        "flex min-w-0",
        layout === "vertical" ? "flex-col gap-2.5" : "items-center gap-3"
      )}
    >
      {icon && (
        <span
          className={cn(
            "shrink-0 transition-colors",
            selected ? "text-accent" : "text-muted group-hover:text-ink"
          )}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-ink leading-tight pr-4">
          {title}
        </span>
        {hint && (
          <span className="block text-[12px] text-muted leading-snug mt-1">
            {hint}
          </span>
        )}
        {meta && (
          <span className="block text-[11.5px] text-faint mt-1.5 tabular">{meta}</span>
        )}
      </span>
    </div>
  </button>
);

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
  /** sm — плотная карточка для сеток жанров. */
  size?: "md" | "sm";
}

/**
 * Выбираемая карточка: формат кадра, жанр, голос. Невыбранная — серая;
 * выбранная плавно «загорается»: акцентная рамка, точка и зелёная иконка.
 * В сетке карточки тянутся на одну высоту, содержимое стоит по центру.
 */
export const SelectCard: React.FC<SelectCardProps> = ({
  selected = false,
  title,
  hint,
  icon,
  meta,
  layout = "vertical",
  size = "md",
  className,
  ...rest
}) => (
  <button
    type="button"
    aria-pressed={selected}
    className={cn(
      "group relative text-left rounded-control border min-w-0 h-full",
      size === "sm" ? "p-2.5" : "p-3.5",
      "transition-[background-color,border-color,box-shadow] duration-300 ease-out cursor-pointer",
      selected
        ? "bg-surface-2 border-accent shadow-[0_0_0_1px_rgb(var(--accent-text)/0.25)]"
        : "bg-surface border-hairline hover:border-hairline-strong hover:bg-surface-2",
      className
    )}
    {...rest}
  >
    <span
      className={cn(
        "absolute w-2 h-2 rounded-full bg-accent transition-[opacity,transform] duration-300 ease-out",
        size === "sm" ? "top-2 right-2" : "top-3 right-3",
        selected ? "opacity-100 scale-100" : "opacity-0 scale-50"
      )}
    />
    <div
      className={cn(
        "flex min-w-0 h-full",
        layout === "vertical" ? (size === "sm" ? "flex-col gap-1.5" : "flex-col gap-2.5") : "items-center gap-3"
      )}
    >
      {icon && (
        <span
          className={cn(
            "shrink-0 transition-colors duration-300 ease-out",
            selected ? "text-accent" : "text-faint group-hover:text-muted"
          )}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block font-medium leading-tight pr-4 transition-colors duration-300 ease-out",
            selected ? "text-ink" : "text-muted group-hover:text-ink",
            size === "sm" ? "text-[13px] sm:text-[12.5px]" : "text-[15px] sm:text-[13.5px]"
          )}
        >
          {title}
        </span>
        {hint && (
          <span className="block text-[13px] sm:text-[12px] text-muted leading-snug mt-1">
            {hint}
          </span>
        )}
        {meta && (
          <span className="block text-[12.5px] sm:text-[11.5px] text-faint mt-1.5 tabular">{meta}</span>
        )}
      </span>
    </div>
  </button>
);

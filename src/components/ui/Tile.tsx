"use client";

import React from "react";
import { cn } from "./cn";

export interface TileProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Заголовок плитки. */
  title?: React.ReactNode;
  /** Подпись под заголовком. */
  hint?: React.ReactNode;
  /** Иконка слева от заголовка. */
  icon?: React.ReactNode;
  /** Слот справа в шапке: счётчик, кнопка, бейдж. */
  action?: React.ReactNode;
  /** Убрать внутренние отступы у тела (для таблиц и списков во всю ширину). */
  flush?: boolean;
  tone?: "surface" | "contrast" | "accent";
}

const tones = {
  surface: "bg-surface border-hairline text-ink",
  contrast: "bg-contrast border-transparent text-contrast-ink",
  accent: "bg-accent border-transparent text-accent-ink",
};

export const Tile: React.FC<TileProps> = ({
  title,
  hint,
  icon,
  action,
  flush,
  tone = "surface",
  className,
  children,
  ...rest
}) => (
  <section
    className={cn(
      "rounded-tile border shadow-soft flex flex-col min-w-0",
      tones[tone],
      className
    )}
    {...rest}
  >
    {(title || action) && (
      <header
        className={cn(
          "flex items-start justify-between gap-3 px-5 pt-5",
          !flush && "pb-1"
        )}
      >
        <div className="flex items-start gap-2.5 min-w-0">
          {icon && (
            <span
              className={cn(
                "shrink-0 mt-px",
                tone === "surface" ? "text-muted" : "opacity-70"
              )}
            >
              {icon}
            </span>
          )}
          <div className="min-w-0">
            {title && (
              <h2 className="text-[16.5px] sm:text-[15px] font-semibold tracking-tight leading-tight truncate">
                {title}
              </h2>
            )}
            {hint && (
              <p
                className={cn(
                  "text-[13.5px] sm:text-[12.5px] leading-snug mt-1",
                  tone === "surface" ? "text-muted" : "opacity-70"
                )}
              >
                {hint}
              </p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
      </header>
    )}
    <div className={cn("flex-1 min-w-0", flush ? "" : "p-5", title && !flush && "pt-4")}>
      {children}
    </div>
  </section>
);

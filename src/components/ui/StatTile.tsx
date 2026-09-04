"use client";

import React from "react";
import { cn } from "./cn";

export interface StatTileProps {
  label: string;
  value: React.ReactNode;
  /** Подпись под значением. */
  caption?: React.ReactNode;
  icon?: React.ReactNode;
  /** accent — заливка лаймом, contrast — графитовая плитка. */
  tone?: "surface" | "accent" | "contrast";
  className?: string;
  /** Для узких плиток: текстовые значения вроде «~25 сек» не влезают в 32px. */
  valueClassName?: string;
}

const tones = {
  surface: "bg-surface border-hairline text-ink",
  accent: "bg-accent border-transparent text-accent-ink",
  contrast: "bg-contrast border-transparent text-contrast-ink",
};

export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  caption,
  icon,
  tone = "surface",
  className,
  valueClassName,
}) => (
  <div
    className={cn(
      "rounded-tile border shadow-soft p-5 flex flex-col justify-between min-h-[124px] min-w-0",
      tones[tone],
      className
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <span
        className={cn(
          "text-[11px] font-semibold uppercase tracking-[0.08em]",
          tone === "surface" ? "text-faint" : "opacity-60"
        )}
      >
        {label}
      </span>
      {icon && (
        <span className={cn("shrink-0", tone === "surface" ? "text-faint" : "opacity-60")}>
          {icon}
        </span>
      )}
    </div>
    <div className="mt-4 min-w-0">
      <div
        className={cn(
          "text-[32px] leading-none font-bold tracking-tight tabular truncate",
          valueClassName
        )}
      >
        {value}
      </div>
      {caption && (
        <div
          className={cn(
            "text-[12.5px] mt-1.5 truncate",
            tone === "surface" ? "text-muted" : "opacity-70"
          )}
        >
          {caption}
        </div>
      )}
    </div>
  </div>
);

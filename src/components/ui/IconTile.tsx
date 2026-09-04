"use client";

import React from "react";
import { cn } from "./cn";

export interface IconTileProps {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** brand — лаймовая плитка с тёмным глифом (фирменный знак). */
  tone?: "brand" | "contrast" | "soft";
  className?: string;
}

const sizes = {
  sm: "w-8 h-8 rounded-[9px]",
  md: "w-10 h-10 rounded-control",
  lg: "w-12 h-12 rounded-[14px]",
};

const tones = {
  // Лайм ЗАЛИВКОЙ под тёмным глифом — 12.5:1, одинаково читается в обеих темах.
  // Обратный вариант (лаймовый глиф на светлой плитке) давал бы 1.5:1.
  brand: "bg-accent text-accent-ink",
  contrast: "bg-contrast text-contrast-ink",
  soft: "bg-surface-2 text-muted border border-hairline",
};

export const IconTile: React.FC<IconTileProps> = ({
  children,
  size = "md",
  tone = "brand",
  className,
}) => (
  <span
    className={cn(
      "inline-flex items-center justify-center shrink-0",
      sizes[size],
      tones[tone],
      className
    )}
  >
    {children}
  </span>
);

"use client";

import React from "react";
import { cn } from "./cn";

type Tone = "ok" | "warn" | "danger" | "neutral" | "accent" | "outline";

const tones: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok-text",
  warn: "bg-warn-soft text-warn-text",
  danger: "bg-danger-soft text-danger-text",
  neutral: "bg-neutral-soft text-neutral-text",
  // Лайм тут именно заливкой, текст на нём тёмный — 12.5:1.
  accent: "bg-accent text-accent-ink",
  outline: "bg-transparent text-muted border border-hairline",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  tone = "neutral",
  icon,
  className,
  children,
  ...rest
}) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full",
      "text-[12px] font-medium whitespace-nowrap",
      tones[tone],
      className
    )}
    {...rest}
  >
    {icon}
    {children}
  </span>
);

"use client";

import React from "react";
import { WarningCircle, Info, CheckCircle, ShieldWarning } from "@phosphor-icons/react";
import { cn } from "./cn";

type Tone = "danger" | "warn" | "ok" | "info";

const tones: Record<Tone, string> = {
  danger: "bg-danger-soft text-danger-text",
  warn: "bg-warn-soft text-warn-text",
  ok: "bg-ok-soft text-ok-text",
  info: "bg-surface-2 text-muted border border-hairline",
};

const icons: Record<Tone, React.ReactNode> = {
  danger: <WarningCircle size={18} className="shrink-0 mt-px" />,
  warn: <ShieldWarning size={18} className="shrink-0 mt-px" />,
  ok: <CheckCircle size={18} className="shrink-0 mt-px" />,
  info: <Info size={18} className="shrink-0 mt-px" />,
};

export const Alert: React.FC<{
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}> = ({ tone = "danger", title, children, className }) => (
  <div
    role="alert"
    className={cn(
      "flex items-start gap-2.5 rounded-control px-3.5 py-3 text-[14px] sm:text-[13px] leading-snug",
      tones[tone],
      className
    )}
  >
    {icons[tone]}
    <div className="min-w-0">
      {title && <div className="font-semibold">{title}</div>}
      {children && <div className={cn(title && "mt-0.5 opacity-90")}>{children}</div>}
    </div>
  </div>
);

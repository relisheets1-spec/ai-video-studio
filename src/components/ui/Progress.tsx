"use client";

import React from "react";
import { cn } from "./cn";

export const Progress: React.FC<{
  value: number;
  className?: string;
  label?: React.ReactNode;
}> = ({ value, className, label }) => {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="flex items-center justify-between gap-3 mb-2 text-[12.5px]">
          <span className="text-muted truncate">{label}</span>
          <span className="text-ink font-semibold tabular shrink-0">{Math.round(v)}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(v)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full rounded-full bg-surface-3 overflow-hidden"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
};

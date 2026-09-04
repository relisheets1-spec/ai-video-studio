"use client";

import React from "react";
import { cn } from "./cn";

const base =
  "w-full bg-surface-2 border border-hairline rounded-control text-ink " +
  "placeholder:text-faint transition-colors " +
  "hover:border-hairline-strong " +
  "focus:outline-none focus:border-accent focus:bg-surface " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export interface LabelProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  /** Слот справа от подписи: счётчик слов, ссылка, бейдж. */
  aside?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}

export const Field: React.FC<LabelProps> = ({
  label,
  hint,
  aside,
  error,
  children,
  className,
}) => (
  <div className={cn("flex flex-col gap-2 min-w-0", className)}>
    {(label || aside) && (
      <div className="flex items-baseline justify-between gap-3">
        {label && (
          <span className="text-[13px] font-medium text-ink">{label}</span>
        )}
        {aside && <span className="text-[12px] text-faint">{aside}</span>}
      </div>
    )}
    {children}
    {error ? (
      <span className="text-[12.5px] text-danger-text">{error}</span>
    ) : (
      hint && <span className="text-[12.5px] text-muted">{hint}</span>
    )}
  </div>
);

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...rest }, ref) => (
  <input ref={ref} className={cn(base, "h-11 px-3.5 text-sm", className)} {...rest} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...rest }, ref) => (
  <textarea
    ref={ref}
    className={cn(base, "px-3.5 py-3 text-sm leading-relaxed resize-none", className)}
    {...rest}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...rest }, ref) => (
  <select
    ref={ref}
    className={cn(base, "h-11 px-3 text-sm cursor-pointer appearance-none", className)}
    {...rest}
  >
    {children}
  </select>
));
Select.displayName = "Select";

"use client";

import React from "react";
import { CircleNotch } from "@phosphor-icons/react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "contrast";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  // Лайм — только заливка под тёмным текстом. Текстом на светлом фоне он даёт 1.5:1.
  primary:
    "bg-accent text-accent-ink hover:bg-accent-hover border border-transparent font-semibold",
  secondary:
    "bg-surface-2 text-ink border border-hairline hover:border-hairline-strong hover:bg-surface-3 font-medium",
  ghost:
    "bg-transparent text-muted border border-transparent hover:bg-surface-2 hover:text-ink font-medium",
  danger:
    "bg-danger-soft text-danger-text border border-transparent hover:brightness-95 font-medium",
  contrast:
    "bg-contrast text-contrast-ink border border-transparent hover:opacity-90 font-semibold",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-[13px] gap-1.5 rounded-control",
  md: "h-11 px-4 text-sm gap-2 rounded-control",
  lg: "h-[52px] px-6 text-[15px] gap-2.5 rounded-control",
};

const spinnerSize: Record<Size, number> = { sm: 15, md: 17, lg: 19 };

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  block?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      icon,
      iconRight,
      block,
      className,
      children,
      disabled,
      ...rest
    },
    ref
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap",
        "transition-colors duration-150 cursor-pointer select-none",
        "active:translate-y-px",
        "disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        // Выключенная лаймовая кнопка на прозрачности превращалась в грязную
        // оливку — вместо этого нейтральная заливка. Идёт ПОСЛЕ variants,
        // иначе twMerge отдаст победу цвету варианта.
        disabled && !loading &&
          "bg-surface-3 text-faint border-transparent hover:bg-surface-3",
        block && "w-full",
        className
      )}
      {...rest}
    >
      {loading ? (
        <CircleNotch
          size={spinnerSize[size]}
          className="animate-spin shrink-0"
        />
      ) : (
        icon
      )}
      {children}
      {!loading && iconRight}
    </button>
  )
);

Button.displayName = "Button";

/** Квадратная кнопка только с иконкой. */
export const IconButton = React.forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "block" | "iconRight">
>(({ variant = "ghost", size = "md", className, children, ...rest }, ref) => (
  <Button
    ref={ref}
    variant={variant}
    size={size}
    className={cn(
      "px-0 aspect-square",
      size === "sm" && "w-9",
      size === "md" && "w-11",
      size === "lg" && "w-[52px]",
      className
    )}
    {...rest}
  >
    {children}
  </Button>
));

IconButton.displayName = "IconButton";

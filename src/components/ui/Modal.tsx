"use client";

import React, { useEffect, useRef } from "react";
import { X } from "@phosphor-icons/react";
import { cn } from "./cn";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  /** Кнопки внизу. */
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** Тёмная модалка поверх видео (экспорт) — не следует за темой. */
  tone?: "surface" | "contrast";
}

const sizes = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" };

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  hint,
  icon,
  children,
  footer,
  size = "md",
  tone = "surface",
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc закрывает, фон не скроллится — раньше ни того, ни другого не было.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative w-full rounded-tile border shadow-lift outline-none",
          "animate-scale-in max-h-[calc(100vh-2rem)] flex flex-col",
          tone === "surface"
            ? "bg-surface border-hairline text-ink"
            : "bg-contrast border-transparent text-contrast-ink",
          sizes[size]
        )}
      >
        <header className="flex items-start justify-between gap-3 p-5 pb-0">
          <div className="flex items-start gap-3 min-w-0">
            {icon}
            <div className="min-w-0">
              {title && (
                <h2 className="text-[17px] font-semibold tracking-tight leading-tight">
                  {title}
                </h2>
              )}
              {hint && (
                <p className="text-[12.5px] text-muted leading-snug mt-1">{hint}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="shrink-0 -mt-1 -mr-1 p-2 rounded-control text-faint hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </header>

        <div className="p-5 overflow-y-auto flex-1 min-h-0">{children}</div>

        {footer && (
          <footer className="p-5 pt-0 flex items-center gap-2.5">{footer}</footer>
        )}
      </div>
    </div>
  );
};

"use client";

import React from "react";
import { Sun, Moon } from "@phosphor-icons/react";
import { useTheme } from "@/lib/theme";
import { cn } from "./cn";

/**
 * Рисует ОБЕ иконки и прячет лишнюю через CSS.
 * Из-за этого разметка сервера и клиента совпадает — кнопка не «прыгает»
 * после гидрации, как это бывает с паттерном `mounted && ...`.
 */
export const ThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Сменить тему"
      title="Сменить тему"
      className={cn(
        "grid place-items-center w-9 h-9 rounded-full shrink-0",
        "border border-hairline bg-surface-2 text-muted",
        "hover:text-ink hover:border-hairline-strong transition-colors cursor-pointer",
        className
      )}
    >
      <Sun size={16} className="dark:hidden" />
      <Moon size={16} className="hidden dark:block" />
    </button>
  );
};

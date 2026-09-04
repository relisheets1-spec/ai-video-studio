"use client";

import React from "react";
import Link from "next/link";
import { FilmStrip, ShieldCheck, SignOut, ArrowLeft } from "@phosphor-icons/react";
import { Badge, IconTile, ThemeToggle, cn } from "@/components/ui";

interface NavbarProps {
  user?: {
    userName: string;
    remaining: number;
    generationsLimit: number;
    status: string;
  } | null;
  onLogout?: () => void;
  /** admin — шапка админ-панели: бейдж, ссылка назад в студию и свои действия. */
  variant?: "studio" | "admin";
  /** Кнопки, специфичные для страницы (обновить, создать код…). */
  actions?: React.ReactNode;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onLogout,
  variant = "studio",
  actions,
}) => {
  const isAdmin = variant === "admin";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-hairline bg-bg/85 backdrop-blur-xl">
      <div className="max-w-shell mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 min-w-0 group">
          <IconTile size="md" className="transition-transform group-hover:scale-105">
            <FilmStrip size={20} weight="fill" />
          </IconTile>
          <div className="flex flex-col min-w-0 leading-none">
            <span className="text-[15px] font-semibold tracking-tight text-ink">
              AI Studio
            </span>
          </div>
          {isAdmin && (
            <Badge tone="outline" className="ml-1 hidden sm:inline-flex">
              Админ
            </Badge>
          )}
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          {actions}

          {!isAdmin && user && user.status === "approved" && (
            <>
              <span
                className={cn(
                  "hidden md:inline-flex items-center gap-2 h-9 px-3.5 rounded-full",
                  "border border-hairline bg-surface-2 text-[13px]"
                )}
                title="Осталось генераций"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="font-semibold text-ink tabular">{user.remaining}</span>
                <span className="text-muted">видео</span>
              </span>
              <span className="hidden lg:inline text-[13px] font-medium text-muted px-1 max-w-[160px] truncate">
                {user.userName}
              </span>
            </>
          )}

          <ThemeToggle />

          {isAdmin ? (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-hairline bg-surface-2 text-[13px] font-medium text-muted hover:text-ink hover:border-hairline-strong transition-colors"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">В студию</span>
            </Link>
          ) : (
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-hairline bg-surface-2 text-[13px] font-medium text-muted hover:text-ink hover:border-hairline-strong transition-colors"
            >
              <ShieldCheck size={16} />
              <span className="hidden sm:inline">Панель</span>
            </Link>
          )}

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title="Выйти"
              aria-label="Выйти"
              className="grid place-items-center w-9 h-9 rounded-full border border-hairline bg-surface-2 text-muted hover:text-danger-text hover:border-hairline-strong transition-colors cursor-pointer"
            >
              <SignOut size={16} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

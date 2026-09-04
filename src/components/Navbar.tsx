"use client";

import React from "react";
import Link from "next/link";
import { LogOut, Film } from "lucide-react";

interface NavbarProps {
  user?: {
    userName: string;
    remaining: number;
    generationsLimit: number;
    status: string;
  } | null;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, onLogout }) => {
  return (
    <header className="w-full border-b border-white/[0.08] bg-[#090a0c] sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 text-white font-medium text-sm tracking-tight">
            <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-white/10 flex items-center justify-center text-white">
              <Film className="w-3.5 h-3.5" />
            </div>
            <span>AI Studio</span>
          </Link>
          <span className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-white/5">
            1080p Full HD · 45 FPS
          </span>
        </div>

        {/* Right Navigation */}
        <div className="flex items-center gap-4 text-xs">
          {user && user.status === "approved" ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 border border-white/10 text-zinc-300">
                <span className="text-[11px] text-zinc-400">Генераций:</span>
                <span className="text-white font-mono font-medium">{user.remaining}</span>
              </div>

              <span className="text-zinc-300 font-medium hidden sm:inline">
                {user.userName}
              </span>

              {onLogout && (
                <button
                  onClick={onLogout}
                  title="Выйти из аккаунта"
                  className="text-zinc-400 hover:text-white transition-colors p-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : null}

          <Link
            href="/admin"
            className="text-xs text-zinc-400 hover:text-white px-2.5 py-1 rounded-md hover:bg-zinc-900 transition-colors border border-transparent hover:border-white/10"
          >
            Админ-панель
          </Link>
        </div>
      </div>
    </header>
  );
};

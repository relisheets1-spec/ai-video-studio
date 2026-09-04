"use client";

import React from "react";
import Link from "next/link";
import { Film, Shield, LogOut, Sparkles } from "lucide-react";

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
    <header className="w-full border-b border-white/[0.08] bg-[#0c0d12]/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-15 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group select-none py-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Film className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm tracking-tight text-white">
              AI Video Studio
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 border border-white/10">
              1080p @ 45fps
            </span>
          </div>
        </Link>

        {/* Right Info & Actions */}
        <div className="flex items-center gap-3 text-xs">
          {user && user.status === "approved" && (
            <div className="flex items-center gap-3">
              {/* Balance chip */}
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-200">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span>
                  Баланс: <strong className="text-white">{user.remaining}</strong> из {user.generationsLimit}
                </span>
              </div>

              {/* User Name */}
              <span className="text-zinc-400 hidden sm:inline">
                {user.userName}
              </span>

              {onLogout && (
                <button
                  onClick={onLogout}
                  title="Выйти"
                  className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          <Link
            href="/admin"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white text-xs transition-colors border border-transparent hover:border-white/10"
          >
            <Shield className="w-3 h-3 text-zinc-400" />
            <span>Админ</span>
          </Link>
        </div>
      </div>
    </header>
  );
};

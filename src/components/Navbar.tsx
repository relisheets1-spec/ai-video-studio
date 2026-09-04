"use client";

import React from "react";
import Link from "next/link";
import { LogOut, Film, Shield, Sparkles } from "lucide-react";

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
    <header className="w-full border-b border-white/[0.1] bg-[#0c0d12]/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 h-18 py-3 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3.5">
          <Link href="/" className="flex items-center gap-3 text-white font-bold text-lg sm:text-xl tracking-tight group">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30 group-hover:scale-105 transition-transform">
              <Film className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="leading-none text-white font-extrabold tracking-tight">AI STUDIO</span>
              <span className="text-[11px] text-zinc-400 font-normal tracking-wide mt-1">Video Story Generator</span>
            </div>
          </Link>

          <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold ml-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span>1080p Full HD · 45 FPS</span>
          </span>
        </div>

        {/* Right Navigation */}
        <div className="flex items-center gap-4">
          {user && user.status === "approved" ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-zinc-900 border border-white/10 text-sm shadow-sm">
                <span className="text-zinc-400 font-medium">Баланс:</span>
                <span className="text-blue-400 font-mono font-bold text-base">{user.remaining}</span>
                <span className="text-zinc-500 text-xs">ген.</span>
              </div>

              <span className="text-white font-semibold text-sm hidden sm:inline px-1">
                {user.userName}
              </span>

              {onLogout && (
                <button
                  onClick={onLogout}
                  title="Выйти из аккаунта"
                  className="text-zinc-400 hover:text-red-400 hover:bg-zinc-800/80 transition-all p-2 rounded-lg"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : null}

          <Link
            href="/admin"
            className="flex items-center gap-1.5 text-sm font-semibold text-zinc-300 hover:text-white px-3.5 py-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 transition-colors border border-white/10"
          >
            <Shield className="w-4 h-4 text-blue-400" />
            <span>Админ</span>
          </Link>
        </div>
      </div>
    </header>
  );
};

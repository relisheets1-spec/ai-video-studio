"use client";

import React from "react";
import Link from "next/link";
import { Video, Shield, LogOut, Sparkles, Film } from "lucide-react";

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
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#090b12]/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 p-[1px] shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/40 transition-all">
            <div className="w-full h-full bg-[#0d101d] rounded-[11px] flex items-center justify-center">
              <Film className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
              AI Video Studio
              <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                8-10 Min
              </span>
            </span>
            <span className="text-xs text-slate-400">Генератор длинных видео</span>
          </div>
        </Link>

        {/* User Info & Actions */}
        <div className="flex items-center gap-3 sm:gap-4">
          {user && user.status === "approved" && (
            <div className="flex items-center gap-3">
              {/* Quota Badge */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-xs text-indigo-200">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                <span>
                  Генераций:{" "}
                  <strong className="text-white font-semibold">{user.remaining}</strong> / {user.generationsLimit}
                </span>
              </div>

              {/* User Name */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 ring-4 ring-emerald-500/20" />
                <span>{user.userName}</span>
              </div>

              {/* Logout */}
              {onLogout && (
                <button
                  onClick={onLogout}
                  title="Выйти"
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Admin link */}
          <Link
            href="/admin"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-xs text-slate-300 hover:text-white transition-colors"
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Админ</span>
          </Link>
        </div>
      </div>
    </header>
  );
};

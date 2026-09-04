"use client";

import React from "react";
import Link from "next/link";
import { Shield, LogOut, Sparkles, Video, User } from "lucide-react";

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
    <header className="sticky top-0 z-50 w-full bg-[#141218]/95 backdrop-blur-md border-b border-[#49454F]/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* M3 App Title */}
        <Link href="/" className="flex items-center gap-3 select-none">
          <div className="w-10 h-10 rounded-full bg-[#4F378B] text-[#D0BCFF] flex items-center justify-center">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-base text-[#E6E0E9] tracking-tight">
                AI Video Studio
              </span>
              <span className="text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full bg-[#2B2930] text-[#D0BCFF] border border-[#49454F]/40">
                M3 • 1080p
              </span>
            </div>
            <p className="text-[11px] text-[#938F99] leading-none mt-0.5">Видеоистории 8–10 минут</p>
          </div>
        </Link>

        {/* User Info & Actions */}
        <div className="flex items-center gap-3">
          {user && user.status === "approved" && (
            <div className="flex items-center gap-2 sm:gap-3">
              {/* M3 Quota Chip */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#2B2930] border border-[#49454F]/40 text-xs text-[#E6E0E9]">
                <Sparkles className="w-3.5 h-3.5 text-[#D0BCFF]" />
                <span>
                  Генераций: <strong className="text-[#D0BCFF] font-semibold">{user.remaining}</strong> / {user.generationsLimit}
                </span>
              </div>

              {/* User Name Chip */}
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#211F26] border border-[#49454F]/30 text-xs text-[#CCC2DC]">
                <User className="w-3.5 h-3.5 text-[#938F99]" />
                <span>{user.userName}</span>
              </div>

              {/* Logout Button */}
              {onLogout && (
                <button
                  onClick={onLogout}
                  title="Выйти"
                  className="p-2 rounded-full hover:bg-[#2B2930] text-[#938F99] hover:text-[#E6E0E9] transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Admin link */}
          <Link
            href="/admin"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#211F26] hover:bg-[#2B2930] border border-[#49454F]/40 text-xs font-medium text-[#CAC4D0] hover:text-white transition-colors"
          >
            <Shield className="w-3.5 h-3.5 text-[#D0BCFF]" />
            <span className="hidden sm:inline">Админ-панель</span>
          </Link>
        </div>
      </div>
    </header>
  );
};

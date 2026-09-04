"use client";

import React from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";

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
    <header className="w-full border-b border-white/5 bg-[#09090b]">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold text-sm tracking-tight text-white">
          AI Studio
        </Link>

        <div className="flex items-center gap-3 text-xs">
          {user && user.status === "approved" && (
            <div className="flex items-center gap-3">
              <span className="text-zinc-400">
                Осталось: <strong className="text-white font-medium">{user.remaining}</strong>
              </span>

              {onLogout && (
                <button
                  onClick={onLogout}
                  title="Выйти"
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          <Link
            href="/admin"
            className="text-zinc-500 hover:text-zinc-300 transition-colors text-xs"
          >
            Админ
          </Link>
        </div>
      </div>
    </header>
  );
};

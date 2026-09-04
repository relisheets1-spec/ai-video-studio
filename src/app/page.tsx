"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { AuthGate } from "@/components/AuthGate";
import { VideoStudio } from "@/components/VideoStudio";
import { Film, Mic, ShieldCheck, Download } from "lucide-react";

export default function HomePage() {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ai_video_user");
      if (saved) {
        const parsed = JSON.parse(saved);
        setUser(parsed);
        fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check", secretCode: parsed.secretCode }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data?.user) {
              setUser(data.user);
              localStorage.setItem("ai_video_user", JSON.stringify(data.user));
            }
          })
          .catch((e) => console.log("Session verify error:", e));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("ai_video_user");
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#141218]">
        <div className="w-8 h-8 rounded-full border-2 border-[#D0BCFF] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#141218] text-[#E6E0E9]">
      <Navbar user={user} onLogout={handleLogout} />

      <main className="flex-1">
        {user && user.status === "approved" ? (
          <VideoStudio
            user={user}
            onUserUpdate={(updated) => {
              setUser(updated);
              localStorage.setItem("ai_video_user", JSON.stringify(updated));
            }}
          />
        ) : (
          <div className="space-y-10 py-10">
            {/* Material 3 Hero Section */}
            <div className="max-w-3xl mx-auto text-center px-4 space-y-3">
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#2B2930] border border-[#49454F]/40 text-[#D0BCFF] text-xs font-medium">
                <span>Material 3 • Full HD 1080p @ 40 FPS</span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-bold text-[#E6E0E9] tracking-tight">
                Генератор видеоисторий 8–10 минут
              </h1>

              <p className="text-xs sm:text-sm text-[#938F99] max-w-xl mx-auto leading-relaxed">
                Введите сюжет от 2 до 10 предложений. ИИ создаст 30–35 связанных кадров, натуральную озвучку на русском или казахском языке и синхронные субтитры.
              </p>
            </div>

            {/* Login / Auth Card */}
            <AuthGate
              onSuccess={(u) => {
                setUser(u);
              }}
            />

            {/* Material 3 Feature Cards */}
            <div className="max-w-5xl mx-auto px-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-6">
              <div className="p-4 bg-[#1D1B20] rounded-3xl border border-[#49454F]/30 space-y-1.5">
                <Film className="w-5 h-5 text-[#D0BCFF]" />
                <h3 className="font-semibold text-xs text-[#E6E0E9]">30–35 кадров</h3>
                <p className="text-[11px] text-[#938F99] leading-snug">
                  Полноценные 8–10 минутные истории с плавной анимацией.
                </p>
              </div>

              <div className="p-4 bg-[#1D1B20] rounded-3xl border border-[#49454F]/30 space-y-1.5">
                <Mic className="w-5 h-5 text-[#D0BCFF]" />
                <h3 className="font-semibold text-xs text-[#E6E0E9]">Голоса (RU & KZ)</h3>
                <p className="text-[11px] text-[#938F99] leading-snug">
                  Примеры озвучки на русском и казахском по 15 секунд.
                </p>
              </div>

              <div className="p-4 bg-[#1D1B20] rounded-3xl border border-[#49454F]/30 space-y-1.5">
                <ShieldCheck className="w-5 h-5 text-[#D0BCFF]" />
                <h3 className="font-semibold text-xs text-[#E6E0E9]">Доступ и квота</h3>
                <p className="text-[11px] text-[#938F99] leading-snug">
                  Вход по кодам с одобрением админа. 10 генераций на балансе.
                </p>
              </div>

              <div className="p-4 bg-[#1D1B20] rounded-3xl border border-[#49454F]/30 space-y-1.5">
                <Download className="w-5 h-5 text-[#D0BCFF]" />
                <h3 className="font-semibold text-xs text-[#E6E0E9]">1080p @ 40 FPS</h3>
                <p className="text-[11px] text-[#938F99] leading-snug">
                  Скачивание в Full HD с полной поддержкой перемотки по таймлайну.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#49454F]/20 py-5 mt-10 bg-[#141218]">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-[#938F99] flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>AI Video Studio • Google Material M3 Design</span>
          <span>OpenAI GPT-4o, TTS & DALL-E 3 • Supabase & Vercel</span>
        </div>
      </footer>
    </div>
  );
}

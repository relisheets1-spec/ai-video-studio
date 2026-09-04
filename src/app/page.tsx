"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { AuthGate } from "@/components/AuthGate";
import { VideoStudio } from "@/components/VideoStudio";
import { Sparkles, Film, Wand2, ShieldCheck, Download, Users } from "lucide-react";

export default function HomePage() {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Check existing session
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ai_video_user");
      if (saved) {
        const parsed = JSON.parse(saved);
        setUser(parsed);
        // Verify with backend
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
      <div className="min-h-screen flex items-center justify-center bg-[#08090d]">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-between">
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
          <div className="space-y-12 py-10">
            {/* Hero Header */}
            <div className="max-w-4xl mx-auto text-center px-4 space-y-4">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Платформа генерации длинных видеороликов (8–10 минут)</span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
                Создавайте полноценные{" "}
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
                  8–10 минутные видео
                </span>{" "}
                силой искусственного интеллекта
              </h1>

              <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
                Сценарий от GPT-4o, натуральная озвучка через OpenAI TTS, визуализация DALL-E 3 и кинематографичный рендер с субтитрами.
              </p>
            </div>

            {/* Login / Auth Gate */}
            <AuthGate
              onSuccess={(u) => {
                setUser(u);
              }}
            />

            {/* Features showcase */}
            <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-8">
              <div className="p-5 glass-panel rounded-2xl border border-white/5 space-y-2">
                <Film className="w-6 h-6 text-indigo-400" />
                <h3 className="font-semibold text-sm text-white">Хронометраж 8–10 минут</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Полноценные видеоролики из 16–22 сцен с глубоким повествованием.
                </p>
              </div>

              <div className="p-5 glass-panel rounded-2xl border border-white/5 space-y-2">
                <Wand2 className="w-6 h-6 text-purple-400" />
                <h3 className="font-semibold text-sm text-white">OpenAI TTS & DALL-E 3</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Чистый дикторский звук и широкоформатные кинематографичные кадры 16:9.
                </p>
              </div>

              <div className="p-5 glass-panel rounded-2xl border border-white/5 space-y-2">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
                <h3 className="font-semibold text-sm text-white">Контроль и квоты</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Вход по кодам с подтверждением администратора. 10 генераций на пользователя.
                </p>
              </div>

              <div className="p-5 glass-panel rounded-2xl border border-white/5 space-y-2">
                <Download className="w-6 h-6 text-pink-400" />
                <h3 className="font-semibold text-sm text-white">Экспорт WebM / MP4</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Мгновенный просмотр в браузере, скачивание и поддержка локального Docker.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-6 mt-12 bg-black/40">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>© 2026 AI Video Studio. Работает на OpenAI GPT-4o, TTS & DALL-E 3.</span>
          <span>База данных: Supabase | Хостинг: Vercel</span>
        </div>
      </footer>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { Lock, ArrowRight, AlertCircle, ShieldAlert, KeyRound, Loader2 } from "lucide-react";

interface AuthGateProps {
  onSuccess: (user: any) => void;
  title?: string;
  description?: string;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  onSuccess,
  title = "Вход в AI Video Studio",
  description = "Введите пароль доступа для генерации 1080p видеоисторий с озвучкой ElevenLabs.",
}) => {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number>(10);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);

  useEffect(() => {
    // Check initial status and attempt counter for this IP
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const res = await fetch("/api/auth");
      const data = await res.json();
      if (res.ok) {
        setAttemptsLeft(data.attemptsLeft ?? 10);
        setIsBlocked(data.isBlocked ?? false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isBlocked) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAttemptsLeft(data.attemptsLeft ?? 0);
        setIsBlocked(data.isBlocked ?? false);
        throw new Error(data.error || "Неверный пароль");
      }

      if (data.success) {
        localStorage.setItem("ai_video_auth_token", data.token);
        localStorage.setItem("ai_video_user", JSON.stringify(data.user));
        onSuccess(data.user);
      }
    } catch (err: any) {
      setError(err.message || "Ошибка авторизации");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto my-auto py-12 px-4 select-none">
      <div className="bg-[#13151c] rounded-3xl p-8 sm:p-9 border border-white/[0.12] shadow-2xl space-y-7 relative overflow-hidden">
        {/* Top ambient accent glow */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="space-y-3 relative z-10 text-center flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-600/15 border border-blue-500/30 text-blue-400 flex items-center justify-center shadow-lg shadow-blue-600/20 mb-2">
            <Lock className="w-7 h-7" />
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {title}
          </h1>

          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-sm">
            {description}
          </p>
        </div>

        {/* Blocked state alert */}
        {isBlocked ? (
          <div className="p-5 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-sm space-y-2 relative z-10 shadow-lg">
            <div className="flex items-center gap-2 font-bold text-rose-400 text-base">
              <ShieldAlert className="w-5 h-5" />
              <span>Доступ временно заблокирован</span>
            </div>
            <p className="text-xs sm:text-sm leading-relaxed text-rose-300">
              Превышен лимит (10 неверных попыток за сутки). В целях защиты от подбора пароля ваш IP заблокирован на 24 часа.
            </p>
          </div>
        ) : (
          <>
            {error && (
              <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-3 relative z-10 animate-shake">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-zinc-200 block">
                    Пароль доступа
                  </label>
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                      attemptsLeft <= 3
                        ? "bg-rose-950 text-rose-400 border border-rose-500/30"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    Попыток: {attemptsLeft}/10
                  </span>
                </div>

                <div className="relative">
                  <input
                    type="password"
                    required
                    disabled={loading || checkingStatus}
                    placeholder="Введите пароль..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-zinc-900 border border-white/15 text-white placeholder-zinc-500 text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono"
                  />
                  <KeyRound className="w-5 h-5 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || checkingStatus || !password.trim()}
                className="w-full py-4 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-extrabold text-base shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center gap-2.5 disabled:opacity-40 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Проверка пароля...</span>
                  </>
                ) : (
                  <>
                    <span>Войти</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>

              <div className="p-3 rounded-xl bg-zinc-900/80 border border-white/5 text-center">
                <p className="text-[11px] text-zinc-500">
                  Защита базы данных: 10 попыток в сутки, далее блокировка на 24 часа.
                </p>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};


"use client";

import React, { useState } from "react";
import { ArrowRight, AlertCircle, Clock, Sparkles, CheckCircle2 } from "lucide-react";

interface AuthGateProps {
  onSuccess: (user: any) => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ onSuccess }) => {
  const [userName, setUserName] = useState("");
  const [secretCode, setSecretCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<any | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !secretCode.trim()) {
      setError("Пожалуйста, укажите имя и секретный код");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          userName: userName.trim(),
          secretCode: secretCode.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка авторизации");

      if (data.user.status === "approved") {
        localStorage.setItem("ai_video_user", JSON.stringify(data.user));
        onSuccess(data.user);
      } else if (data.user.status === "pending") {
        setPendingUser(data.user);
      } else if (data.user.status === "rejected") {
        setError("Доступ отклонен администратором.");
      }
    } catch (err: any) {
      setError(err.message || "Не удалось связаться с сервером");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!pendingUser) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check",
          secretCode: pendingUser.secretCode,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.user.status === "approved") {
        localStorage.setItem("ai_video_user", JSON.stringify(data.user));
        onSuccess(data.user);
      } else if (data.user.status === "pending") {
        setError("Заявка пока находится на рассмотрении у администратора.");
      } else {
        setError("Статус заявки: " + data.user.status);
      }
    } catch (err: any) {
      setError(err.message || "Ошибка проверки");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto my-auto py-10 px-4">
      <div className="bg-[#13151c] rounded-2xl p-8 sm:p-10 border border-white/[0.12] shadow-2xl space-y-7 relative overflow-hidden">
        {/* Ambient top accent light */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="space-y-3 relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-bold tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Video Studio · Full HD</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Вход в Студию
          </h1>

          <p className="text-sm sm:text-base text-zinc-300 leading-relaxed">
            Генерация 8–10 минутных видеоисторий (30–35 Full HD кадров @ 45 FPS) с синтезом голоса OpenAI и синхронными субтитрами.
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {pendingUser ? (
          <div className="space-y-5 relative z-10">
            <div className="p-5 rounded-xl bg-zinc-900/95 border border-amber-500/30 space-y-3 text-sm">
              <div className="flex items-center gap-2.5 text-amber-400 font-bold text-base">
                <Clock className="w-5 h-5 animate-pulse" />
                <span>Заявка ожидает одобрения администратора</span>
              </div>
              <div className="text-zinc-300 space-y-1.5 pt-1 text-sm">
                <div>Пользователь: <span className="text-white font-bold">{pendingUser.userName}</span></div>
                <div>Секретный код: <code className="text-blue-400 font-mono font-bold bg-blue-950/60 px-2 py-0.5 rounded">{pendingUser.secretCode}</code></div>
              </div>
              <p className="text-xs text-zinc-400 pt-1">
                Администратор может одобрить вашу заявку в панели управления, начислив 10 генераций.
              </p>
            </div>

            <button
              onClick={handleCheckStatus}
              disabled={loading}
              className="w-full py-4 rounded-xl bg-white hover:bg-zinc-200 text-black font-bold text-sm sm:text-base transition-all disabled:opacity-50 shadow-lg cursor-pointer"
            >
              {loading ? "Проверка статуса..." : "Проверить статус одобрения"}
            </button>

            <button
              onClick={() => setPendingUser(null)}
              className="w-full text-center text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Войти с другим кодом доступа
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-200 block">
                Ваше имя
              </label>
              <input
                type="text"
                required
                placeholder="Например: Иван"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl bg-zinc-900 border border-white/15 text-white placeholder-zinc-500 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-zinc-200 block">
                  Секретный код доступа
                </label>
                <button
                  type="button"
                  onClick={() => setSecretCode("VIP-STUDIO-2026")}
                  className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-4"
                >
                  Вставить VIP-STUDIO-2026
                </button>
              </div>

              <input
                type="text"
                required
                placeholder="VIP-STUDIO-2026"
                value={secretCode}
                onChange={(e) => setSecretCode(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl bg-zinc-900 border border-white/15 text-white placeholder-zinc-500 font-mono text-base tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-4 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-bold text-base shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer"
            >
              <span>{loading ? "Авторизация..." : "Войти в Студию"}</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            <p className="text-xs text-zinc-400 text-center pt-2 leading-relaxed">
              Если у вас новый код, заявка мгновенно уйдет в админ-панель для одобрения на 10 генераций.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

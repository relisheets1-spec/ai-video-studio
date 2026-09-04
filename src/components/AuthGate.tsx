"use client";

import React, { useState } from "react";
import { ArrowRight, AlertCircle, Clock } from "lucide-react";

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
      setError("Укажите имя и секретный код");
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
        setError("Доступ отклонен администратором");
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
        setError("Заявка еще находится на рассмотрении");
      } else {
        setError("Статус: " + data.user.status);
      }
    } catch (err: any) {
      setError(err.message || "Ошибка проверки");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto my-auto py-12">
      <div className="bg-[#121316] rounded-xl p-8 border border-white/[0.08] shadow-2xl space-y-6">
        {/* Header */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium tracking-wider uppercase text-zinc-400">
              Авторизация
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-white/5">
              1080p · 45 FPS
            </span>
          </div>

          <h2 className="text-xl font-semibold text-white tracking-tight">
            Вход в Студию
          </h2>

          <p className="text-xs text-zinc-400">
            Генерация 8–10 минутных историй из 30–35 кадров с озвучкой OpenAI и синхронными субтитрами.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {pendingUser ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-zinc-900 border border-white/10 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-zinc-200 font-medium">
                <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
                <span>Заявка ожидает одобрения</span>
              </div>
              <div className="text-zinc-400 space-y-1 pt-1">
                <div>Пользователь: <span className="text-white">{pendingUser.userName}</span></div>
                <div>Код: <code className="text-zinc-200 font-mono">{pendingUser.secretCode}</code></div>
              </div>
              <p className="text-[11px] text-zinc-500 pt-1">
                Администратор может подтвердить заявку в панели управления.
              </p>
            </div>

            <button
              onClick={handleCheckStatus}
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-white text-black font-medium text-xs hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {loading ? "Проверка..." : "Проверить одобрение"}
            </button>

            <button
              onClick={() => setPendingUser(null)}
              className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Войти с другим кодом
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-300 font-medium">
                Ваше имя
              </label>
              <input
                type="text"
                required
                placeholder="Иван"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-white placeholder-zinc-500 text-xs focus:outline-none focus:border-zinc-400 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-300 font-medium">
                  Секретный код
                </label>
                <button
                  type="button"
                  onClick={() => setSecretCode("VIP-STUDIO-2026")}
                  className="text-[11px] text-zinc-400 hover:text-white transition-colors underline underline-offset-2"
                >
                  Вставить VIP-STUDIO-2026
                </button>
              </div>

              <input
                type="text"
                required
                placeholder="Код доступа"
                value={secretCode}
                onChange={(e) => setSecretCode(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-white placeholder-zinc-500 font-mono text-xs focus:outline-none focus:border-zinc-400 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 rounded-lg bg-white text-black font-medium text-xs hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{loading ? "Авторизация..." : "Войти"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <p className="text-[11px] text-zinc-500 text-center pt-1">
              Если у вас новый код, заявка автоматически отправится администратору на подтверждение (10 генераций).
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

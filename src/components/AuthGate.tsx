"use client";

import React, { useState } from "react";
import { Film, ArrowRight, Clock, AlertCircle, Sparkles, Check } from "lucide-react";

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
      setError("Заполните имя и секретный код");
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
        setError("Заявка пока на рассмотрении у администратора.");
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
    <div className="w-full max-w-md mx-auto my-auto py-8">
      <div className="bg-[#11131a] rounded-2xl p-7 border border-white/[0.08] shadow-2xl space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium">
            <Sparkles className="w-3 h-3 text-indigo-400" />
            <span>Студия видеоисторий 8–10 минут</span>
          </div>

          <h2 className="text-xl font-bold text-white tracking-tight">
            Вход в систему
          </h2>

          <p className="text-xs text-zinc-400 leading-relaxed">
            Создание 30–35 связанных Full HD кадров с озвучкой OpenAI TTS (RU/KZ) и синхронными субтитрами.
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {pendingUser ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-zinc-900/90 border border-white/10 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-amber-400 font-medium">
                <Clock className="w-4 h-4 animate-pulse" />
                <span>Заявка ожидает одобрения администратора</span>
              </div>
              <div className="text-zinc-300 space-y-0.5 pt-1">
                <div>Пользователь: <span className="text-white font-medium">{pendingUser.userName}</span></div>
                <div>Код: <code className="text-indigo-300 font-mono">{pendingUser.secretCode}</code></div>
              </div>
              <p className="text-[11px] text-zinc-500 pt-1">
                После одобрения в панели управления вам станет доступно 10 генераций.
              </p>
            </div>

            <button
              onClick={handleCheckStatus}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors disabled:opacity-40"
            >
              {loading ? "Проверка..." : "Проверить статус одобрения"}
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
              <label className="text-xs font-medium text-zinc-300">
                Ваше Имя
              </label>
              <input
                type="text"
                required
                placeholder="Например: Артем"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white placeholder-zinc-500 text-xs focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-300">
                  Секретный код доступа
                </label>
                <button
                  type="button"
                  onClick={() => setSecretCode("VIP-STUDIO-2026")}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Вставить тестовый код
                </button>
              </div>

              <input
                type="text"
                required
                placeholder="Введите код (например: VIP-STUDIO-2026)"
                value={secretCode}
                onChange={(e) => setSecretCode(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white placeholder-zinc-500 font-mono text-xs focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <span>{loading ? "Авторизация..." : "Войти в Студию"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

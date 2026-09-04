"use client";

import React, { useState } from "react";
import { KeyRound, User, Sparkles, Clock, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";

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
      setError("Заполните ваше имя и секретный код");
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
      if (!res.ok) {
        throw new Error(data.error || "Ошибка авторизации");
      }

      if (data.user.status === "approved") {
        localStorage.setItem("ai_video_user", JSON.stringify(data.user));
        onSuccess(data.user);
      } else if (data.user.status === "pending") {
        setPendingUser(data.user);
      } else if (data.user.status === "rejected") {
        setError("Ваш доступ был отклонен администратором.");
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
        setError("Заявка всё ещё на рассмотрении у администратора.");
      } else {
        setError("Статус доступа: " + data.user.status);
      }
    } catch (err: any) {
      setError(err.message || "Ошибка проверки");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md w-full mx-auto px-4 py-12">
      <div className="glass-panel-glow rounded-2xl p-8 relative overflow-hidden border border-indigo-500/20 shadow-2xl">
        {/* Glow accent */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center mb-8 relative">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mx-auto mb-4 text-indigo-400">
            <KeyRound className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Вход в AI Video Studio</h2>
          <p className="text-sm text-slate-400 mt-2">
            Введите ваше имя и секретный код для доступа к генерации 8–10 минутных видео
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {pendingUser ? (
          <div className="space-y-6 text-center">
            <div className="p-5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-left">
              <div className="flex items-center gap-3 text-amber-300 font-semibold mb-2">
                <Clock className="w-5 h-5 animate-pulse" />
                <span>Заявка ожидает одобрения</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Пользователь: <strong className="text-white">{pendingUser.userName}</strong>
                <br />
                Код: <code className="text-amber-300 font-mono text-xs">{pendingUser.secretCode}</code>
              </p>
              <div className="mt-3 pt-3 border-t border-amber-500/20 text-xs text-slate-400">
                Администратор должен подтвердить ваш доступ в панели управления. После подтверждения вам будет начислено <strong>10 генераций</strong>.
              </div>
            </div>

            <button
              onClick={handleCheckStatus}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? "Проверка..." : "Проверить статус одобрения"}</span>
            </button>

            <button
              onClick={() => setPendingUser(null)}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Войти с другим кодом
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Ваше Имя / Псевдоним
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Например: Артем"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Секретный код доступа
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Введите код (любой или от админа)"
                  value={secretCode}
                  onChange={(e) => setSecretCode(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono transition-all"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Если у вас нет кода, введите любой секретный пароль — он отправится админу на одобрение.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 disabled:opacity-50 group"
            >
              <span>{loading ? "Вход..." : "Войти в Студию"}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

"use client";

import React, { useState } from "react";

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
    if (!userName.trim() || !secretCode.trim()) return;

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
      setError(err.message || "Ошибка подключения");
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
        setError("Заявка еще не одобрена админом.");
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
    <div className="w-full max-w-sm mx-auto">
      <div className="bg-[#111113] rounded-2xl p-7 border border-white/10 space-y-5">
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold text-white tracking-tight">AI Studio</h2>
          <p className="text-xs text-zinc-500">Авторизация по коду доступа</p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs text-center">
            {error}
          </div>
        )}

        {pendingUser ? (
          <div className="space-y-4 text-center">
            <div className="p-3.5 rounded-xl bg-zinc-900 border border-white/10 text-left text-xs space-y-1">
              <div className="text-zinc-400">Пользователь: <span className="text-white font-medium">{pendingUser.userName}</span></div>
              <div className="text-zinc-400">Код: <span className="text-white font-mono">{pendingUser.secretCode}</span></div>
              <div className="text-amber-400 pt-1 text-[11px]">Ожидает подтверждения администратором</div>
            </div>

            <button
              onClick={handleCheckStatus}
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-white text-black font-medium text-xs hover:bg-zinc-200 transition-colors disabled:opacity-40"
            >
              {loading ? "Проверка..." : "Проверить статус"}
            </button>

            <button
              onClick={() => setPendingUser(null)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Сменить код
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Имя</label>
              <input
                type="text"
                required
                placeholder="Ваше имя"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white placeholder-zinc-600 text-xs focus:outline-none focus:border-white transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Код доступа</label>
              <input
                type="text"
                required
                placeholder="Секретный код"
                value={secretCode}
                onChange={(e) => setSecretCode(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white placeholder-zinc-600 font-mono text-xs focus:outline-none focus:border-white transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 rounded-xl bg-white text-black font-medium text-xs hover:bg-zinc-200 transition-colors disabled:opacity-40"
            >
              {loading ? "Вход..." : "Войти"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

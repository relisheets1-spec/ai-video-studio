"use client";

import React, { useState } from "react";
import { KeyRound, User, Clock, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";

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
      setError("Укажите ваше имя и секретный код");
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
        setError("Заявка пока ожидает одобрения администратором.");
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
    <div className="max-w-md w-full mx-auto px-4 py-8">
      {/* Material 3 Elevated Card */}
      <div className="bg-[#1D1B20] rounded-3xl p-7 sm:p-8 border border-[#49454F]/30 shadow-xl">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-[#4F378B] text-[#D0BCFF] flex items-center justify-center mx-auto mb-4 shadow-sm">
            <KeyRound className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-[#E6E0E9] tracking-tight">Вход в Студию</h2>
          <p className="text-xs text-[#938F99] mt-1.5 leading-relaxed">
            Введите имя и секретный код для доступа к генерации 8–10 минутных видеороликов
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-[#8C1D18]/30 border border-[#F2B8B5]/30 text-[#F2B8B5] text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {pendingUser ? (
          <div className="space-y-6 text-center">
            <div className="p-4 rounded-2xl bg-[#2B2930] border border-[#49454F]/40 text-left space-y-2">
              <div className="flex items-center gap-2 text-[#D0BCFF] font-medium text-xs">
                <Clock className="w-4 h-4" />
                <span>Заявка ожидает одобрения</span>
              </div>
              <p className="text-xs text-[#CAC4D0] leading-relaxed">
                Пользователь: <strong className="text-[#E6E0E9]">{pendingUser.userName}</strong>
                <br />
                Код: <code className="text-[#D0BCFF] font-mono text-xs">{pendingUser.secretCode}</code>
              </p>
              <p className="text-[11px] text-[#938F99] pt-1">
                Администратор одобрит ваш доступ в панели <code className="text-[#D0BCFF]">/admin</code>, после чего вам будет начислено 10 генераций.
              </p>
            </div>

            <button
              onClick={handleCheckStatus}
              disabled={loading}
              className="w-full py-3 px-5 rounded-full bg-[#D0BCFF] text-[#381E72] font-semibold text-xs shadow-md hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? "Проверка..." : "Проверить статус одобрения"}</span>
            </button>

            <button
              onClick={() => setPendingUser(null)}
              className="text-xs text-[#938F99] hover:text-[#E6E0E9] transition-colors"
            >
              Войти с другим кодом
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* M3 Filled Text Field 1 */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#CAC4D0]">
                Ваше Имя
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#938F99]">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Например: Артем"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#2B2930] border border-[#49454F]/40 text-[#E6E0E9] placeholder-[#938F99] text-xs focus:outline-none focus:border-[#D0BCFF] focus:ring-1 focus:ring-[#D0BCFF] transition-all"
                />
              </div>
            </div>

            {/* M3 Filled Text Field 2 */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#CAC4D0]">
                Секретный код доступа
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#938F99]">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Введите код (например: VIP-STUDIO-2026)"
                  value={secretCode}
                  onChange={(e) => setSecretCode(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#2B2930] border border-[#49454F]/40 text-[#E6E0E9] placeholder-[#938F99] font-mono text-xs focus:outline-none focus:border-[#D0BCFF] focus:ring-1 focus:ring-[#D0BCFF] transition-all"
                />
              </div>
              <p className="text-[11px] text-[#938F99]">
                Если у вас нет кода, введите любой пароль — заявка уйдет админу на одобрение.
              </p>
            </div>

            {/* M3 Filled Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-3 py-3.5 px-6 rounded-full bg-[#D0BCFF] text-[#381E72] font-semibold text-xs shadow-md hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{loading ? "Вход..." : "Войти в Студию"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

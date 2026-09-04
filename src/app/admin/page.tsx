"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Shield,
  Key,
  UserCheck,
  UserX,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  RefreshCw,
  Copy,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  Film
} from "lucide-react";
import { AccessCode } from "@/lib/types";

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [users, setUsers] = useState<AccessCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New code modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newCustomCode, setNewCustomCode] = useState("");
  const [newLimit, setNewLimit] = useState(10);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Check saved admin key
  useEffect(() => {
    const saved = localStorage.getItem("ai_video_admin_key");
    if (saved) {
      setAdminKey(saved);
      loadUsers(saved);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminKey.trim()) return;
    loadUsers(adminKey.trim());
  };

  const loadUsers = async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        headers: { "x-admin-key": key },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Неверный ключ администратора");

      setUsers(data.users || []);
      setIsAuthenticated(true);
      localStorage.setItem("ai_video_admin_key", key);
    } catch (err: any) {
      setError(err.message || "Ошибка авторизации");
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: string, userId: string, amount?: number) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ action, userId, amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Refresh list
      loadUsers(adminKey);
    } catch (err: any) {
      alert("Ошибка: " + err.message);
    }
  };

  const handleCreateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({
          userName: newUserName,
          customCode: newCustomCode,
          limit: newLimit,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setShowCreateModal(false);
      setNewUserName("");
      setNewCustomCode("");
      loadUsers(adminKey);
    } catch (err: any) {
      alert("Ошибка создания: " + err.message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Stats calculation
  const totalCount = users.length;
  const pendingCount = users.filter((u) => u.status === "pending").length;
  const approvedCount = users.filter((u) => u.status === "approved").length;
  const totalGenerationsUsed = users.reduce((acc, u) => acc + (u.generations_used || 0), 0);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#08090d]">
        <div className="glass-panel-glow max-w-md w-full rounded-2xl p-8 border border-white/10 shadow-2xl relative">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Вернуться на главную</span>
          </Link>

          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-3 text-amber-400">
              <Shield className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Панель администратора</h2>
            <p className="text-xs text-slate-400 mt-1">
              Введите мастер-ключ для управления доступом и генерациями
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Мастер-ключ администратора
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Key className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  placeholder="Введите ADMIN_SECRET_KEY"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-medium text-sm transition-all shadow-lg shadow-amber-600/25 disabled:opacity-50"
            >
              {loading ? "Вход..." : "Войти в панель управления"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08090d] text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0d101a] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>В Студию</span>
            </Link>
            <div className="h-4 w-[1px] bg-white/10" />
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-400" />
              <h1 className="font-bold text-sm sm:text-base text-white">Админ-панель управления</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadUsers(adminKey)}
              disabled={loading}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
              title="Обновить список"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/25 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Создать инвайт-код</span>
            </button>

            <button
              onClick={() => {
                localStorage.removeItem("ai_video_admin_key");
                setIsAuthenticated(false);
              }}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 transition-colors"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 flex-1">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-5 glass-panel rounded-2xl border border-white/10">
            <span className="text-xs text-slate-400 block">Всего пользователей</span>
            <span className="text-2xl font-bold text-white mt-1 block">{totalCount}</span>
          </div>

          <div className="p-5 glass-panel rounded-2xl border border-amber-500/20 bg-amber-500/5">
            <span className="text-xs text-amber-300 block flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 animate-pulse" />
              Ожидают одобрения
            </span>
            <span className="text-2xl font-bold text-amber-400 mt-1 block">{pendingCount}</span>
          </div>

          <div className="p-5 glass-panel rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
            <span className="text-xs text-emerald-300 block">Одобрено пользователей</span>
            <span className="text-2xl font-bold text-emerald-400 mt-1 block">{approvedCount}</span>
          </div>

          <div className="p-5 glass-panel rounded-2xl border border-indigo-500/20 bg-indigo-500/5">
            <span className="text-xs text-indigo-300 block">Сгенерировано видео</span>
            <span className="text-2xl font-bold text-indigo-400 mt-1 block">{totalGenerationsUsed}</span>
          </div>
        </div>

        {/* Users / Codes Table */}
        <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-xl">
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <h2 className="font-semibold text-base text-white">Список пользователей и инвайт-кодов</h2>
            <span className="text-xs text-slate-400">Нажмите на код, чтобы скопировать</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/5 text-slate-400 uppercase tracking-wider font-semibold border-b border-white/10">
                <tr>
                  <th className="py-3.5 px-4">Имя пользователя</th>
                  <th className="py-3.5 px-4">Секретный код</th>
                  <th className="py-3.5 px-4">Статус</th>
                  <th className="py-3.5 px-4">Квота генераций</th>
                  <th className="py-3.5 px-4">Дата запроса</th>
                  <th className="py-3.5 px-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      Пока нет зарегистрированных пользователей. Создайте инвайт-код или отправьте ссылку клиентам.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 px-4 font-medium text-white">{u.user_name}</td>
                      <td className="py-4 px-4">
                        <button
                          onClick={() => copyToClipboard(u.secret_code)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 font-mono text-indigo-300 border border-white/10 transition-colors"
                        >
                          <span>{u.secret_code}</span>
                          <Copy className="w-3 h-3 text-slate-400" />
                          {copiedCode === u.secret_code && (
                            <span className="text-[10px] text-emerald-400 font-sans">Скопировано!</span>
                          )}
                        </button>
                      </td>
                      <td className="py-4 px-4">
                        {u.status === "approved" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            Одобрен
                          </span>
                        )}
                        {u.status === "pending" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse">
                            <Clock className="w-3 h-3" />
                            Ожидает
                          </span>
                        )}
                        {u.status === "rejected" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                            Отклонен
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 font-mono">
                        <span className="text-white font-semibold">
                          {u.generations_limit - u.generations_used}
                        </span>{" "}
                        / {u.generations_limit}
                      </td>
                      <td className="py-4 px-4 text-slate-400">
                        {new Date(u.created_at).toLocaleString("ru-RU")}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {u.status === "pending" && (
                            <button
                              onClick={() => handleAction("approve", u.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
                            >
                              Одобрить (10 ген.)
                            </button>
                          )}

                          {u.status === "approved" && (
                            <button
                              onClick={() => handleAction("add_generations", u.id, 10)}
                              className="px-2 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/30 transition-colors"
                              title="Добавить +10 генераций"
                            >
                              +10 ген.
                            </button>
                          )}

                          {u.status === "pending" && (
                            <button
                              onClick={() => handleAction("reject", u.id)}
                              className="p-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/20 transition-colors"
                              title="Отклонить"
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => {
                              if (confirm(`Удалить доступ для ${u.user_name}?`)) {
                                handleAction("delete", u.id);
                              }
                            }}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors"
                            title="Удалить запись"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Create Code Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="glass-panel-glow max-w-md w-full rounded-2xl p-6 border border-white/10 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Создать новый инвайт-код</h3>
            <form onSubmit={handleCreateCode} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Имя пользователя (опционально)</label>
                <input
                  type="text"
                  placeholder="Например: Иван (Клиент)"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Свой секретный код (или оставьте пустым для автогенерации)
                </label>
                <input
                  type="text"
                  placeholder="Например: VIP-MARKET-2026"
                  value={newCustomCode}
                  onChange={(e) => setNewCustomCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Лимит генераций</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={newLimit}
                  onChange={(e) => setNewLimit(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-medium transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-md shadow-indigo-600/30 transition-colors"
                >
                  Создать код
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

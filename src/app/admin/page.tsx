"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Shield,
  Key,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  RefreshCw,
  Copy,
  ArrowLeft,
  AlertCircle,
  X
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

  const totalCount = users.length;
  const pendingCount = users.filter((u) => u.status === "pending").length;
  const approvedCount = users.filter((u) => u.status === "approved").length;
  const totalGenerationsUsed = users.reduce((acc, u) => acc + (u.generations_used || 0), 0);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#090a0c] text-white">
        <div className="bg-[#121316] max-w-sm w-full rounded-xl p-8 border border-white/[0.08] shadow-2xl space-y-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Вернуться в Студию</span>
          </Link>

          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold text-white tracking-tight">Панель администратора</h2>
            <p className="text-xs text-zinc-400">
              Введите ключ ADMIN_SECRET_KEY для управления пользователями и генерациями.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">
                Мастер-ключ
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                  <Key className="w-3.5 h-3.5" />
                </div>
                <input
                  type="password"
                  required
                  placeholder="admin_master_secret_2026"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-white placeholder-zinc-500 text-xs font-mono focus:outline-none focus:border-zinc-400 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-white text-black font-medium text-xs hover:bg-zinc-200 transition-all disabled:opacity-50"
            >
              {loading ? "Авторизация..." : "Войти в панель"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090a0c] text-white flex flex-col">
      {/* Top Header */}
      <header className="border-b border-white/[0.08] bg-[#0c0d10] sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>В Студию</span>
            </Link>
            <div className="h-4 w-[1px] bg-white/10" />
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-zinc-300" />
              <h1 className="font-medium text-xs text-white">Управление доступом</h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => loadUsers(adminKey)}
              disabled={loading}
              className="p-1.5 rounded-md hover:bg-zinc-900 text-zinc-400 hover:text-white transition-colors border border-transparent hover:border-white/10"
              title="Обновить список"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black text-xs font-medium hover:bg-zinc-200 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Создать инвайт-код</span>
            </button>

            <button
              onClick={() => {
                localStorage.removeItem("ai_video_admin_key");
                setIsAuthenticated(false);
              }}
              className="text-xs text-zinc-400 hover:text-white px-2.5 py-1.5 rounded-md hover:bg-zinc-900 transition-colors"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6 flex-1 w-full">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 bg-[#121316] rounded-xl border border-white/[0.08]">
            <span className="text-[11px] text-zinc-400 block">Всего аккаунтов</span>
            <span className="text-xl font-semibold text-white mt-1 block font-mono">{totalCount}</span>
          </div>

          <div className="p-4 bg-[#121316] rounded-xl border border-white/[0.08]">
            <span className="text-[11px] text-zinc-400 block flex items-center gap-1.5">
              {pendingCount > 0 && <Clock className="w-3 h-3 text-amber-400 animate-pulse" />}
              <span>Ожидают одобрения</span>
            </span>
            <span className={`text-xl font-semibold mt-1 block font-mono ${pendingCount > 0 ? "text-amber-400" : "text-white"}`}>
              {pendingCount}
            </span>
          </div>

          <div className="p-4 bg-[#121316] rounded-xl border border-white/[0.08]">
            <span className="text-[11px] text-zinc-400 block">Одобрено пользователей</span>
            <span className="text-xl font-semibold text-white mt-1 block font-mono">{approvedCount}</span>
          </div>

          <div className="p-4 bg-[#121316] rounded-xl border border-white/[0.08]">
            <span className="text-[11px] text-zinc-400 block">Сгенерировано историй</span>
            <span className="text-xl font-semibold text-white mt-1 block font-mono">{totalGenerationsUsed}</span>
          </div>
        </div>

        {/* Users Table Card */}
        <div className="bg-[#121316] rounded-xl border border-white/[0.08] overflow-hidden shadow-lg">
          <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
            <h2 className="font-medium text-xs text-white">Список пользователей и инвайт-кодов</h2>
            <span className="text-[11px] text-zinc-500">Кликните по коду для копирования</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0c0d10] text-zinc-400 uppercase tracking-wider text-[10px] font-medium border-b border-white/[0.08]">
                <tr>
                  <th className="py-3 px-4">Имя</th>
                  <th className="py-3 px-4">Код доступа</th>
                  <th className="py-3 px-4">Статус</th>
                  <th className="py-3 px-4">Остаток генераций</th>
                  <th className="py-3 px-4">Дата создания</th>
                  <th className="py-3 px-4 text-right">Управление</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-zinc-500">
                      Нет пользователей. Нажмите «Создать инвайт-код» выше.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-zinc-900/50 transition-colors">
                      <td className="py-3 px-4 font-medium text-white">{u.user_name}</td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => copyToClipboard(u.secret_code)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 font-mono text-zinc-200 border border-white/10 transition-colors text-[11px]"
                        >
                          <span>{u.secret_code}</span>
                          <Copy className="w-3 h-3 text-zinc-400" />
                          {copiedCode === u.secret_code && (
                            <span className="text-[10px] text-emerald-400 font-sans">Скопировано</span>
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        {u.status === "approved" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px]">
                            <CheckCircle2 className="w-3 h-3" />
                            Одобрен
                          </span>
                        )}
                        {u.status === "pending" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[11px]">
                            <Clock className="w-3 h-3" />
                            Ожидает
                          </span>
                        )}
                        {u.status === "rejected" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 text-[11px]">
                            Отклонен
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <span className="text-white font-medium">
                          {u.generations_limit - u.generations_used}
                        </span>{" "}
                        <span className="text-zinc-500">/ {u.generations_limit}</span>
                      </td>
                      <td className="py-3 px-4 text-zinc-400 font-mono text-[11px]">
                        {new Date(u.created_at).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {u.status === "pending" && (
                            <button
                              onClick={() => handleAction("approve", u.id)}
                              className="px-2.5 py-1 rounded bg-white text-black font-medium text-xs hover:bg-zinc-200 transition-all"
                            >
                              Одобрить (10 ген)
                            </button>
                          )}

                          {u.status === "approved" && (
                            <button
                              onClick={() => handleAction("add_generations", u.id, 10)}
                              className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/5 transition-colors text-xs"
                              title="Добавить +10 генераций"
                            >
                              +10 ген
                            </button>
                          )}

                          {u.status === "pending" && (
                            <button
                              onClick={() => handleAction("reject", u.id)}
                              className="px-2 py-1 rounded bg-zinc-900 hover:bg-red-950 text-zinc-400 hover:text-red-300 transition-colors text-xs"
                              title="Отклонить"
                            >
                              Отклонить
                            </button>
                          )}

                          <button
                            onClick={() => {
                              if (confirm(`Удалить доступ для ${u.user_name}?`)) {
                                handleAction("delete", u.id);
                              }
                            }}
                            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition-colors"
                            title="Удалить"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#121316] max-w-sm w-full rounded-xl p-6 border border-white/[0.08] shadow-2xl space-y-4 relative">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Создать инвайт-код</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCode} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="block text-zinc-300 font-medium">Имя пользователя</label>
                <input
                  type="text"
                  placeholder="Клиент"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-zinc-300 font-medium">
                  Секретный код (или оставьте пустым)
                </label>
                <input
                  type="text"
                  placeholder="VIP-CLIENT-2026"
                  value={newCustomCode}
                  onChange={(e) => setNewCustomCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-zinc-300 font-medium">Лимит генераций</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={newLimit}
                  onChange={(e) => setNewLimit(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-white focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2 rounded-lg bg-zinc-800 text-zinc-300 font-medium transition-colors hover:bg-zinc-700"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-white text-black font-medium hover:bg-zinc-200 transition-all"
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

"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Shield,
  Key,
  UserX,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  RefreshCw,
  Copy,
  ArrowLeft,
  AlertCircle
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
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#141218]">
        <div className="bg-[#1D1B20] max-w-md w-full rounded-3xl p-8 border border-[#49454F]/40 shadow-2xl relative">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-[#938F99] hover:text-[#E6E0E9] mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Вернуться на главную</span>
          </Link>

          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-full bg-[#4F378B] text-[#D0BCFF] flex items-center justify-center mx-auto mb-3">
              <Shield className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-[#E6E0E9] tracking-tight">Панель администратора</h2>
            <p className="text-xs text-[#938F99] mt-1">
              Введите мастер-ключ для управления доступом и генерациями
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-2xl bg-[#8C1D18]/30 border border-[#F2B8B5]/30 text-[#F2B8B5] text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#CAC4D0]">
                Мастер-ключ администратора
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#938F99]">
                  <Key className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  placeholder="Введите ADMIN_SECRET_KEY"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#2B2930] border border-[#49454F]/40 text-[#E6E0E9] placeholder-[#938F99] text-xs font-mono focus:outline-none focus:border-[#D0BCFF] focus:ring-1 focus:ring-[#D0BCFF] transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-full bg-[#D0BCFF] text-[#381E72] font-semibold text-xs shadow-md hover:opacity-90 transition-all disabled:opacity-50"
            >
              {loading ? "Вход..." : "Войти в панель управления"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#141218] text-[#E6E0E9] flex flex-col">
      {/* Top App Bar */}
      <header className="border-b border-[#49454F]/30 bg-[#1D1B20] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs text-[#938F99] hover:text-[#E6E0E9] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>В Студию</span>
            </Link>
            <div className="h-4 w-[1px] bg-[#49454F]/40" />
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#D0BCFF]" />
              <h1 className="font-semibold text-sm text-[#E6E0E9]">Управление доступом (M3)</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadUsers(adminKey)}
              disabled={loading}
              className="p-2 rounded-full hover:bg-[#2B2930] text-[#938F99] hover:text-[#E6E0E9] transition-colors"
              title="Обновить"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#D0BCFF] text-[#381E72] text-xs font-semibold shadow-sm hover:opacity-90 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Создать инвайт-код</span>
            </button>

            <button
              onClick={() => {
                localStorage.removeItem("ai_video_admin_key");
                setIsAuthenticated(false);
              }}
              className="text-xs text-[#938F99] hover:text-[#E6E0E9] px-2 py-1 transition-colors"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 flex-1">
        {/* M3 Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 bg-[#1D1B20] rounded-3xl border border-[#49454F]/30">
            <span className="text-[11px] text-[#938F99] block">Всего пользователей</span>
            <span className="text-xl font-bold text-[#E6E0E9] mt-0.5 block">{totalCount}</span>
          </div>

          <div className="p-4 bg-[#1D1B20] rounded-3xl border border-[#49454F]/30">
            <span className="text-[11px] text-[#D0BCFF] block flex items-center gap-1">
              <Clock className="w-3 h-3 animate-pulse" />
              Ожидают одобрения
            </span>
            <span className="text-xl font-bold text-[#D0BCFF] mt-0.5 block">{pendingCount}</span>
          </div>

          <div className="p-4 bg-[#1D1B20] rounded-3xl border border-[#49454F]/30">
            <span className="text-[11px] text-[#CCC2DC] block">Одобрено клиентов</span>
            <span className="text-xl font-bold text-[#E6E0E9] mt-0.5 block">{approvedCount}</span>
          </div>

          <div className="p-4 bg-[#1D1B20] rounded-3xl border border-[#49454F]/30">
            <span className="text-[11px] text-[#938F99] block">Сгенерировано видео</span>
            <span className="text-xl font-bold text-[#E6E0E9] mt-0.5 block">{totalGenerationsUsed}</span>
          </div>
        </div>

        {/* M3 Users Table Card */}
        <div className="bg-[#1D1B20] rounded-3xl border border-[#49454F]/30 overflow-hidden shadow-lg">
          <div className="p-5 border-b border-[#49454F]/20 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-[#E6E0E9]">Пользователи и инвайт-коды</h2>
            <span className="text-xs text-[#938F99]">Нажмите на код, чтобы скопировать</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#141218] text-[#938F99] uppercase tracking-wider font-semibold border-b border-[#49454F]/20">
                <tr>
                  <th className="py-3 px-4">Имя</th>
                  <th className="py-3 px-4">Секретный код</th>
                  <th className="py-3 px-4">Статус</th>
                  <th className="py-3 px-4">Баланс генераций</th>
                  <th className="py-3 px-4">Дата</th>
                  <th className="py-3 px-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#49454F]/20">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-[#938F99]">
                      Нет пользователей. Создайте инвайт-код выше.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-[#25232A] transition-colors">
                      <td className="py-3.5 px-4 font-medium text-[#E6E0E9]">{u.user_name}</td>
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => copyToClipboard(u.secret_code)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#2B2930] hover:bg-[#36343B] font-mono text-[#D0BCFF] border border-[#49454F]/40 transition-colors"
                        >
                          <span>{u.secret_code}</span>
                          <Copy className="w-3 h-3 text-[#938F99]" />
                          {copiedCode === u.secret_code && (
                            <span className="text-[10px] text-[#D0BCFF] font-sans">Скопировано</span>
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 px-4">
                        {u.status === "approved" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#4F378B]/40 text-[#D0BCFF] border border-[#D0BCFF]/30">
                            <CheckCircle2 className="w-3 h-3" />
                            Одобрен
                          </span>
                        )}
                        {u.status === "pending" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#2B2930] text-[#D0BCFF] border border-[#49454F]/50 animate-pulse">
                            <Clock className="w-3 h-3" />
                            Ожидает
                          </span>
                        )}
                        {u.status === "rejected" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#8C1D18]/40 text-[#F2B8B5]">
                            Отклонен
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <span className="text-[#D0BCFF] font-semibold">
                          {u.generations_limit - u.generations_used}
                        </span>{" "}
                        / {u.generations_limit}
                      </td>
                      <td className="py-3.5 px-4 text-[#938F99]">
                        {new Date(u.created_at).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {u.status === "pending" && (
                            <button
                              onClick={() => handleAction("approve", u.id)}
                              className="px-3 py-1 rounded-full bg-[#D0BCFF] text-[#381E72] font-semibold transition-all hover:opacity-90"
                            >
                              Одобрить (10)
                            </button>
                          )}

                          {u.status === "approved" && (
                            <button
                              onClick={() => handleAction("add_generations", u.id, 10)}
                              className="px-2.5 py-1 rounded-full bg-[#2B2930] hover:bg-[#36343B] text-[#D0BCFF] border border-[#49454F]/40 transition-colors"
                              title="Добавить +10 генераций"
                            >
                              +10 ген.
                            </button>
                          )}

                          {u.status === "pending" && (
                            <button
                              onClick={() => handleAction("reject", u.id)}
                              className="p-1.5 rounded-full hover:bg-[#8C1D18]/30 text-[#F2B8B5] transition-colors"
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
                            className="p-1.5 rounded-full hover:bg-[#2B2930] text-[#938F99] hover:text-[#F2B8B5] transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#211F26] max-w-md w-full rounded-3xl p-6 border border-[#49454F]/40 shadow-2xl">
            <h3 className="text-base font-bold text-[#E6E0E9] mb-4">Создать инвайт-код</h3>
            <form onSubmit={handleCreateCode} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="block text-[#CAC4D0] font-medium">Имя пользователя</label>
                <input
                  type="text"
                  placeholder="Например: Клиент 1"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-2xl bg-[#2B2930] border border-[#49454F]/40 text-[#E6E0E9] placeholder-[#938F99] focus:outline-none focus:border-[#D0BCFF]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[#CAC4D0] font-medium">
                  Секретный код (или оставьте пустым для автогенерации)
                </label>
                <input
                  type="text"
                  placeholder="Например: VIP-CLIENT-2026"
                  value={newCustomCode}
                  onChange={(e) => setNewCustomCode(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-2xl bg-[#2B2930] border border-[#49454F]/40 text-[#E6E0E9] placeholder-[#938F99] font-mono focus:outline-none focus:border-[#D0BCFF]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[#CAC4D0] font-medium">Лимит генераций</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={newLimit}
                  onChange={(e) => setNewLimit(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-2xl bg-[#2B2930] border border-[#49454F]/40 text-[#E6E0E9] focus:outline-none focus:border-[#D0BCFF]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded-full bg-[#2B2930] text-[#CAC4D0] font-medium transition-colors hover:bg-[#36343B]"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-full bg-[#D0BCFF] text-[#381E72] font-semibold shadow-sm hover:opacity-90 transition-all"
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

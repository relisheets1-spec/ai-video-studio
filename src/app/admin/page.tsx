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
  X,
  UserCheck
} from "lucide-react";
import { AccessCode } from "@/lib/types";

export default function AdminPage() {
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
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка загрузки пользователей");
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: string, userId: string, amount?: number) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, userId, amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      loadUsers();
    } catch (err: any) {
      alert("Ошибка: " + err.message);
    }
  };

  const handleCreateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      loadUsers();
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

  return (
    <div className="min-h-screen bg-[#090a0c] text-white flex flex-col">
      {/* Top Header */}
      <header className="border-b border-white/[0.1] bg-[#0c0d12]/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-18 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>В Студию</span>
            </Link>
            <div className="h-5 w-[1px] bg-white/15" />
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/30">
                <Shield className="w-4 h-4" />
              </div>
              <h1 className="font-extrabold text-base text-white">Админ-панель</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadUsers()}
              disabled={loading}
              className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-all border border-white/10"
              title="Обновить список"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Создать инвайт-код</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-8 flex-1 w-full">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-5 bg-[#13151c] rounded-2xl border border-white/[0.1] shadow-md">
            <span className="text-xs sm:text-sm font-medium text-zinc-400 block">Всего аккаунтов</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-white mt-1.5 block font-mono">{totalCount}</span>
          </div>

          <div className="p-5 bg-[#13151c] rounded-2xl border border-white/[0.1] shadow-md">
            <span className="text-xs sm:text-sm font-medium text-zinc-400 block flex items-center gap-2">
              {pendingCount > 0 && <Clock className="w-4 h-4 text-amber-400 animate-pulse" />}
              <span>Ожидают одобрения</span>
            </span>
            <span className={`text-2xl sm:text-3xl font-extrabold mt-1.5 block font-mono ${pendingCount > 0 ? "text-amber-400" : "text-white"}`}>
              {pendingCount}
            </span>
          </div>

          <div className="p-5 bg-[#13151c] rounded-2xl border border-white/[0.1] shadow-md">
            <span className="text-xs sm:text-sm font-medium text-zinc-400 block">Одобрено пользователей</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-blue-400 mt-1.5 block font-mono">{approvedCount}</span>
          </div>

          <div className="p-5 bg-[#13151c] rounded-2xl border border-white/[0.1] shadow-md">
            <span className="text-xs sm:text-sm font-medium text-zinc-400 block">Сгенерировано историй</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-white mt-1.5 block font-mono">{totalGenerationsUsed}</span>
          </div>
        </div>

        {/* Users Table Card */}
        <div className="bg-[#13151c] rounded-2xl border border-white/[0.1] overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-white/[0.1] flex items-center justify-between">
            <div>
              <h2 className="font-bold text-base sm:text-lg text-white">Список пользователей и инвайт-кодов</h2>
              <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">Кликните по коду для копирования в буфер обмена</p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-zinc-900 border border-white/10 text-zinc-300 font-mono">
              Всего: {users.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0c0d12] text-zinc-400 uppercase tracking-wider text-xs font-bold border-b border-white/[0.1]">
                <tr>
                  <th className="py-4 px-5">Имя пользователя</th>
                  <th className="py-4 px-5">Код доступа</th>
                  <th className="py-4 px-5">Статус</th>
                  <th className="py-4 px-5">Баланс генераций</th>
                  <th className="py-4 px-5">Дата регистрации</th>
                  <th className="py-4 px-5 text-right">Управление</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.08]">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-14 text-center text-zinc-400 text-base">
                      Нет пользователей. Нажмите «Создать инвайт-код» выше.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-zinc-900/60 transition-colors">
                      <td className="py-4 px-5 font-bold text-white text-base">{u.user_name}</td>
                      <td className="py-4 px-5">
                        <button
                          onClick={() => copyToClipboard(u.secret_code)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 font-mono text-blue-400 font-bold border border-white/15 transition-all text-xs sm:text-sm cursor-pointer shadow-sm"
                        >
                          <span>{u.secret_code}</span>
                          <Copy className="w-3.5 h-3.5 text-zinc-400" />
                          {copiedCode === u.secret_code && (
                            <span className="text-xs text-emerald-400 font-sans">Скопировано!</span>
                          )}
                        </button>
                      </td>
                      <td className="py-4 px-5">
                        {u.status === "approved" && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Одобрен
                          </span>
                        )}
                        {u.status === "pending" && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-bold animate-pulse">
                            <Clock className="w-3.5 h-3.5" />
                            Ожидает
                          </span>
                        )}
                        {u.status === "rejected" && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 text-xs font-bold">
                            Отклонен
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-5 font-mono">
                        <span className="text-white font-bold text-base">
                          {u.generations_limit - u.generations_used}
                        </span>{" "}
                        <span className="text-zinc-500 text-sm">/ {u.generations_limit}</span>
                      </td>
                      <td className="py-4 px-5 text-zinc-400 font-mono text-xs sm:text-sm">
                        {new Date(u.created_at).toLocaleDateString("ru-RU")}
                      </td>
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {u.status === "pending" && (
                            <button
                              onClick={() => handleAction("approve", u.id)}
                              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm transition-all shadow-md shadow-blue-600/30 cursor-pointer"
                            >
                              Одобрить (+10)
                            </button>
                          )}

                          {u.status === "approved" && (
                            <button
                              onClick={() => handleAction("add_generations", u.id, 10)}
                              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-white/10 transition-colors text-xs sm:text-sm font-semibold cursor-pointer"
                              title="Добавить +10 генераций"
                            >
                              +10 ген.
                            </button>
                          )}

                          {u.status === "pending" && (
                            <button
                              onClick={() => handleAction("reject", u.id)}
                              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-red-950 text-zinc-400 hover:text-red-300 transition-colors text-xs font-semibold cursor-pointer"
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
                            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                            title="Удалить аккаунт"
                          >
                            <Trash2 className="w-4 h-4" />
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
          <div className="bg-[#13151c] max-w-md w-full rounded-2xl p-7 border border-white/15 shadow-2xl space-y-5 relative">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Создать инвайт-код</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-400 hover:text-white p-1 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCode} className="space-y-4 text-sm">
              <div className="space-y-2">
                <label className="block text-zinc-200 font-semibold">Имя пользователя</label>
                <input
                  type="text"
                  required
                  placeholder="Например: Клиент 1"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-white/15 text-white placeholder-zinc-500 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-zinc-200 font-semibold">
                  Секретный код (или оставьте пустым для авто)
                </label>
                <input
                  type="text"
                  placeholder="VIP-CLIENT-2026"
                  value={newCustomCode}
                  onChange={(e) => setNewCustomCode(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-white/15 text-white placeholder-zinc-500 font-mono text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-zinc-200 font-semibold">Лимит генераций</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={newLimit}
                  onChange={(e) => setNewLimit(Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-white/15 text-white text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-3 rounded-xl bg-zinc-800 text-zinc-200 font-semibold transition-colors hover:bg-zinc-700 cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all shadow-lg shadow-blue-600/30 cursor-pointer"
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

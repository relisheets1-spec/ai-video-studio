"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Trash,
  CheckCircle,
  Clock,
  ArrowClockwise,
  Copy,
  Check,
  LockKey,
  Users,
  FilmSlate,
  Prohibit,
  XCircle,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { AccessCode } from "@/lib/types";
import { Navbar } from "@/components/Navbar";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  Field,
  IconButton,
  IconTile,
  Input,
  Modal,
  Spinner,
  StatTile,
  Tile,
  cn,
  useToast,
} from "@/components/ui";

type StatusFilter = "all" | AccessCode["status"];

const STATUS_META: Record<
  AccessCode["status"],
  { label: string; tone: "ok" | "warn" | "danger" | "neutral"; icon: React.ReactNode }
> = {
  approved: { label: "Одобрен", tone: "ok", icon: <CheckCircle size={14} weight="fill" /> },
  pending: { label: "Ожидает", tone: "warn", icon: <Clock size={14} weight="fill" /> },
  rejected: { label: "Отклонен", tone: "danger", icon: <XCircle size={14} weight="fill" /> },
  // Статус blocked существует в типе и в /api/auth, но бейджа для него не было —
  // такая строка рисовала пустую ячейку.
  blocked: { label: "Заблокирован", tone: "neutral", icon: <Prohibit size={14} weight="fill" /> },
};

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "approved", label: "Одобрен" },
  { id: "pending", label: "Ожидает" },
  { id: "rejected", label: "Отклонен" },
  { id: "blocked", label: "Заблокирован" },
];

export default function AdminPage() {
  const { notify } = useToast();

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [checkingAdminAuth, setCheckingAdminAuth] = useState(true);
  const [adminPassword, setAdminPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const [users, setUsers] = useState<AccessCode[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable balances map: { [userId]: number }
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [savingBalanceId, setSavingBalanceId] = useState<string | null>(null);
  const [savedBalanceId, setSavedBalanceId] = useState<string | null>(null);

  // Active user in studio (to highlight current user)
  const [activeUserCode, setActiveUserCode] = useState<string | null>(null);

  // New code modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newCustomCode, setNewCustomCode] = useState("");
  const [newLimit, setNewLimit] = useState(10);
  const [createLoading, setCreateLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Поиск, фильтр и подтверждение удаления
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [pendingDelete, setPendingDelete] = useState<AccessCode | null>(null);
  const [deleting, setDeleting] = useState(false);

  const getAdminHeaders = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("ai_video_admin_token") || "" : "";
    return {
      "Content-Type": "application/json",
      "x-admin-token": token,
    };
  };

  useEffect(() => {
    // Check dedicated admin token. NEVER use standard user token!
    const adminToken = localStorage.getItem("ai_video_admin_token");
    if (adminToken && adminToken.startsWith("ai_video_admin_session_")) {
      setIsAdminAuthenticated(true);
      loadUsers();
    }

    const storedUser = localStorage.getItem("ai_video_user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed.secretCode) setActiveUserCode(parsed.secretCode);
      } catch {}
    }

    setCheckingAdminAuth(false);
  }, []);

  const loadUsers = async () => {
    setLoadingUsers(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        headers: getAdminHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка загрузки пользователей");
      const userList: AccessCode[] = data.users || [];
      setUsers(userList);

      // Initialize editable balances
      const initial: Record<string, number> = {};
      userList.forEach((u) => {
        initial[u.id] = Math.max(0, u.generations_limit - u.generations_used);
      });
      setBalances(initial);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPassword.trim()) return;

    setLoginLoading(true);
    setLoginError(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Неверный пароль администратора");

      localStorage.setItem("ai_video_admin_token", data.adminToken);
      setIsAdminAuthenticated(true);
      setAdminPassword("");
      loadUsers();
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleAdminLogout = () => {
    localStorage.removeItem("ai_video_admin_token");
    setIsAdminAuthenticated(false);
    setUsers([]);
  };

  const handleAction = async (action: string, userId: string, amount?: number) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify({ action, userId, amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Refresh list
      loadUsers();
    } catch (err: any) {
      notify("Ошибка: " + err.message, "danger");
    }
  };

  const handleSaveBalance = async (userId: string, targetAmount: number) => {
    setSavingBalanceId(userId);
    try {
      const exactAmount = Math.max(0, Math.floor(targetAmount || 0));
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify({
          action: "set_balance",
          userId,
          amount: exactAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSavedBalanceId(userId);
      setTimeout(() => setSavedBalanceId(null), 2000);
      loadUsers();
    } catch (err: any) {
      notify("Ошибка сохранения баланса: " + err.message, "danger");
    } finally {
      setSavingBalanceId(null);
    }
  };

  const handleCreateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: getAdminHeaders(),
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
      notify("Инвайт-код создан");
      loadUsers();
    } catch (err: any) {
      notify("Ошибка создания: " + err.message, "danger");
    } finally {
      setCreateLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    await handleAction("delete", pendingDelete.id);
    setDeleting(false);
    setPendingDelete(null);
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

  const visibleUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      const matchesStatus = statusFilter === "all" || u.status === statusFilter;
      const matchesQuery =
        !q ||
        u.user_name?.toLowerCase().includes(q) ||
        u.secret_code?.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [users, query, statusFilter]);

  const formatDate = (iso?: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  /* ------------------------------ Загрузка ------------------------------ */

  if (checkingAdminAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={28} className="text-accent" />
      </div>
    );
  }

  /* -------------------------------- Вход -------------------------------- */

  if (!isAdminAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar variant="admin" />
        <main className="flex-1 flex items-center justify-center px-5 py-14">
          <div className="w-full max-w-[440px]">
            <Tile className="p-8 sm:p-9">
              <div className="flex flex-col items-center text-center gap-3 mb-7">
                <IconTile size="lg">
                  <LockKey size={24} weight="fill" />
                </IconTile>
                <h1 className="text-[26px] font-bold tracking-tight text-ink leading-tight">
                  Админ-панель
                </h1>
              </div>

              <form onSubmit={handleAdminLogin} className="flex flex-col gap-5">
                {loginError && <Alert tone="danger">{loginError}</Alert>}

                <Field label="Пароль">
                  <Input
                    type="password"
                    required
                    autoFocus
                    disabled={loginLoading}
                    placeholder="••••••"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="font-mono tracking-[0.3em]"
                  />
                </Field>

                <Button
                  type="submit"
                  size="lg"
                  block
                  loading={loginLoading}
                  disabled={!adminPassword.trim()}
                >
                  {loginLoading ? "Проверка..." : "Войти в панель"}
                </Button>
              </form>
            </Tile>
          </div>
        </main>
      </div>
    );
  }

  /* ------------------------------ Дашборд ------------------------------- */

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar
        variant="admin"
        onLogout={handleAdminLogout}
        actions={
          <IconButton
            variant="secondary"
            size="sm"
            title="Обновить данные"
            aria-label="Обновить данные"
            onClick={loadUsers}
            className="rounded-full"
          >
            <ArrowClockwise size={16} className={cn(loadingUsers && "animate-spin")} />
          </IconButton>
        }
      />

      <main className="flex-1 w-full max-w-shell mx-auto px-5 sm:px-8 pt-8 pb-14">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-7">
          <div className="min-w-0">
            <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight text-ink leading-none">
              Пользователи
            </h1>
          </div>

          <Button
            icon={<Plus size={18} />}
            onClick={() => setShowCreateModal(true)}
            className="shrink-0"
          >
            Создать код
          </Button>
        </div>

        {error && (
          <Alert tone="danger" className="mb-5">
            {error}
          </Alert>
        )}

        {/* Плитки статистики */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <StatTile
            label="Пользователей"
            value={totalCount}
            icon={<Users size={20} />}
          />
          <StatTile
            label="Одобрено"
            value={approvedCount}
            icon={<CheckCircle size={20} />}
          />
          <StatTile
            label="Ожидают"
            value={pendingCount}
            icon={<Clock size={20} />}
            tone={pendingCount > 0 ? "accent" : "surface"}
          />
          <StatTile
            label="Фильмов"
            value={totalGenerationsUsed}
            icon={<FilmSlate size={20} />}
            tone="contrast"
          />
        </div>

        {/* Таблица */}
        <Tile flush>
          <div className="flex flex-wrap items-center gap-3 p-5 border-b border-hairline">
            <div className="relative flex-1 min-w-[220px]">
              <MagnifyingGlass
                size={16}
                className="text-faint absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <Input
                type="search"
                placeholder="Поиск"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10 h-10"
              />
            </div>

            <div className="flex items-center gap-1 p-1 rounded-full bg-surface-2 border border-hairline overflow-x-auto">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={cn(
                    "h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap transition-colors cursor-pointer",
                    statusFilter === f.id
                      ? "bg-contrast text-contrast-ink"
                      : "text-muted hover:text-ink"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <span className="text-[12.5px] text-faint tabular ml-auto">
              {visibleUsers.length} из {totalCount}
            </span>
          </div>

          {/* На телефоне шесть колонок физически не помещаются; даём таблице
              честную минимальную ширину, чтобы она горизонтально прокручивалась,
              а не сминалась в нечитаемую кашу. */}
          <div className="overflow-x-auto -mx-px">
            <table className="w-full min-w-[760px] text-left border-collapse">
              <thead>
                <tr className="bg-surface-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
                  <th className="py-3 px-5 font-semibold">Пользователь</th>
                  <th className="py-3 px-4 font-semibold">Код доступа</th>
                  <th className="py-3 px-4 font-semibold">Статус</th>
                  <th className="py-3 px-4 font-semibold">Использовано</th>
                  <th className="py-3 px-4 font-semibold">Баланс</th>
                  <th className="py-3 px-5 font-semibold text-right">Действия</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-hairline">
                {visibleUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 px-5 text-center">
                      {loadingUsers ? (
                        <span className="inline-flex items-center gap-2 text-[13px] text-muted">
                          <Spinner size={16} />
                          Загрузка...
                        </span>
                      ) : (
                        <span className="text-[13px] text-muted">
                          {totalCount === 0 ? "Пользователей нет" : "Ничего не найдено"}
                        </span>
                      )}
                    </td>
                  </tr>
                ) : (
                  visibleUsers.map((u) => {
                    const meta = STATUS_META[u.status] ?? STATUS_META.pending;
                    const used = u.generations_used || 0;
                    const limit = u.generations_limit || 0;
                    const usedPct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
                    const isSelf = activeUserCode === u.secret_code;

                    return (
                      <tr key={u.id} className="hover:bg-surface-2/60 transition-colors">
                        <td className="py-3.5 px-5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[13.5px] font-medium text-ink truncate">
                              {u.user_name}
                            </span>
                            {isSelf && <Badge tone="accent">Вы</Badge>}
                          </div>
                          <div className="text-[12px] text-faint mt-0.5">
                            {formatDate(u.created_at)}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(u.secret_code)}
                            title="Скопировать код"
                            className="inline-flex items-center gap-2 h-8 px-2.5 rounded-control bg-surface-2 border border-hairline hover:border-hairline-strong transition-colors cursor-pointer max-w-[220px]"
                          >
                            <span className="font-mono text-[12.5px] text-ink truncate">
                              {u.secret_code}
                            </span>
                            {copiedCode === u.secret_code ? (
                              <Check size={14} className="text-accent shrink-0" />
                            ) : (
                              <Copy size={14} className="text-faint shrink-0" />
                            )}
                          </button>
                        </td>

                        <td className="py-3.5 px-4">
                          <Badge tone={meta.tone} icon={meta.icon}>
                            {meta.label}
                          </Badge>
                        </td>

                        <td className="py-3.5 px-4 min-w-[140px]">
                          <div className="text-[12.5px] text-muted tabular">
                            {used} / {limit}
                          </div>
                          <div className="h-1.5 w-full max-w-[120px] rounded-full bg-surface-3 overflow-hidden mt-1.5">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{ width: `${usedPct}%` }}
                            />
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              value={balances[u.id] ?? 0}
                              title="Введите число генераций и нажмите Сохранить или Enter"
                              onChange={(e) =>
                                setBalances((b) => ({
                                  ...b,
                                  [u.id]: Number(e.target.value),
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleSaveBalance(u.id, balances[u.id]);
                                }
                              }}
                              className="w-20 h-9 px-2.5 rounded-control bg-surface-2 border border-hairline text-ink text-[13px] font-mono tabular transition-colors hover:border-hairline-strong focus:outline-none focus:border-accent focus:bg-surface"
                            />
                            <Button
                              size="sm"
                              variant={savedBalanceId === u.id ? "primary" : "secondary"}
                              loading={savingBalanceId === u.id}
                              title="Сохранить точное число генераций в базе данных"
                              onClick={() => handleSaveBalance(u.id, balances[u.id])}
                            >
                              {savedBalanceId === u.id ? "Сохранено!" : "Сохранить"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Прибавить +10 к балансу"
                              onClick={() => handleAction("add_generations", u.id, 10)}
                            >
                              +10
                            </Button>
                          </div>
                        </td>

                        <td className="py-3.5 px-5">
                          <div className="flex items-center justify-end gap-1.5">
                            {u.status === "pending" && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => handleAction("approve", u.id)}
                                >
                                  Одобрить
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  title="Отклонить"
                                  onClick={() => handleAction("reject", u.id)}
                                >
                                  Отклонить
                                </Button>
                              </>
                            )}
                            <IconButton
                              size="sm"
                              variant="ghost"
                              title="Удалить аккаунт"
                              aria-label="Удалить аккаунт"
                              onClick={() => setPendingDelete(u)}
                              className="hover:text-danger-text"
                            >
                              <Trash size={16} />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Tile>
      </main>

      {/* Создание инвайт-кода */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Новый инвайт-код"
        icon={
          <IconTile size="md">
            <Plus size={20} weight="bold" />
          </IconTile>
        }
        footer={
          <>
            <Button
              variant="secondary"
              block
              onClick={() => setShowCreateModal(false)}
              disabled={createLoading}
            >
              Отмена
            </Button>
            <Button type="submit" form="create-code-form" block loading={createLoading}>
              {createLoading ? "Создание..." : "Создать код"}
            </Button>
          </>
        }
      >
        <form
          id="create-code-form"
          onSubmit={handleCreateCode}
          className="flex flex-col gap-4"
        >
          <Field label="Имя">
            <Input
              required
              autoFocus
              placeholder="Например: Клиент 1"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
            />
          </Field>

          <Field label="Код" hint="Пусто — сгенерируется автоматически">
            <Input
              placeholder="VIP-CLIENT-2026"
              value={newCustomCode}
              onChange={(e) => setNewCustomCode(e.target.value)}
              className="font-mono"
            />
          </Field>

          <Field label="Стартовый баланс">
            <Input
              type="number"
              min={1}
              max={500}
              value={newLimit}
              onChange={(e) => setNewLimit(Number(e.target.value))}
              className="font-mono tabular"
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Удалить аккаунт"
        description={
          pendingDelete ? `«${pendingDelete.user_name}» — удалить безвозвратно?` : undefined
        }
        confirmLabel="Удалить"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

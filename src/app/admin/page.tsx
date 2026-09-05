"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  Ticket,
  EnvelopeSimple,
  ShieldCheck,
  Key,
  UserPlus,
} from "@phosphor-icons/react";
import type { AccessCode, AccessStatus, AdminInfo } from "@/lib/types";
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
import {
  adminFetch,
  clearAdminToken,
  getAdminToken,
  setAdminToken,
  ADMIN_SESSION_LOST_EVENT,
} from "@/lib/client/admin-session";

type StatusFilter = "all" | AccessStatus;
type TabId = "users" | "logs" | "admins" | "settings";

const STATUS_META: Record<
  AccessStatus,
  { label: string; tone: "ok" | "warn" | "danger" | "neutral" | "outline"; icon: React.ReactNode }
> = {
  invited: { label: "Приглашение", tone: "outline", icon: <Ticket size={14} weight="fill" /> },
  pending: { label: "Ожидает", tone: "warn", icon: <Clock size={14} weight="fill" /> },
  approved: { label: "Одобрен", tone: "ok", icon: <CheckCircle size={14} weight="fill" /> },
  rejected: { label: "Отклонён", tone: "danger", icon: <XCircle size={14} weight="fill" /> },
  blocked: { label: "Заблокирован", tone: "neutral", icon: <Prohibit size={14} weight="fill" /> },
};

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "pending", label: "Ожидают" },
  { id: "approved", label: "Одобрены" },
  { id: "invited", label: "Приглашения" },
  { id: "rejected", label: "Отклонены" },
];

const STAGE_LABELS_UI: Record<string, string> = {
  llm: "Сценарий",
  tts: "Озвучка",
  image: "Картинки",
  render: "Рендер",
  auth: "Доступ",
};

/** Активная заморозка: дата окончания или null. Чистая функция, без БД. */
function frozenUntil(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) return null;
  return d;
}

function formatFreezeUntil(d: Date): string {
  return d.getUTCFullYear() >= 9999 ? "бессрочно" : d.toLocaleString("ru-RU");
}

export default function AdminPage() {
  const { notify } = useToast();

  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [passwordIsDefault, setPasswordIsDefault] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const [tab, setTab] = useState<TabId>("users");
  const [users, setUsers] = useState<AccessCode[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [balances, setBalances] = useState<Record<string, number>>({});
  const [savingBalanceId, setSavingBalanceId] = useState<string | null>(null);
  const [savedBalanceId, setSavedBalanceId] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCustomCode, setNewCustomCode] = useState("");
  const [newLimit, setNewLimit] = useState(10);
  const [createLoading, setCreateLoading] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [pendingDelete, setPendingDelete] = useState<AccessCode | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [freezeTarget, setFreezeTarget] = useState<AccessCode | null>(null);

  const [logs, setLogs] = useState<any[]>([]);
  const [logStage, setLogStage] = useState<string>("all");
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const [admins, setAdmins] = useState<AdminInfo[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [pendingRemoveAdmin, setPendingRemoveAdmin] = useState<AdminInfo | null>(null);

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNext, setPwNext] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  /* ------------------------------ Данные ------------------------------ */

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка загрузки пользователей");
      const list: AccessCode[] = data.users || [];
      setUsers(list);
      const initial: Record<string, number> = {};
      list.forEach((u) => {
        initial[u.id] = Math.max(0, u.generations_limit - u.generations_used);
      });
      setBalances(initial);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const loadAdmins = useCallback(async () => {
    setLoadingAdmins(true);
    try {
      const res = await adminFetch("/api/admin/admins");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка загрузки администраторов");
      setAdmins(data.admins || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingAdmins(false);
    }
  }, []);

  const loadLogs = async (stage: string = logStage) => {
    setLoadingLogs(true);
    try {
      const res = await adminFetch(`/api/admin/logs?stage=${encodeURIComponent(stage)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка загрузки логов");
      setLogs(data.logs || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingLogs(false);
    }
  };

  // Сессия подтверждается сервером, а не префиксом токена в localStorage.
  useEffect(() => {
    const verify = async () => {
      if (!getAdminToken()) {
        setCheckingAuth(false);
        return;
      }
      try {
        const res = await adminFetch("/api/admin/me");
        const data = await res.json();
        if (res.ok && data.admin) {
          setAdmin(data.admin);
          setPasswordIsDefault(!!data.passwordIsDefault);
          loadUsers();
          loadAdmins();
        }
      } catch {}
      setCheckingAuth(false);
    };
    verify();

    const onLost = (e: Event) => {
      setAdmin(null);
      setUsers([]);
      setLoginError((e as CustomEvent).detail?.error || "Сессия администратора истекла, войдите заново");
    };
    window.addEventListener(ADMIN_SESSION_LOST_EVENT, onLost);
    return () => window.removeEventListener(ADMIN_SESSION_LOST_EVENT, onLost);
  }, [loadUsers, loadAdmins]);

  /* ------------------------------ Действия ------------------------------ */

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) return;
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Неверная почта или пароль");
      setAdminToken(data.adminToken);
      setAdmin(data.admin);
      setPasswordIsDefault(!!data.passwordIsDefault);
      setLoginPassword("");
      loadUsers();
      loadAdmins();
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleAdminLogout = () => {
    clearAdminToken();
    setAdmin(null);
    setUsers([]);
    setAdmins([]);
  };

  const userAction = async (action: string, userId: string, extra: Record<string, unknown> = {}) => {
    try {
      const res = await adminFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ action, userId, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      loadUsers();
      return true;
    } catch (err: any) {
      notify("Ошибка: " + err.message, "danger");
      return false;
    }
  };

  const handleSaveBalance = async (userId: string, targetAmount: number) => {
    setSavingBalanceId(userId);
    const ok = await userAction("set_balance", userId, { amount: Math.max(0, Math.floor(targetAmount || 0)) });
    if (ok) {
      setSavedBalanceId(userId);
      setTimeout(() => setSavedBalanceId(null), 2000);
    }
    setSavingBalanceId(null);
  };

  const handleCreateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    try {
      const res = await adminFetch("/api/admin/codes", {
        method: "POST",
        body: JSON.stringify({ label: newLabel, customCode: newCustomCode, limit: newLimit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCreatedCode(data.code?.secret_code || null);
      setNewLabel("");
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
    await userAction("delete", pendingDelete.id);
    setDeleting(false);
    setPendingDelete(null);
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail.trim()) return;
    setAdminBusy(true);
    try {
      const res = await adminFetch("/api/admin/admins", {
        method: "POST",
        body: JSON.stringify({ email: newAdminEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось назначить администратора");
      setAdmins(data.admins || []);
      setNewAdminEmail("");
      notify("Администратор назначен");
    } catch (err: any) {
      notify("Ошибка: " + err.message, "danger");
    } finally {
      setAdminBusy(false);
    }
  };

  const confirmRemoveAdmin = async () => {
    if (!pendingRemoveAdmin) return;
    setAdminBusy(true);
    try {
      const res = await adminFetch(`/api/admin/admins?email=${encodeURIComponent(pendingRemoveAdmin.email)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось снять администратора");
      setAdmins(data.admins || []);
      notify("Администратор снят");
    } catch (err: any) {
      notify("Ошибка: " + err.message, "danger");
    } finally {
      setAdminBusy(false);
      setPendingRemoveAdmin(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (pwNext.length < 8) {
      setPwError("Новый пароль: минимум 8 символов");
      return;
    }
    if (pwNext !== pwConfirm) {
      setPwError("Пароли не совпадают");
      return;
    }
    setPwSaving(true);
    try {
      const res = await adminFetch("/api/admin/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNext }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось сменить пароль");
      notify(data.message || "Пароль изменён. Войдите заново.");
      handleAdminLogout();
      setLoginError("Пароль изменён — войдите с новым паролем");
    } catch (err: any) {
      setPwError(err.message);
    } finally {
      setPwSaving(false);
      setPwCurrent("");
      setPwNext("");
      setPwConfirm("");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  /* ------------------------------ Производные ------------------------------ */

  const invitedCount = users.filter((u) => u.status === "invited").length;
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
        u.secret_code?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [users, query, statusFilter]);

  const formatDate = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
  };

  /* ------------------------------ Загрузка ------------------------------ */

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={28} className="text-accent" />
      </div>
    );
  }

  /* -------------------------------- Вход -------------------------------- */

  if (!admin) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar variant="admin" />
        <main className="flex-1 flex items-center justify-center px-5 py-14">
          <div className="w-full max-w-[440px]">
            <Tile className="p-8 sm:p-9">
              <div className="flex flex-col items-center text-center gap-3 mb-7">
                <IconTile size="lg">
                  <ShieldCheck size={24} weight="fill" />
                </IconTile>
                <h1 className="text-[26px] font-bold tracking-tight text-ink leading-tight">Админ-панель</h1>
                <p className="text-[13.5px] text-muted leading-relaxed max-w-[320px]">
                  Вход только для назначенных администраторов: почта и пароль администратора.
                </p>
              </div>

              <form onSubmit={handleAdminLogin} className="flex flex-col gap-5">
                {loginError && <Alert tone="danger">{loginError}</Alert>}

                <Field label="Почта администратора">
                  <div className="relative">
                    <EnvelopeSimple size={18} className="text-faint absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <Input
                      type="email"
                      required
                      autoFocus
                      autoComplete="username"
                      disabled={loginLoading}
                      placeholder="admin@example.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-11"
                    />
                  </div>
                </Field>

                <Field label="Пароль">
                  <div className="relative">
                    <LockKey size={18} className="text-faint absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <Input
                      type="password"
                      required
                      autoComplete="current-password"
                      disabled={loginLoading}
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-11 font-mono tracking-[0.2em]"
                    />
                  </div>
                </Field>

                <Button type="submit" size="lg" block loading={loginLoading} disabled={!loginEmail.trim() || !loginPassword}>
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

  const tabs: { id: TabId; label: string }[] = [
    { id: "users", label: "Пользователи" },
    { id: "admins", label: "Администраторы" },
    { id: "logs", label: "Логи ошибок" },
    ...(admin.isPrimary ? [{ id: "settings" as TabId, label: "Настройки" }] : []),
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar
        variant="admin"
        identity={admin.email}
        onLogout={handleAdminLogout}
        actions={
          <IconButton
            variant="secondary"
            size="sm"
            title="Обновить данные"
            aria-label="Обновить данные"
            onClick={() => {
              loadUsers();
              loadAdmins();
            }}
            className="rounded-full"
          >
            <ArrowClockwise size={16} className={cn(loadingUsers && "animate-spin")} />
          </IconButton>
        }
      />

      <main className="flex-1 w-full max-w-shell mx-auto px-5 sm:px-8 pt-6 sm:pt-8 pb-14">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <h1 className="text-[26px] sm:text-[32px] font-bold tracking-tight text-ink leading-none">Панель управления</h1>
            <p className="text-[13px] text-muted mt-2">
              {admin.isPrimary ? "Основной администратор" : "Администратор"} · {admin.email}
            </p>
          </div>

          <Button
            icon={<Plus size={18} />}
            onClick={() => {
              setCreatedCode(null);
              setShowCreateModal(true);
            }}
            className="shrink-0"
          >
            Создать инвайт-код
          </Button>
        </div>

        {error && (
          <Alert tone="danger" className="mb-5">
            {error}
          </Alert>
        )}
        {passwordIsDefault && admin.isPrimary && (
          <Alert tone="warn" className="mb-5">
            Пароль администратора ещё стандартный. Смените его во вкладке «Настройки».
          </Alert>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
          <StatTile label="Одобрено" value={approvedCount} icon={<CheckCircle size={20} />} />
          <StatTile
            label="Ожидают"
            value={pendingCount}
            icon={<Clock size={20} />}
            tone={pendingCount > 0 ? "accent" : "surface"}
          />
          <StatTile label="Свободных кодов" value={invitedCount} icon={<Ticket size={20} />} />
          <StatTile label="Фильмов" value={totalGenerationsUsed} icon={<FilmSlate size={20} />} tone="contrast" />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-full bg-surface-2 border border-hairline w-fit max-w-full overflow-x-auto mb-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                if (t.id === "logs") loadLogs();
                if (t.id === "admins") loadAdmins();
              }}
              className={cn(
                "h-9 px-4 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors cursor-pointer",
                tab === t.id ? "bg-contrast text-contrast-ink" : "text-muted hover:text-ink"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ------------------------------ Логи ------------------------------ */}
        {tab === "logs" && (
          <Tile flush>
            <div className="flex flex-wrap items-center gap-3 p-5 border-b border-hairline">
              <div className="flex items-center gap-1 p-1 rounded-full bg-surface-2 border border-hairline overflow-x-auto">
                {[
                  { id: "all", label: "Все" },
                  { id: "llm", label: "Сценарий" },
                  { id: "tts", label: "Озвучка" },
                  { id: "image", label: "Картинки" },
                  { id: "render", label: "Рендер" },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setLogStage(f.id);
                      loadLogs(f.id);
                    }}
                    className={cn(
                      "h-8 px-3.5 rounded-full text-[12.5px] font-medium whitespace-nowrap transition-colors cursor-pointer",
                      logStage === f.id ? "bg-contrast text-contrast-ink" : "text-muted hover:text-ink"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <span className="text-[12.5px] text-faint tabular ml-auto">
                {loadingLogs ? "Загрузка…" : `${logs.length} записей`}
              </span>
            </div>

            <div className="divide-y divide-hairline">
              {logs.length === 0 && !loadingLogs && (
                <div className="p-8 text-center text-[13.5px] text-muted">Отказов не зафиксировано</div>
              )}
              {logs.map((log) => (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  className="w-full text-left p-4 sm:px-5 hover:bg-surface-2 transition-colors cursor-pointer block"
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Badge tone={log.stale ? "warn" : "danger"}>
                      {log.stale ? "зависла" : STAGE_LABELS_UI[log.stage as string] || "ошибка"}
                    </Badge>
                    <span className="text-[13.5px] font-medium text-ink truncate max-w-[420px]">{log.topic}</span>
                    <span className="text-[12px] text-faint tabular ml-auto whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("ru-RU")}
                    </span>
                  </div>
                  <div className={cn("text-[12.5px] text-muted mt-1.5 font-mono", expandedLog === log.id ? "" : "truncate")}>
                    {log.message}
                  </div>
                </button>
              ))}
            </div>
          </Tile>
        )}

        {/* --------------------------- Администраторы --------------------------- */}
        {tab === "admins" && (
          <div className="flex flex-col gap-5">
            {admin.isPrimary && (
              <Tile title="Назначить администратора" icon={<UserPlus size={20} />} hint="Новый админ входит по своей почте и общему паролю администратора.">
                <form onSubmit={handleAddAdmin} className="flex flex-col sm:flex-row gap-2.5">
                  <div className="relative flex-1">
                    <EnvelopeSimple size={18} className="text-faint absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <Input
                      type="email"
                      required
                      placeholder="email@example.com"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      className="pl-11"
                      disabled={adminBusy}
                    />
                  </div>
                  <Button type="submit" loading={adminBusy} disabled={!newAdminEmail.trim()} icon={<Plus size={16} />}>
                    Добавить
                  </Button>
                </form>
              </Tile>
            )}

            <Tile flush title="Администраторы" icon={<ShieldCheck size={20} />} action={<span className="text-[12px] text-faint tabular">{loadingAdmins ? "…" : admins.length}</span>}>
              <div className="divide-y divide-hairline">
                {admins.map((a) => (
                  <div key={a.email} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[13.5px] font-medium text-ink truncate">{a.email}</span>
                        {a.isPrimary && <Badge tone="accent">Основной</Badge>}
                        {a.email === admin.email && !a.isPrimary && <Badge tone="outline">Вы</Badge>}
                      </div>
                      {!a.isPrimary && (
                        <div className="text-[12px] text-faint mt-0.5">
                          назначен {a.appointedBy || "—"} · {formatDate(a.createdAt)}
                        </div>
                      )}
                    </div>
                    {admin.isPrimary && !a.isPrimary && (
                      <IconButton
                        size="sm"
                        variant="ghost"
                        title="Снять администратора"
                        aria-label="Снять администратора"
                        onClick={() => setPendingRemoveAdmin(a)}
                        className="hover:text-danger-text"
                      >
                        <Trash size={16} />
                      </IconButton>
                    )}
                  </div>
                ))}
              </div>
            </Tile>
          </div>
        )}

        {/* ------------------------------ Настройки ------------------------------ */}
        {tab === "settings" && admin.isPrimary && (
          <Tile title="Пароль администратора" icon={<LockKey size={20} />} hint="Один пароль на всех администраторов. После смены все админ-сессии завершатся." className="max-w-[520px]">
            <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
              {pwError && <Alert tone="danger">{pwError}</Alert>}
              <Field label="Текущий пароль">
                <Input type="password" required autoComplete="current-password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} />
              </Field>
              <Field label="Новый пароль" hint="Минимум 8 символов">
                <Input type="password" required autoComplete="new-password" value={pwNext} onChange={(e) => setPwNext(e.target.value)} />
              </Field>
              <Field label="Повторите новый пароль">
                <Input type="password" required autoComplete="new-password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} />
              </Field>
              <Button type="submit" loading={pwSaving} disabled={!pwCurrent || !pwNext || !pwConfirm}>
                Сменить пароль
              </Button>
            </form>
          </Tile>
        )}

        {/* ------------------------------ Пользователи ------------------------------ */}
        {tab === "users" && (
          <Tile flush>
            <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5 border-b border-hairline">
              <div className="relative flex-1 min-w-[200px]">
                <MagnifyingGlass size={16} className="text-faint absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input type="search" placeholder="Почта, имя или код" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10 h-10" />
              </div>

              <div className="flex items-center gap-1 p-1 rounded-full bg-surface-2 border border-hairline overflow-x-auto max-w-full">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatusFilter(f.id)}
                    className={cn(
                      "h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap transition-colors cursor-pointer",
                      statusFilter === f.id ? "bg-contrast text-contrast-ink" : "text-muted hover:text-ink"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <span className="text-[12.5px] text-faint tabular ml-auto">
                {visibleUsers.length} из {users.length}
              </span>
            </div>

            <div className="overflow-x-auto -mx-px">
              <table className="w-full min-w-[900px] text-left border-collapse">
                <thead>
                  <tr className="bg-surface-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
                    <th className="py-3 px-5 font-semibold">Пользователь</th>
                    <th className="py-3 px-4 font-semibold">Инвайт-код</th>
                    <th className="py-3 px-4 font-semibold">Статус</th>
                    <th className="py-3 px-4 font-semibold">Ключ</th>
                    <th className="py-3 px-4 font-semibold">Использовано</th>
                    <th className="py-3 px-4 font-semibold">Баланс</th>
                    <th className="py-3 px-5 font-semibold text-right">Действия</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-hairline">
                  {visibleUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-16 px-5 text-center">
                        {loadingUsers ? (
                          <span className="inline-flex items-center gap-2 text-[13px] text-muted">
                            <Spinner size={16} />
                            Загрузка...
                          </span>
                        ) : (
                          <span className="text-[13px] text-muted">{users.length === 0 ? "Пользователей нет" : "Ничего не найдено"}</span>
                        )}
                      </td>
                    </tr>
                  ) : (
                    visibleUsers.map((u) => {
                      const meta = STATUS_META[u.status] ?? STATUS_META.pending;
                      const used = u.generations_used || 0;
                      const limit = u.generations_limit || 0;
                      const usedPct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
                      const frozen = frozenUntil(u.frozen_until);
                      const claimed = u.status !== "invited";

                      return (
                        <tr key={u.id} className="hover:bg-surface-2/60 transition-colors">
                          <td className="py-3.5 px-5">
                            <div className="text-[13.5px] font-medium text-ink truncate max-w-[240px]">
                              {u.email || <span className="text-faint">код не активирован</span>}
                            </div>
                            <div className="text-[12px] text-faint mt-0.5 truncate max-w-[240px]">
                              {u.user_name} · {formatDate(u.claimed_at || u.created_at)}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <button
                              type="button"
                              onClick={() => copyToClipboard(u.secret_code)}
                              title="Скопировать код"
                              className="inline-flex items-center gap-2 h-8 px-2.5 rounded-control bg-surface-2 border border-hairline hover:border-hairline-strong transition-colors cursor-pointer max-w-[200px]"
                            >
                              <span className="font-mono text-[12.5px] text-ink truncate">{u.secret_code}</span>
                              {copiedCode === u.secret_code ? <Check size={14} className="text-accent shrink-0" /> : <Copy size={14} className="text-faint shrink-0" />}
                            </button>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex flex-col items-start gap-1">
                              <Badge tone={meta.tone} icon={meta.icon}>
                                {meta.label}
                              </Badge>
                              {frozen && <Badge tone="warn">до {formatFreezeUntil(frozen)}</Badge>}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            {claimed ? (
                              <Badge tone={u.has_elevenlabs_key ? "ok" : "neutral"} icon={<Key size={12} />}>
                                {u.has_elevenlabs_key ? "есть" : "нет"}
                              </Badge>
                            ) : (
                              <span className="text-faint">—</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 min-w-[130px]">
                            <div className="text-[12.5px] text-muted tabular">
                              {used} / {limit}
                            </div>
                            <div className="h-1.5 w-full max-w-[120px] rounded-full bg-surface-3 overflow-hidden mt-1.5">
                              <div className="h-full rounded-full bg-accent" style={{ width: `${usedPct}%` }} />
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={0}
                                value={balances[u.id] ?? 0}
                                title="Введите число генераций и нажмите Сохранить или Enter"
                                onChange={(e) => setBalances((b) => ({ ...b, [u.id]: Number(e.target.value) }))}
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
                                onClick={() => handleSaveBalance(u.id, balances[u.id])}
                              >
                                {savedBalanceId === u.id ? "Сохранено" : "Сохранить"}
                              </Button>
                              <Button size="sm" variant="ghost" title="Прибавить +10" onClick={() => userAction("add_generations", u.id, { amount: 10 })}>
                                +10
                              </Button>
                            </div>
                          </td>

                          <td className="py-3.5 px-5">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {u.status === "pending" && (
                                <>
                                  <Button size="sm" onClick={() => userAction("approve", u.id)}>
                                    Одобрить
                                  </Button>
                                  <Button size="sm" variant="secondary" onClick={() => userAction("reject", u.id)}>
                                    Отклонить
                                  </Button>
                                </>
                              )}
                              {(u.status === "rejected" || u.status === "blocked") && (
                                <Button size="sm" onClick={() => userAction("approve", u.id)}>
                                  Одобрить
                                </Button>
                              )}
                              {u.status === "approved" &&
                                (frozen ? (
                                  <Button size="sm" variant="secondary" onClick={() => userAction("unfreeze", u.id)}>
                                    Разморозить
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="secondary" title="Временно закрыть вход" onClick={() => setFreezeTarget(u)}>
                                    Заморозить
                                  </Button>
                                ))}
                              {claimed && u.status !== "approved" && (
                                <Button size="sm" variant="ghost" title="Стереть заявку и снова освободить код" onClick={() => userAction("reset_invite", u.id)}>
                                  Сбросить код
                                </Button>
                              )}
                              <IconButton
                                size="sm"
                                variant="ghost"
                                title="Удалить"
                                aria-label="Удалить"
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
        )}
      </main>

      {/* Создание инвайт-кода */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Новый инвайт-код"
        hint="Передайте код человеку: он зарегистрируется с почтой и ключом ElevenLabs, а вы одобрите заявку."
        icon={
          <IconTile size="md">
            <Ticket size={20} weight="bold" />
          </IconTile>
        }
        footer={
          createdCode ? (
            <Button block onClick={() => setShowCreateModal(false)}>
              Готово
            </Button>
          ) : (
            <>
              <Button variant="secondary" block onClick={() => setShowCreateModal(false)} disabled={createLoading}>
                Отмена
              </Button>
              <Button type="submit" form="create-code-form" block loading={createLoading}>
                {createLoading ? "Создание..." : "Создать код"}
              </Button>
            </>
          )
        }
      >
        {createdCode ? (
          <div className="flex flex-col gap-3">
            <Alert tone="ok">Код создан. Отправьте его пользователю.</Alert>
            <button
              type="button"
              onClick={() => copyToClipboard(createdCode)}
              className="flex items-center justify-between gap-3 h-12 px-4 rounded-control bg-surface-2 border border-hairline hover:border-hairline-strong transition-colors cursor-pointer"
            >
              <span className="font-mono text-[15px] font-semibold text-ink tracking-wider">{createdCode}</span>
              {copiedCode === createdCode ? <Check size={18} className="text-accent" /> : <Copy size={18} className="text-faint" />}
            </button>
          </div>
        ) : (
          <form id="create-code-form" onSubmit={handleCreateCode} className="flex flex-col gap-4">
            <Field label="Метка" hint="Для себя: кому выдан код. Необязательно.">
              <Input autoFocus placeholder="Например: Клиент из Астаны" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            </Field>
            <Field label="Код" hint="Пусто — сгенерируется автоматически">
              <Input placeholder="VIP-CLIENT-2026" value={newCustomCode} onChange={(e) => setNewCustomCode(e.target.value)} className="font-mono" />
            </Field>
            <Field label="Стартовый баланс генераций">
              <Input type="number" min={1} max={500} value={newLimit} onChange={(e) => setNewLimit(Number(e.target.value))} className="font-mono tabular" />
            </Field>
          </form>
        )}
      </Modal>

      <Modal open={!!freezeTarget} onClose={() => setFreezeTarget(null)} title="Заморозить аккаунт">
        <p className="text-[13.5px] text-muted leading-snug mb-4">
          Вход для <span className="font-medium text-ink">{freezeTarget?.email || freezeTarget?.user_name}</span> будет отклоняться до окончания срока. Баланс сохраняется.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {([
            { label: "24 часа", value: 24 as const },
            { label: "7 дней", value: 168 as const },
            { label: "Бессрочно", value: "forever" as const },
          ]).map((opt) => (
            <Button
              key={String(opt.value)}
              variant="secondary"
              onClick={async () => {
                if (!freezeTarget) return;
                const ok = await userAction("freeze", freezeTarget.id, { hours: opt.value });
                if (ok) setFreezeTarget(null);
              }}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Удалить аккаунт"
        description={
          pendingDelete
            ? `«${pendingDelete.email || pendingDelete.user_name}» — удалить безвозвратно вместе с историей видео?`
            : undefined
        }
        confirmLabel="Удалить"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={!!pendingRemoveAdmin}
        title="Снять администратора"
        description={pendingRemoveAdmin ? `${pendingRemoveAdmin.email} потеряет доступ к панели.` : undefined}
        confirmLabel="Снять"
        loading={adminBusy}
        onConfirm={confirmRemoveAdmin}
        onCancel={() => setPendingRemoveAdmin(null)}
      />
    </div>
  );
}

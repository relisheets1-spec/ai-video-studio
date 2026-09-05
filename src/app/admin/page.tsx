"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise,
  Check,
  CheckCircle,
  Clock,
  Copy,
  EnvelopeSimple,
  HardDrives,
  MagnifyingGlass,
  Plus,
  Prohibit,
  ShieldCheck,
  Ticket,
  Trash,
  UserPlus,
  Users,
  XCircle,
} from "@phosphor-icons/react";
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
import { adminFetch, adminLogout, ADMIN_SESSION_LOST_EVENT } from "@/lib/client/admin-session";
import type { AccessStatus, AdminInfo, AdminUserView } from "@/lib/types";

type TabId = "users" | "logs" | "admins";
type StatusFilter = "all" | AccessStatus;

interface Stats {
  users: number;
  pending: number;
  approved: number;
  videos: number;
  videos7d: number;
}

interface SessionInfo {
  admin: AdminInfo;
  stats: Stats;
  disk: { films: number; bytes: number };
  mail: "resend" | "smtp" | "log";
}

interface LogRow {
  id: string;
  email: string | null;
  topic: string;
  status: string;
  stale: boolean;
  stage: string | null;
  message: string | null;
  createdAt: string;
}

const STATUS_META: Record<AccessStatus, { label: string; tone: "ok" | "warn" | "danger" | "neutral" | "outline"; icon: React.ReactNode }> = {
  pending: { label: "Заявка", tone: "warn", icon: <Clock size={14} weight="fill" /> },
  invited: { label: "Приглашён", tone: "outline", icon: <Ticket size={14} weight="fill" /> },
  approved: { label: "Одобрен", tone: "ok", icon: <CheckCircle size={14} weight="fill" /> },
  rejected: { label: "Отклонён", tone: "danger", icon: <XCircle size={14} weight="fill" /> },
  blocked: { label: "Заблокирован", tone: "neutral", icon: <Prohibit size={14} weight="fill" /> },
};

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "pending", label: "Заявки" },
  { id: "invited", label: "Приглашены" },
  { id: "approved", label: "Одобрены" },
  { id: "blocked", label: "Заблокированы" },
];

const STAGE_LABELS: Record<string, string> = {
  llm: "Сценарий",
  tts: "Озвучка",
  image: "Картинки",
  render: "Рендер",
  auth: "Доступ",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 МБ";
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} ГБ` : `${Math.round(bytes / 1024 ** 2)} МБ`;
}

/** Кнопка «скопировать» с галочкой на пару секунд. */
const CopyButton: React.FC<{ value: string; title?: string }> = ({ value, title }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={title || "Скопировать"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          // Буфер обмена недоступен (нет https) — код всё равно виден на экране.
        }
      }}
      className="inline-flex items-center justify-center w-7 h-7 rounded-control border border-hairline bg-surface-2 text-muted hover:text-ink cursor-pointer shrink-0"
    >
      {done ? <Check size={13} weight="bold" /> : <Copy size={13} />}
    </button>
  );
};

export default function AdminPage() {
  const { notify } = useToast();

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [checking, setChecking] = useState(true);

  // Вход: почта → код с письма.
  const [loginStep, setLoginStep] = useState<"email" | "code">("email");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginInfo, setLoginInfo] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const [tab, setTab] = useState<TabId>("users");
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [admins, setAdmins] = useState<AdminInfo[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [stageFilter, setStageFilter] = useState("all");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [approveFor, setApproveFor] = useState<AdminUserView | null>(null);
  const [approveLimit, setApproveLimit] = useState("5");
  const [approveNotify, setApproveNotify] = useState(true);
  const [issuedInvite, setIssuedInvite] = useState<{ email: string; code: string; mailSent: boolean } | null>(null);
  const [balanceFor, setBalanceFor] = useState<AdminUserView | null>(null);
  const [balanceValue, setBalanceValue] = useState("0");
  const [confirmDelete, setConfirmDelete] = useState<AdminUserView | null>(null);
  const [newAdmin, setNewAdmin] = useState("");

  // -------------------------------------------------------------------------
  // Данные
  // -------------------------------------------------------------------------

  const loadSession = useCallback(async () => {
    try {
      // Обычный fetch, а не adminFetch: проверка при открытии страницы не
      // должна выглядеть как «сессия оборвалась» — её ещё и не было.
      const res = await fetch("/api/admin/session", { credentials: "same-origin" });
      if (!res.ok) {
        setSession(null);
        return false;
      }
      setSession(await res.json());
      return true;
    } catch {
      setSession(null);
      return false;
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setSession((prev) => (prev ? { ...prev, stats: data.stats } : prev));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAdmins = useCallback(async () => {
    const res = await adminFetch("/api/admin/admins");
    if (res.ok) setAdmins((await res.json()).admins || []);
  }, []);

  const loadLogs = useCallback(async () => {
    const res = await adminFetch(`/api/admin/logs?stage=${stageFilter}`);
    if (res.ok) setLogs((await res.json()).logs || []);
  }, [stageFilter]);

  useEffect(() => {
    loadSession().finally(() => setChecking(false));

    const onLost = (e: Event) => {
      setSession(null);
      const detail = (e as CustomEvent<{ error?: string }>).detail;
      setLoginStep("email");
      setLoginInfo(detail?.error || "Сессия администратора истекла — войдите заново.");
    };
    window.addEventListener(ADMIN_SESSION_LOST_EVENT, onLost);
    return () => window.removeEventListener(ADMIN_SESSION_LOST_EVENT, onLost);
  }, [loadSession]);

  useEffect(() => {
    if (!session) return;
    if (tab === "users") loadUsers();
    if (tab === "admins") loadAdmins();
    if (tab === "logs") loadLogs();
  }, [session, tab, loadUsers, loadAdmins, loadLogs]);

  // -------------------------------------------------------------------------
  // Вход
  // -------------------------------------------------------------------------

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: loginEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось отправить код");
      setLoginStep("code");
      setLoginInfo(data.message || "Код отправлен на почту.");
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/admin/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: loginEmail.trim(), code: loginCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Неверный код");
      setLoginCode("");
      setLoginInfo(null);
      await loadSession();
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await adminLogout();
    setSession(null);
    setLoginStep("email");
    setLoginCode("");
  };

  // -------------------------------------------------------------------------
  // Действия над пользователями
  // -------------------------------------------------------------------------

  const act = async (user: AdminUserView, action: string, extra: Record<string, unknown> = {}) => {
    setBusy(user.id + action);
    try {
      const res = await adminFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ action, userId: user.id, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось выполнить действие");
      if (data.users) setUsers(data.users);
      if (data.stats) setSession((prev) => (prev ? { ...prev, stats: data.stats } : prev));
      return data;
    } catch (err: any) {
      notify(err.message, "danger");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const openApprove = (user: AdminUserView) => {
    setApproveFor(user);
    setApproveLimit(String(user.generationsLimit || 5));
    setApproveNotify(true);
  };

  const confirmApprove = async () => {
    if (!approveFor) return;
    const data = await act(approveFor, "approve", {
      limit: Number(approveLimit) || 5,
      notify: approveNotify,
    });
    setApproveFor(null);
    if (data?.invite) {
      setIssuedInvite({ email: approveFor.email, code: data.invite.code, mailSent: !!data.mailSent });
    }
  };

  const resendInvite = async (user: AdminUserView) => {
    const data = await act(user, "resend_invite", { limit: user.generationsLimit || 5, notify: true });
    if (data?.invite) setIssuedInvite({ email: user.email, code: data.invite.code, mailSent: !!data.mailSent });
  };

  const saveBalance = async () => {
    if (!balanceFor) return;
    await act(balanceFor, "set_balance", { amount: Number(balanceValue) || 0 });
    setBalanceFor(null);
    notify("Баланс обновлён");
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    await act(confirmDelete, "delete");
    setConfirmDelete(null);
    notify("Пользователь и его фильмы удалены");
  };

  const addAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await adminFetch("/api/admin/admins", {
      method: "POST",
      body: JSON.stringify({ email: newAdmin.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      notify(data.error || "Не удалось добавить", "danger");
      return;
    }
    setAdmins(data.admins);
    setNewAdmin("");
    notify("Администратор добавлен");
  };

  const removeAdmin = async (email: string) => {
    const res = await adminFetch(`/api/admin/admins?email=${encodeURIComponent(email)}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      notify(data.error || "Не удалось снять", "danger");
      return;
    }
    setAdmins(data.admins);
    notify("Администратор снят");
  };

  // -------------------------------------------------------------------------
  // Экран входа
  // -------------------------------------------------------------------------

  const visibleUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return users
      .filter((u) => filter === "all" || u.status === filter)
      .filter((u) => !needle || u.email.includes(needle) || (u.invite?.code || "").toLowerCase().includes(needle));
  }, [users, filter, search]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={28} className="text-accent" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar variant="admin" />
        <main className="flex-1 flex items-center justify-center px-5 py-12">
          <div className="w-full max-w-[420px]">
            <Tile className="p-6 sm:p-9">
              <div className="flex flex-col items-center text-center gap-3 mb-6">
                <IconTile size="lg">
                  <ShieldCheck size={24} weight="fill" />
                </IconTile>
                <h1 className="text-[24px] font-bold tracking-tight text-ink">Панель администратора</h1>
                <p className="text-[13.5px] text-muted leading-relaxed max-w-[320px]">
                  {loginStep === "email"
                    ? "Введите почту администратора — на неё придёт код входа."
                    : `Код отправлен на ${loginEmail}. Он действует 10 минут.`}
                </p>
              </div>

              {loginInfo && (
                <Alert tone="info" className="mb-4">
                  {loginInfo}
                </Alert>
              )}
              {loginError && (
                <Alert tone="danger" className="mb-4">
                  {loginError}
                </Alert>
              )}

              {loginStep === "email" ? (
                <form onSubmit={requestCode} className="flex flex-col gap-4">
                  <Field label="Почта">
                    <Input
                      type="email"
                      required
                      autoFocus
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="admin@example.com"
                      disabled={loginLoading}
                    />
                  </Field>
                  <Button type="submit" size="lg" block loading={loginLoading} disabled={!loginEmail.trim()}>
                    Получить код
                  </Button>
                </form>
              ) : (
                <form onSubmit={submitCode} className="flex flex-col gap-4">
                  <Field label="Код из письма">
                    <Input
                      required
                      autoFocus
                      inputMode="numeric"
                      maxLength={6}
                      value={loginCode}
                      onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      className="text-center text-[22px] font-mono tracking-[0.4em]"
                      disabled={loginLoading}
                    />
                  </Field>
                  <Button type="submit" size="lg" block loading={loginLoading} disabled={loginCode.length !== 6}>
                    Войти
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginStep("email");
                      setLoginError(null);
                    }}
                    className="text-[13px] text-muted hover:text-ink cursor-pointer"
                  >
                    Другая почта
                  </button>
                </form>
              )}
            </Tile>
          </div>
        </main>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Панель
  // -------------------------------------------------------------------------

  const stats = session.stats;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar
        variant="admin"
        identity={session.admin.email}
        onLogout={handleLogout}
        actions={
          <IconButton
            title="Обновить"
            onClick={() => {
              loadSession();
              if (tab === "users") loadUsers();
              if (tab === "logs") loadLogs();
              if (tab === "admins") loadAdmins();
            }}
          >
            <ArrowClockwise size={16} />
          </IconButton>
        }
      />

      <main className="flex-1 w-full max-w-shell mx-auto px-5 sm:px-8 py-6 flex flex-col gap-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatTile label="Пользователи" value={stats.users} icon={<Users size={18} />} />
          <StatTile label="Заявки" value={stats.pending} tone={stats.pending > 0 ? "accent" : "surface"} icon={<Clock size={18} />} />
          <StatTile label="Одобрены" value={stats.approved} icon={<CheckCircle size={18} />} />
          <StatTile label="Фильмов" value={stats.videos} caption={`за неделю: ${stats.videos7d}`} />
          <StatTile
            label="Медиа на диске"
            value={formatBytes(session.disk.bytes)}
            caption={`${session.disk.films} фильмов`}
            icon={<HardDrives size={18} />}
            valueClassName="text-[20px]"
          />
        </div>

        {session.mail === "log" && (
          <Alert tone="warn">
            Почта не настроена: коды входа и приглашения пишутся в журнал сервера. Задайте RESEND_API_KEY или SMTP_HOST.
          </Alert>
        )}

        <div className="flex items-center gap-1 p-1 rounded-full bg-surface-2 border border-hairline self-start">
          {([
            { id: "users", label: "Пользователи" },
            { id: "logs", label: "Журнал" },
            { id: "admins", label: "Администраторы" },
          ] as { id: TabId; label: string }[]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center h-9 px-4 rounded-full text-[13px] font-medium transition-colors cursor-pointer",
                tab === t.id ? "bg-contrast text-contrast-ink" : "text-muted hover:text-ink"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "users" && (
          <Tile
            title="Пользователи и заявки"
            icon={<Users size={20} />}
            action={<span className="text-[12px] text-faint tabular">{loading ? "…" : `${visibleUsers.length}`}</span>}
          >
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <MagnifyingGlass size={16} className="text-faint absolute left-3.5 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по почте или коду"
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      "h-9 px-3 rounded-control text-[13px] border transition-colors cursor-pointer",
                      filter === f.id
                        ? "bg-contrast text-contrast-ink border-transparent"
                        : "bg-surface-2 text-muted border-hairline hover:text-ink"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {visibleUsers.length === 0 ? (
              <p className="text-[13.5px] text-muted py-6 text-center">Ничего не найдено.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {visibleUsers.map((user) => {
                  const meta = STATUS_META[user.status];
                  return (
                    <div
                      key={user.id}
                      className="rounded-control border border-hairline bg-surface-2 p-3.5 flex flex-col gap-3"
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[14px] font-medium text-ink break-all">{user.email}</span>
                            <Badge tone={meta.tone} icon={meta.icon}>
                              {meta.label}
                            </Badge>
                          </div>
                          <div className="text-[12px] text-muted mt-1 tabular">
                            заявка {formatDate(user.createdAt)} · вход {formatDate(user.lastLoginAt)} · фильмов{" "}
                            {user.videosCount}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[15px] font-semibold text-ink tabular">
                            {user.remaining} / {user.generationsLimit}
                          </div>
                          <div className="text-[11.5px] text-faint">осталось генераций</div>
                        </div>
                      </div>

                      {user.invite && !user.invite.usedAt && (
                        <div className="flex items-center gap-2 text-[12.5px] text-muted flex-wrap">
                          <Ticket size={14} />
                          <span className="font-mono text-ink">{user.invite.code}</span>
                          <CopyButton value={user.invite.code} title="Скопировать код приглашения" />
                          <span className="text-faint">до {formatDate(user.invite.expiresAt)}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        {(user.status === "pending" || user.status === "rejected") && (
                          <Button size="sm" onClick={() => openApprove(user)} loading={busy === user.id + "approve"}>
                            Одобрить
                          </Button>
                        )}
                        {user.status === "invited" && (
                          <Button size="sm" variant="secondary" onClick={() => resendInvite(user)}>
                            Новый код приглашения
                          </Button>
                        )}
                        {user.status === "approved" && (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => act(user, "add_generations", { amount: 5 })}>
                              +5
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setBalanceFor(user);
                                setBalanceValue(String(user.remaining));
                              }}
                            >
                              Баланс
                            </Button>
                            {user.hasElevenLabsKey && (
                              <Button size="sm" variant="secondary" onClick={() => act(user, "reset_key")}>
                                Сбросить ключ
                              </Button>
                            )}
                          </>
                        )}
                        {user.status === "blocked" ? (
                          <Button size="sm" variant="secondary" onClick={() => act(user, "unblock")}>
                            Разблокировать
                          </Button>
                        ) : (
                          <Button size="sm" variant="danger" onClick={() => act(user, "block")}>
                            Заблокировать
                          </Button>
                        )}
                        {user.status === "pending" && (
                          <Button size="sm" variant="ghost" onClick={() => act(user, "reject")}>
                            Отклонить
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(user)}>
                          <Trash size={14} />
                        </Button>
                        <span className="text-[12px] text-faint ml-auto">
                          {user.hasElevenLabsKey ? "ключ ElevenLabs есть" : "ключа ElevenLabs нет"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Tile>
        )}

        {tab === "logs" && (
          <Tile title="Журнал отказов" hint="Упавшие и зависшие генерации. Идущие сейчас сюда не попадают.">
            <div className="flex items-center gap-1 flex-wrap mb-4">
              {["all", "llm", "tts", "image", "render", "auth"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStageFilter(s)}
                  className={cn(
                    "h-9 px-3 rounded-control text-[13px] border transition-colors cursor-pointer",
                    stageFilter === s
                      ? "bg-contrast text-contrast-ink border-transparent"
                      : "bg-surface-2 text-muted border-hairline hover:text-ink"
                  )}
                >
                  {s === "all" ? "Все" : STAGE_LABELS[s]}
                </button>
              ))}
            </div>

            {logs.length === 0 ? (
              <p className="text-[13.5px] text-muted py-6 text-center">Отказов нет.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {logs.map((log) => (
                  <div key={log.id} className="rounded-control border border-hairline bg-surface-2 p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone={log.stale ? "warn" : "danger"}>{log.stale ? "Зависла" : "Ошибка"}</Badge>
                      {log.stage && <Badge tone="outline">{STAGE_LABELS[log.stage] || log.stage}</Badge>}
                      <span className="text-[13px] text-ink truncate">{log.topic}</span>
                      <span className="text-[12px] text-faint ml-auto tabular">{formatDate(log.createdAt)}</span>
                    </div>
                    {log.message && <p className="text-[12.5px] text-muted mt-1.5 break-words">{log.message}</p>}
                    {log.email && <p className="text-[12px] text-faint mt-1">{log.email}</p>}
                  </div>
                ))}
              </div>
            )}
          </Tile>
        )}

        {tab === "admins" && (
          <Tile title="Администраторы" hint="Вход по коду с почты. Пароля нет ни у кого.">
            <form onSubmit={addAdmin} className="flex flex-col sm:flex-row gap-3 mb-5">
              <div className="relative flex-1">
                <EnvelopeSimple size={16} className="text-faint absolute left-3.5 top-1/2 -translate-y-1/2" />
                <Input
                  type="email"
                  value={newAdmin}
                  onChange={(e) => setNewAdmin(e.target.value)}
                  placeholder="admin@example.com"
                  className="pl-10"
                />
              </div>
              <Button type="submit" icon={<UserPlus size={16} />} disabled={!newAdmin.trim()}>
                Добавить
              </Button>
            </form>

            <div className="flex flex-col gap-2">
              {admins.map((admin) => (
                <div
                  key={admin.email}
                  className="flex items-center justify-between gap-3 rounded-control border border-hairline bg-surface-2 p-3"
                >
                  <div className="min-w-0">
                    <span className="text-[13.5px] text-ink break-all">{admin.email}</span>
                    {admin.isPrimary ? (
                      <Badge tone="accent" className="ml-2">
                        из настроек сервера
                      </Badge>
                    ) : (
                      <span className="text-[12px] text-faint ml-2">
                        добавил {admin.addedBy || "—"} · {formatDate(admin.createdAt || null)}
                      </span>
                    )}
                  </div>
                  {!admin.isPrimary && admin.email !== session.admin.email && (
                    <IconButton title="Снять" onClick={() => removeAdmin(admin.email)}>
                      <Trash size={15} />
                    </IconButton>
                  )}
                </div>
              ))}
            </div>
          </Tile>
        )}
      </main>

      {/* Одобрение заявки */}
      <Modal
        open={!!approveFor}
        onClose={() => setApproveFor(null)}
        title="Одобрить заявку"
        hint={approveFor?.email}
        icon={
          <IconTile size="md">
            <Plus size={20} />
          </IconTile>
        }
        footer={
          <>
            <Button variant="secondary" block onClick={() => setApproveFor(null)}>
              Отмена
            </Button>
            <Button block onClick={confirmApprove} loading={busy === (approveFor?.id || "") + "approve"}>
              Одобрить и выдать код
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Стартовый лимит генераций">
            <Input
              type="number"
              min={1}
              max={500}
              value={approveLimit}
              onChange={(e) => setApproveLimit(e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2.5 text-[13.5px] text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={approveNotify}
              onChange={(e) => setApproveNotify(e.target.checked)}
              className="w-4 h-4 accent-current cursor-pointer"
            />
            Отправить код приглашения письмом
          </label>
        </div>
      </Modal>

      {/* Выданный код приглашения */}
      <Modal
        open={!!issuedInvite}
        onClose={() => setIssuedInvite(null)}
        title="Код приглашения"
        hint={issuedInvite?.email}
        icon={
          <IconTile size="md">
            <Ticket size={20} />
          </IconTile>
        }
        footer={
          <Button block onClick={() => setIssuedInvite(null)}>
            Готово
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-center gap-3 py-4 rounded-control bg-surface-2 border border-hairline">
            <span className="font-mono text-[22px] tracking-wider text-ink">{issuedInvite?.code}</span>
            {issuedInvite && <CopyButton value={issuedInvite.code} />}
          </div>
          <p className="text-[13px] text-muted">
            Одноразовый, действует 7 дней и работает только с почтой {issuedInvite?.email}.{" "}
            {issuedInvite?.mailSent ? "Письмо отправлено." : "Письмо не отправлялось — передайте код лично."}
          </p>
        </div>
      </Modal>

      {/* Точный остаток генераций */}
      <Modal
        open={!!balanceFor}
        onClose={() => setBalanceFor(null)}
        title="Остаток генераций"
        hint={balanceFor?.email}
        footer={
          <>
            <Button variant="secondary" block onClick={() => setBalanceFor(null)}>
              Отмена
            </Button>
            <Button block onClick={saveBalance}>
              Сохранить
            </Button>
          </>
        }
      >
        <Field label="Сколько фильмов осталось сделать">
          <Input type="number" min={0} value={balanceValue} onChange={(e) => setBalanceValue(e.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Удалить пользователя?"
        description={`${confirmDelete?.email}: аккаунт, его фильмы и файлы будут удалены безвозвратно.`}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        loading={busy === (confirmDelete?.id || "") + "delete"}
      />
    </div>
  );
}

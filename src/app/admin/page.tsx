"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise,
  Check,
  Copy,
  EnvelopeSimple,
  FilmStrip,
  HardDrives,
  Key,
  MagnifyingGlass,
  Play,
  Plus,
  Prohibit,
  Receipt,
  ShieldCheck,
  Ticket,
  Trash,
  UserPlus,
  Users,
} from "@phosphor-icons/react";
import { Navbar } from "@/components/Navbar";
import { VideoPlayer } from "@/components/VideoPlayer";
import { CostModal } from "@/components/CostModal";
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
import { formatCostCompact, formatUsd } from "@/lib/cost-format";
import type { Orientation } from "@/lib/orientation";
import type { AdminInfo, AdminUserView, Scene, VideoCost } from "@/lib/types";

type TabId = "codes" | "users" | "videos" | "logs" | "admins";

interface Stats {
  users: number;
  blocked: number;
  freeCodes: number;
  videos: number;
  videos7d: number;
}

interface SessionInfo {
  admin: AdminInfo;
  stats: Stats;
  disk: { films: number; bytes: number };
}

interface CodeRow {
  code: string;
  email: string | null;
  note: string | null;
  created_at: string;
  used_at: string | null;
  revoked_at: string | null;
}

interface VideoRow {
  id: string;
  email: string | null;
  topic: string;
  status: string;
  scenes: number;
  durationSeconds: number;
  orientation: Orientation;
  mediaPurgedAt: string | null;
  createdAt: string;
  cost: VideoCost | null;
}

interface OpenedVideo {
  id: string;
  topic: string;
  email: string | null;
  scenes: Scene[];
  orientation: Orientation;
  cost: VideoCost | null;
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

const STAGE_LABELS: Record<string, string> = {
  llm: "Сценарий",
  tts: "Озвучка",
  image: "Картинки",
  render: "Рендер",
  auth: "Доступ",
};

const TABS: { id: TabId; label: string }[] = [
  { id: "codes", label: "Коды доступа" },
  { id: "users", label: "Пользователи" },
  { id: "videos", label: "Фильмы" },
  { id: "logs", label: "Журнал" },
  { id: "admins", label: "Администраторы" },
];

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

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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

/** Фильтр-кнопка в ряду переключателей. */
const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "h-9 px-3 rounded-control text-[13px] border transition-colors cursor-pointer",
      active ? "bg-contrast text-contrast-ink border-transparent" : "bg-surface-2 text-muted border-hairline hover:text-ink"
    )}
  >
    {children}
  </button>
);

export default function AdminPage() {
  const { notify } = useToast();

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [checking, setChecking] = useState(true);

  // Вход: почта администратора + код администратора.
  const [loginEmail, setLoginEmail] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginInfo, setLoginInfo] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const [tab, setTab] = useState<TabId>("codes");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [codeFilter, setCodeFilter] = useState<"all" | "free" | "used" | "revoked">("all");
  const [newCodeCustom, setNewCodeCustom] = useState("");
  const [newCodeNote, setNewCodeNote] = useState("");
  const [issuedCode, setIssuedCode] = useState<{ code: string; email: string | null; note: string | null } | null>(null);
  const [confirmCode, setConfirmCode] = useState<CodeRow | null>(null);

  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [userFilter, setUserFilter] = useState<"all" | "active" | "blocked">("all");
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<AdminUserView | null>(null);

  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [videoSearch, setVideoSearch] = useState("");
  const [opened, setOpened] = useState<OpenedVideo | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [costFor, setCostFor] = useState<{ title: string; cost: VideoCost } | null>(null);

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [stageFilter, setStageFilter] = useState("all");

  const [admins, setAdmins] = useState<AdminInfo[]>([]);
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

  const applyStats = (stats?: Stats) => {
    if (stats) setSession((prev) => (prev ? { ...prev, stats } : prev));
  };

  const loadCodes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/codes");
      if (res.ok) setCodes((await res.json()).codes || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        applyStats(data.stats);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/videos");
      if (res.ok) setVideos((await res.json()).videos || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    const res = await adminFetch(`/api/admin/logs?stage=${stageFilter}`);
    if (res.ok) setLogs((await res.json()).logs || []);
  }, [stageFilter]);

  const loadAdmins = useCallback(async () => {
    const res = await adminFetch("/api/admin/admins");
    if (res.ok) setAdmins((await res.json()).admins || []);
  }, []);

  const loadTab = useCallback(() => {
    if (tab === "codes") loadCodes();
    if (tab === "users") loadUsers();
    if (tab === "videos") loadVideos();
    if (tab === "logs") loadLogs();
    if (tab === "admins") loadAdmins();
  }, [tab, loadCodes, loadUsers, loadVideos, loadLogs, loadAdmins]);

  useEffect(() => {
    loadSession().finally(() => setChecking(false));

    const onLost = (e: Event) => {
      setSession(null);
      const detail = (e as CustomEvent<{ error?: string }>).detail;
      setLoginInfo(detail?.error || "Сессия администратора истекла — войдите заново.");
    };
    window.addEventListener(ADMIN_SESSION_LOST_EVENT, onLost);
    return () => window.removeEventListener(ADMIN_SESSION_LOST_EVENT, onLost);
  }, [loadSession]);

  useEffect(() => {
    if (session) loadTab();
  }, [session, loadTab]);

  // Список администраторов нужен сводке сверху, а не только своей вкладке.
  const adminEmail = session?.admin.email;
  useEffect(() => {
    if (adminEmail) loadAdmins();
  }, [adminEmail, loadAdmins]);

  // -------------------------------------------------------------------------
  // Вход
  // -------------------------------------------------------------------------

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: loginEmail.trim(), code: loginCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Неверная почта или код");
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
    setLoginCode("");
  };

  // -------------------------------------------------------------------------
  // Коды доступа
  // -------------------------------------------------------------------------

  const createCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("create");
    try {
      const res = await adminFetch("/api/admin/codes", {
        method: "POST",
        body: JSON.stringify({ code: newCodeCustom.trim() || undefined, note: newCodeNote.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось создать код");
      setCodes(data.codes);
      setNewCodeCustom("");
      setNewCodeNote("");
      setIssuedCode({ code: data.code.code, email: data.code.email, note: data.code.note });
      loadSession();
    } catch (err: any) {
      notify(err.message, "danger");
    } finally {
      setBusy(null);
    }
  };

  const dropCode = async () => {
    if (!confirmCode) return;
    setBusy("code" + confirmCode.code);
    try {
      const res = await adminFetch(`/api/admin/codes?code=${encodeURIComponent(confirmCode.code)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось удалить код");
      setCodes(data.codes);
      notify(confirmCode.email ? "Код отозван — пользователь больше не войдёт" : "Код удалён");
      loadSession();
    } catch (err: any) {
      notify(err.message, "danger");
    } finally {
      setBusy(null);
      setConfirmCode(null);
    }
  };

  // -------------------------------------------------------------------------
  // Пользователи
  // -------------------------------------------------------------------------

  const act = async (user: AdminUserView, action: string) => {
    setBusy(user.id + action);
    try {
      const res = await adminFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ action, userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось выполнить действие");
      if (data.users) setUsers(data.users);
      applyStats(data.stats);
      return data;
    } catch (err: any) {
      notify(err.message, "danger");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const rotateCode = async (user: AdminUserView) => {
    const data = await act(user, "rotate_code");
    if (data?.code) setIssuedCode({ code: data.code, email: user.email, note: null });
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    await act(confirmDelete, "delete");
    setConfirmDelete(null);
    notify("Пользователь и его фильмы удалены");
  };

  // -------------------------------------------------------------------------
  // Фильмы
  // -------------------------------------------------------------------------

  const openVideo = async (row: VideoRow) => {
    setOpeningId(row.id);
    try {
      const res = await adminFetch(`/api/admin/videos?videoId=${encodeURIComponent(row.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось открыть фильм");
      const v = data.video;
      setOpened({
        id: v.id,
        topic: v.topic,
        email: row.email,
        scenes: v.scenes || [],
        orientation: v.scenes?.[0]?.orientation || "landscape",
        cost: v.cost || null,
      });
    } catch (err: any) {
      notify(err.message, "danger");
    } finally {
      setOpeningId(null);
    }
  };

  // -------------------------------------------------------------------------
  // Администраторы
  // -------------------------------------------------------------------------

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
    notify("Администратор добавлен — входит своей почтой и кодом администратора");
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
  // Выборки
  // -------------------------------------------------------------------------

  const visibleCodes = useMemo(
    () =>
      codes.filter((c) => {
        if (codeFilter === "free") return !c.email && !c.revoked_at;
        if (codeFilter === "used") return !!c.email && !c.revoked_at;
        if (codeFilter === "revoked") return !!c.revoked_at;
        return true;
      }),
    [codes, codeFilter]
  );

  const visibleUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return users
      .filter((u) => userFilter === "all" || u.status === userFilter)
      .filter((u) => !needle || u.email.includes(needle) || (u.code || "").toLowerCase().includes(needle));
  }, [users, userFilter, search]);

  const visibleVideos = useMemo(() => {
    const needle = videoSearch.trim().toLowerCase();
    return videos.filter(
      (v) => !needle || v.topic.toLowerCase().includes(needle) || (v.email || "").toLowerCase().includes(needle)
    );
  }, [videos, videoSearch]);

  const videosTotalUsd = useMemo(() => visibleVideos.reduce((sum, v) => sum + (v.cost?.totalUsd || 0), 0), [visibleVideos]);

  // -------------------------------------------------------------------------
  // Экран входа
  // -------------------------------------------------------------------------

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
                  Почта администратора и код администратора.
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

              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <Field label="Почта">
                  <Input
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="admin@example.com"
                    disabled={loginLoading}
                  />
                </Field>
                <Field label="Код администратора">
                  <Input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={loginCode}
                    onChange={(e) => setLoginCode(e.target.value)}
                    className="font-mono"
                    disabled={loginLoading}
                  />
                </Field>
                <Button type="submit" size="lg" block loading={loginLoading} disabled={!loginEmail.trim() || !loginCode}>
                  Войти
                </Button>
              </form>
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
              loadTab();
            }}
          >
            <ArrowClockwise size={16} />
          </IconButton>
        }
      />

      <main className="flex-1 w-full max-w-shell mx-auto px-5 sm:px-8 py-6 flex flex-col gap-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatTile label="Пользователи" value={stats.users} caption={stats.blocked ? `заблокировано: ${stats.blocked}` : undefined} icon={<Users size={18} />} />
          <StatTile label="Свободных кодов" value={stats.freeCodes} tone={stats.freeCodes === 0 ? "accent" : "surface"} icon={<Ticket size={18} />} />
          <StatTile label="Фильмов" value={stats.videos} caption={`за неделю: ${stats.videos7d}`} icon={<FilmStrip size={18} />} />
          <StatTile
            label="Медиа на диске"
            value={formatBytes(session.disk.bytes)}
            caption={`${session.disk.films} фильмов`}
            icon={<HardDrives size={18} />}
            valueClassName="text-[20px]"
          />
          <StatTile label="Администраторов" value={admins.length || "…"} icon={<ShieldCheck size={18} />} />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-full bg-surface-2 border border-hairline self-start max-w-full overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center h-9 px-4 rounded-full text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap",
                tab === t.id ? "bg-contrast text-contrast-ink" : "text-muted hover:text-ink"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ------------------------------------------------------------ Коды */}
        {tab === "codes" && (
          <Tile
            title="Коды доступа"
            icon={<Ticket size={20} />}
            hint="Код + почта = вход. При первом входе код привязывается к почте и дальше работает только с ней."
            action={<span className="text-[12px] text-faint tabular">{loading ? "…" : `${visibleCodes.length}`}</span>}
          >
            <form onSubmit={createCode} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 mb-5">
              <Input
                value={newCodeCustom}
                onChange={(e) => setNewCodeCustom(e.target.value)}
                placeholder="Свой код (пусто — случайный KZ-XXXX-XXXX)"
                className="font-mono"
                autoComplete="off"
              />
              <Input value={newCodeNote} onChange={(e) => setNewCodeNote(e.target.value)} placeholder="Для кого (заметка)" />
              <Button type="submit" icon={<Plus size={16} />} loading={busy === "create"}>
                Создать код
              </Button>
            </form>

            <div className="flex items-center gap-1 flex-wrap mb-4">
              {(
                [
                  ["all", "Все"],
                  ["free", "Свободные"],
                  ["used", "Привязанные"],
                  ["revoked", "Отозванные"],
                ] as const
              ).map(([id, label]) => (
                <Chip key={id} active={codeFilter === id} onClick={() => setCodeFilter(id)}>
                  {label}
                </Chip>
              ))}
            </div>

            {visibleCodes.length === 0 ? (
              <p className="text-[13.5px] text-muted py-6 text-center">Кодов нет — создайте первый.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {visibleCodes.map((c) => (
                  <div
                    key={c.code}
                    className="rounded-control border border-hairline bg-surface-2 px-3.5 py-3 flex items-center gap-3 flex-wrap"
                  >
                    <span className={cn("font-mono text-[14px] tracking-wider", c.revoked_at ? "text-faint line-through" : "text-ink")}>
                      {c.code}
                    </span>
                    {!c.revoked_at && <CopyButton value={c.code} />}
                    {c.revoked_at ? (
                      <Badge tone="neutral">отозван {formatDate(c.revoked_at)}</Badge>
                    ) : c.email ? (
                      <Badge tone="ok">{c.email}</Badge>
                    ) : (
                      <Badge tone="warn">свободен</Badge>
                    )}
                    {c.note && <span className="text-[12.5px] text-muted">{c.note}</span>}
                    <span className="text-[12px] text-faint tabular ml-auto">
                      создан {formatDate(c.created_at)}
                      {c.used_at ? ` · вход ${formatDate(c.used_at)}` : ""}
                    </span>
                    {!c.revoked_at && (
                      <IconButton title={c.email ? "Отозвать" : "Удалить"} onClick={() => setConfirmCode(c)}>
                        <Trash size={15} />
                      </IconButton>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Tile>
        )}

        {/* ------------------------------------------------------------ Пользователи */}
        {tab === "users" && (
          <Tile
            title="Пользователи"
            icon={<Users size={20} />}
            hint="Лимитов нет: каждый платит со своих ключей ElevenLabs и OpenAI."
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
                {(
                  [
                    ["all", "Все"],
                    ["active", "Активные"],
                    ["blocked", "Заблокированы"],
                  ] as const
                ).map(([id, label]) => (
                  <Chip key={id} active={userFilter === id} onClick={() => setUserFilter(id)}>
                    {label}
                  </Chip>
                ))}
              </div>
            </div>

            {visibleUsers.length === 0 ? (
              <p className="text-[13.5px] text-muted py-6 text-center">
                Пока никого: пользователь появляется после первого входа по коду.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {visibleUsers.map((user) => (
                  <div key={user.id} className="rounded-control border border-hairline bg-surface-2 p-3.5 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-medium text-ink break-all">{user.email}</span>
                          {user.status === "blocked" ? (
                            <Badge tone="danger" icon={<Prohibit size={14} weight="fill" />}>
                              Заблокирован
                            </Badge>
                          ) : (
                            <Badge tone="ok">Активен</Badge>
                          )}
                        </div>
                        <div className="text-[12px] text-muted mt-1 tabular">
                          первый вход {formatDate(user.createdAt)} · последний {formatDate(user.lastLoginAt)} · фильмов{" "}
                          {user.videosCount}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[12px] shrink-0">
                        <Badge tone={user.hasElevenLabsKey ? "ok" : "outline"} icon={<Key size={12} />}>
                          ElevenLabs
                        </Badge>
                        <Badge tone={user.hasOpenAiKey ? "ok" : "outline"} icon={<Key size={12} />}>
                          OpenAI
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[12.5px] text-muted flex-wrap">
                      <Ticket size={14} />
                      {user.code ? (
                        <>
                          <span className="font-mono text-ink tracking-wider">{user.code}</span>
                          <CopyButton value={user.code} title="Скопировать код доступа" />
                        </>
                      ) : (
                        <span className="text-faint">кода нет — вход закрыт, выдайте новый</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Button size="sm" variant="secondary" onClick={() => rotateCode(user)} loading={busy === user.id + "rotate_code"}>
                        Новый код
                      </Button>
                      {(user.hasElevenLabsKey || user.hasOpenAiKey) && (
                        <Button size="sm" variant="secondary" onClick={() => act(user, "reset_keys")} loading={busy === user.id + "reset_keys"}>
                          Сбросить ключи
                        </Button>
                      )}
                      {user.status === "blocked" ? (
                        <Button size="sm" variant="secondary" onClick={() => act(user, "unblock")} loading={busy === user.id + "unblock"}>
                          Разблокировать
                        </Button>
                      ) : (
                        <Button size="sm" variant="danger" onClick={() => act(user, "block")} loading={busy === user.id + "block"}>
                          Заблокировать
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(user)}>
                        <Trash size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Tile>
        )}

        {/* ------------------------------------------------------------ Фильмы */}
        {tab === "videos" && (
          <Tile
            title="Фильмы"
            icon={<FilmStrip size={20} />}
            hint="Все готовые фильмы со стоимостью по ценам провайдеров. Пользователь стоимость не видит."
            action={
              <span className="text-[12px] text-faint tabular">
                {loading ? "…" : `${visibleVideos.length} · ${formatUsd(videosTotalUsd)}`}
              </span>
            }
          >
            <div className="relative mb-4">
              <MagnifyingGlass size={16} className="text-faint absolute left-3.5 top-1/2 -translate-y-1/2" />
              <Input
                value={videoSearch}
                onChange={(e) => setVideoSearch(e.target.value)}
                placeholder="Поиск по теме или почте"
                className="pl-10"
              />
            </div>

            {visibleVideos.length === 0 ? (
              <p className="text-[13.5px] text-muted py-6 text-center">Готовых фильмов пока нет.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {visibleVideos.map((v) => (
                  <div key={v.id} className="rounded-control border border-hairline bg-surface-2 px-3.5 py-3 flex flex-col gap-1.5">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[14px] font-medium text-ink truncate max-w-full">{v.topic}</span>
                      <span className="text-[12px] text-faint tabular ml-auto">{formatDate(v.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap text-[12.5px] text-muted tabular">
                      <span>{v.email || "—"}</span>
                      <span>{formatDuration(v.durationSeconds)}</span>
                      <span>{v.scenes} кадров</span>
                      {v.mediaPurgedAt && <Badge tone="neutral">медиа стёрты</Badge>}
                      <span className="text-ink">{formatCostCompact(v.cost)}</span>
                      <span className="ml-auto flex items-center gap-1.5">
                        {v.cost && (
                          <IconButton title="Расчёт стоимости" onClick={() => setCostFor({ title: v.topic, cost: v.cost! })}>
                            <Receipt size={15} />
                          </IconButton>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Play size={14} weight="fill" />}
                          onClick={() => openVideo(v)}
                          loading={openingId === v.id}
                          disabled={!!v.mediaPurgedAt}
                        >
                          Открыть
                        </Button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Tile>
        )}

        {/* ------------------------------------------------------------ Журнал */}
        {tab === "logs" && (
          <Tile title="Журнал отказов" hint="Упавшие и зависшие генерации. Идущие сейчас сюда не попадают.">
            <div className="flex items-center gap-1 flex-wrap mb-4">
              {["all", "llm", "tts", "image", "render", "auth"].map((s) => (
                <Chip key={s} active={stageFilter === s} onClick={() => setStageFilter(s)}>
                  {s === "all" ? "Все" : STAGE_LABELS[s]}
                </Chip>
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

        {/* ------------------------------------------------------------ Администраторы */}
        {tab === "admins" && (
          <Tile
            title="Администраторы"
            icon={<ShieldCheck size={20} />}
            hint="Каждый входит своей почтой и общим кодом администратора — на сайте его сразу перебрасывает сюда."
          >
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
                        главный, из настроек сервера
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

      {/* Выданный код доступа */}
      <Modal
        open={!!issuedCode}
        onClose={() => setIssuedCode(null)}
        title="Код доступа"
        hint={issuedCode?.email || issuedCode?.note || "свободный код"}
        icon={
          <IconTile size="md">
            <Ticket size={20} />
          </IconTile>
        }
        footer={
          <Button block onClick={() => setIssuedCode(null)}>
            Готово
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-center gap-3 py-4 rounded-control bg-surface-2 border border-hairline">
            <span className="font-mono text-[22px] tracking-wider text-ink">{issuedCode?.code}</span>
            {issuedCode && <CopyButton value={issuedCode.code} />}
          </div>
          <p className="text-[13px] text-muted">
            {issuedCode?.email
              ? `Работает только с почтой ${issuedCode.email}; старый код этой почты больше не действует.`
              : "Передайте код лично. При первом входе он привяжется к почте, с которой вошли, и дальше будет работать только с ней."}
          </p>
        </div>
      </Modal>

      {/* Фильм пользователя */}
      <Modal
        open={!!opened}
        onClose={() => setOpened(null)}
        size="xl"
        title={opened?.topic}
        hint={
          opened ? (
            <span className="tabular">
              {opened.email || "—"} · {opened.scenes.length} кадров · {formatCostCompact(opened.cost)}
            </span>
          ) : undefined
        }
        icon={
          <IconTile size="md">
            <FilmStrip size={20} weight="fill" />
          </IconTile>
        }
        footer={
          opened?.cost ? (
            <Button variant="secondary" block icon={<Receipt size={16} />} onClick={() => setCostFor({ title: opened.topic, cost: opened.cost! })}>
              Расчёт стоимости
            </Button>
          ) : undefined
        }
      >
        {opened && (
          <div className="rounded-control overflow-hidden bg-black">
            <VideoPlayer key={opened.id} title={opened.topic} scenes={opened.scenes} orientation={opened.orientation} />
          </div>
        )}
      </Modal>

      <CostModal open={!!costFor} onClose={() => setCostFor(null)} title={costFor?.title || ""} cost={costFor?.cost} />

      <ConfirmDialog
        open={!!confirmCode}
        title={confirmCode?.email ? "Отозвать код?" : "Удалить код?"}
        description={
          confirmCode?.email
            ? `${confirmCode.email} потеряет вход; аккаунт и фильмы останутся, новый код можно выдать во вкладке «Пользователи».`
            : `Код ${confirmCode?.code} никем не использован и будет удалён.`
        }
        onCancel={() => setConfirmCode(null)}
        onConfirm={dropCode}
        loading={busy === "code" + (confirmCode?.code || "")}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Удалить пользователя?"
        description={`${confirmDelete?.email}: аккаунт, ключи, его фильмы и файлы будут удалены безвозвратно.`}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        loading={busy === (confirmDelete?.id || "") + "delete"}
      />
    </div>
  );
}

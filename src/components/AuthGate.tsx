"use client";

import React, { useEffect, useState } from "react";
import {
  LockKey,
  Key,
  ArrowRight,
  SpeakerHigh,
  ShieldWarning,
  EnvelopeSimple,
  UserPlus,
} from "@phosphor-icons/react";
import { Alert, Badge, Button, Field, IconTile, Input, Tile, cn } from "@/components/ui";
import type { StudioUser } from "@/lib/types";
import { setStudioSession } from "@/lib/client/session";

export interface AuthNotice {
  tone: "danger" | "warn" | "ok" | "info";
  text: string;
}

interface AuthGateProps {
  onSuccess: (user: StudioUser) => void;
  /** Сообщение от страницы: сессия истекла, заявка ещё не одобрена и т.п. */
  notice?: AuthNotice | null;
}

type Tab = "login" | "register";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "login", label: "Вход", icon: <LockKey size={15} weight="fill" /> },
  { id: "register", label: "Регистрация", icon: <UserPlus size={15} weight="fill" /> },
];

function toneForStatus(status: string | undefined): AuthNotice["tone"] {
  if (status === "pending" || status === "frozen" || status === "invited") return "warn";
  if (status === "rejected" || status === "blocked") return "danger";
  return "info";
}

/**
 * Вход в студию: почта + инвайт-код. Регистрация: почта + инвайт-код +
 * ключ ElevenLabs; после неё доступ открывает администратор.
 */
export const AuthGate: React.FC<AuthGateProps> = ({ onSuccess, notice }) => {
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [elevenLabsKey, setElevenLabsKey] = useState("");

  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<AuthNotice | null>(notice ?? null);
  const [attemptsLeft, setAttemptsLeft] = useState<number>(10);
  const [maxAttempts, setMaxAttempts] = useState<number>(10);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);

  useEffect(() => {
    setInfo(notice ?? null);
  }, [notice]);

  useEffect(() => {
    let cancelled = false;
    setCheckingStatus(true);
    fetch(`/api/auth?kind=${tab}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setAttemptsLeft(data.attemptsLeft ?? 10);
        setMaxAttempts(data.maxAttempts ?? 10);
        setIsBlocked(!!data.isBlocked);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCheckingStatus(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setError(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !code.trim() || isBlocked) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (typeof data.attemptsLeft === "number") setAttemptsLeft(data.attemptsLeft);
        if (data.isBlocked) setIsBlocked(true);
        if (res.status === 403) {
          setInfo({ tone: toneForStatus(data.status), text: data.error || "Доступ закрыт" });
        } else {
          setError(data.error || "Не удалось войти");
        }
        return;
      }

      if (data.success && data.token && data.user) {
        setStudioSession(data.token, data.user);
        onSuccess(data.user);
      }
    } catch (err: any) {
      setError(err.message || "Ошибка авторизации");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !code.trim() || !elevenLabsKey.trim() || isBlocked) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
          elevenLabsKey: elevenLabsKey.trim(),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (typeof data.attemptsLeft === "number") setAttemptsLeft(data.attemptsLeft);
        if (data.isBlocked) setIsBlocked(true);
        if (res.status === 403) {
          setInfo({ tone: toneForStatus(data.status), text: data.error || "Доступ закрыт" });
        } else {
          setError(data.error || "Не удалось отправить заявку");
        }
        return;
      }

      setElevenLabsKey("");
      setInfo({
        tone: "ok",
        text:
          data.message ||
          "Заявка отправлена. Когда администратор одобрит доступ, войдите по почте и инвайт-коду.",
      });
      setTab("login");
    } catch (err: any) {
      setError(err.message || "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  };

  const isRegister = tab === "register";
  const canSubmit = isRegister
    ? !!email.trim() && !!code.trim() && !!elevenLabsKey.trim()
    : !!email.trim() && !!code.trim();

  return (
    <div className="w-full flex-1 flex items-center justify-center px-5 py-10 sm:py-14">
      <div className="w-full max-w-[460px]">
        <Tile className="p-6 sm:p-9">
          <div className="flex flex-col items-center text-center gap-3 mb-6">
            <IconTile size="lg">
              <LockKey size={24} weight="fill" />
            </IconTile>
            <h1 className="text-[24px] sm:text-[26px] font-bold tracking-tight text-ink leading-tight">
              {isRegister ? "Заявка на доступ" : "Вход в студию"}
            </h1>
            <p className="text-[13.5px] text-muted leading-relaxed max-w-[360px]">
              {isRegister
                ? "Инвайт-код выдаёт администратор. После заявки доступ откроется, когда её одобрят."
                : "Введите почту и инвайт-код, с которыми регистрировались."}
            </p>
          </div>

          <div
            role="tablist"
            className="flex items-center gap-1 p-1 rounded-full bg-surface-2 border border-hairline mb-5"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => switchTab(t.id)}
                className={cn(
                  "flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-full text-[13px] font-medium transition-colors cursor-pointer",
                  tab === t.id ? "bg-contrast text-contrast-ink" : "text-muted hover:text-ink"
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {info && (
            <Alert tone={info.tone} className="mb-4">
              {info.text}
            </Alert>
          )}

          {isBlocked ? (
            <Alert
              tone="danger"
              title={
                <span className="inline-flex items-center gap-2">
                  <ShieldWarning size={18} />
                  Доступ временно заблокирован
                </span>
              }
            >
              Слишком много неудачных попыток с вашего адреса. Попробуйте позже.
            </Alert>
          ) : (
            <form onSubmit={isRegister ? handleRegister : handleLogin} className="flex flex-col gap-4">
              {error && <Alert tone="danger">{error}</Alert>}

              <Field label="Почта">
                <div className="relative">
                  <EnvelopeSimple
                    size={18}
                    className="text-faint absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                  <Input
                    type="email"
                    required
                    autoComplete="email"
                    disabled={loading}
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-11"
                  />
                </div>
              </Field>

              <Field
                label="Инвайт-код"
                aside={
                  <Badge tone={attemptsLeft <= 3 ? "danger" : "outline"}>
                    Попыток: {attemptsLeft}/{maxAttempts}
                  </Badge>
                }
              >
                <div className="relative">
                  <Key
                    size={18}
                    className="text-faint absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                  <Input
                    type={isRegister ? "text" : "password"}
                    required
                    autoComplete="off"
                    disabled={loading}
                    placeholder="VIP-XXXXX"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="pl-11 font-mono tracking-wider"
                  />
                </div>
              </Field>

              {isRegister && (
                <Field
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <SpeakerHigh size={16} className="text-muted" />
                      Ваш ключ ElevenLabs
                    </span>
                  }
                  hint="Хранится в зашифрованном виде и используется только для озвучки ваших фильмов."
                >
                  <div className="relative">
                    <Key
                      size={18}
                      className="text-faint absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    />
                    <Input
                      type="text"
                      required
                      autoComplete="off"
                      disabled={loading}
                      placeholder="sk_..."
                      value={elevenLabsKey}
                      onChange={(e) => setElevenLabsKey(e.target.value)}
                      className="pl-11 font-mono text-[13px]"
                    />
                  </div>
                </Field>
              )}

              <Button
                type="submit"
                size="lg"
                block
                loading={loading}
                disabled={checkingStatus || !canSubmit}
                iconRight={!loading ? <ArrowRight size={18} /> : undefined}
                className="mt-1"
              >
                {loading ? "Проверка..." : isRegister ? "Отправить заявку" : "Войти в студию"}
              </Button>
            </form>
          )}
        </Tile>
      </div>
    </div>
  );
};

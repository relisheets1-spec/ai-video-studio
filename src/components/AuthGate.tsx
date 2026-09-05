"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  EnvelopeSimple,
  LockKey,
  PaperPlaneTilt,
  Ticket,
} from "@phosphor-icons/react";
import { Alert, Button, Field, IconTile, Input, Tile } from "@/components/ui";
import type { StudioUser } from "@/lib/types";

export interface AuthNotice {
  tone: "danger" | "warn" | "ok" | "info";
  text: string;
}

interface AuthGateProps {
  onSuccess: (user: StudioUser) => void;
  /** Сообщение от страницы: сессия истекла, доступ закрыт и т.п. */
  notice?: AuthNotice | null;
}

type Step = "site" | "email" | "invite" | "code" | "info";

const RESEND_COOLDOWN_SEC = 60;

/**
 * Вход без пароля.
 *
 *   почта → (код приглашения, если заявку только что одобрили) → код с письма.
 *
 * Незнакомая почта превращается в заявку: администратор одобрит её и выдаст
 * код приглашения. Ничего секретного на клиенте не хранится — сессию ставит
 * сервер в HttpOnly-cookie.
 */
export const AuthGate: React.FC<AuthGateProps> = ({ onSuccess, notice }) => {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [invite, setInvite] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<AuthNotice | null>(notice ?? null);
  const [cooldown, setCooldown] = useState(0);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setInfo(notice ?? null);
  }, [notice]);

  // Заглушка сайта (SITE_PASSWORD): пока не снята, формы входа не показываем.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/site")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.enabled && !data?.unlocked) setStep("site");
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeInputRef.current?.focus();
  }, [step]);

  const post = async (url: string, body: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  const applyState = (data: any) => {
    if (data?.state === "invite") {
      setStep("invite");
      setInfo({ tone: "info", text: data.message });
      return;
    }
    if (data?.state === "code") {
      setStep("code");
      setInfo({ tone: "ok", text: data.message || "Код отправлен на почту." });
      setCooldown(RESEND_COOLDOWN_SEC);
      return;
    }
    setStep("info");
    setInfo({ tone: data?.state === "requested" ? "ok" : "warn", text: data?.message || "" });
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { res, data } = await post("/api/site", { password });
      if (!res.ok) throw new Error(data.error || "Неверный пароль");
      setPassword("");
      setStep("email");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { res, data } = await post("/api/auth/start", { email: email.trim() });
      if (!res.ok) {
        if (res.status === 403) {
          setStep("info");
          setInfo({ tone: "danger", text: data.error || "Доступ закрыт" });
          return;
        }
        throw new Error(data.error || "Не удалось продолжить");
      }
      applyState(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { res, data } = await post("/api/auth/redeem", { email: email.trim(), invite: invite.trim() });
      if (!res.ok) throw new Error(data.error || "Код приглашения не подошёл");
      setInvite("");
      applyState(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { res, data } = await post("/api/auth/verify", { email: email.trim(), code: code.trim() });
      if (!res.ok) throw new Error(data.error || "Неверный код");
      if (data.user) onSuccess(data.user);
    } catch (err: any) {
      setError(err.message);
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setLoading(true);
    setError(null);
    try {
      const { res, data } = await post("/api/auth/start", { email: email.trim() });
      if (!res.ok) throw new Error(data.error || "Не удалось отправить код");
      applyState(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const restart = () => {
    setStep("email");
    setCode("");
    setInvite("");
    setError(null);
    setInfo(null);
  };

  const heading =
    step === "site"
      ? "Сайт закрыт"
      : step === "invite"
        ? "Код приглашения"
        : step === "code"
          ? "Код с почты"
          : step === "info"
            ? "Заявка"
            : "Вход в студию";

  const subtitle =
    step === "site"
      ? "Введите общий пароль сайта, чтобы открыть форму входа."
      : step === "invite"
        ? `Администратор одобрил заявку для ${email} и выдал одноразовый код.`
        : step === "code"
          ? `Шестизначный код отправлен на ${email}. Он действует 10 минут.`
          : step === "info"
            ? ""
            : "Введите почту. Если вас ещё нет в студии, отправим заявку администратору.";

  return (
    <div className="w-full flex-1 flex items-center justify-center px-5 py-10 sm:py-14">
      <div className="w-full max-w-[460px]">
        <Tile className="p-6 sm:p-9">
          <div className="flex flex-col items-center text-center gap-3 mb-6">
            <IconTile size="lg">
              {step === "code" ? (
                <PaperPlaneTilt size={24} weight="fill" />
              ) : step === "invite" ? (
                <Ticket size={24} weight="fill" />
              ) : (
                <LockKey size={24} weight="fill" />
              )}
            </IconTile>
            <h1 className="text-[24px] sm:text-[26px] font-bold tracking-tight text-ink leading-tight">{heading}</h1>
            {subtitle && (
              <p className="text-[13.5px] text-muted leading-relaxed max-w-[360px]">{subtitle}</p>
            )}
          </div>

          {info && (
            <Alert tone={info.tone} className="mb-4">
              {info.text}
            </Alert>
          )}
          {error && (
            <Alert tone="danger" className="mb-4">
              {error}
            </Alert>
          )}

          {booting ? null : step === "site" ? (
            <form onSubmit={handleUnlock} className="flex flex-col gap-4">
              <Field label="Пароль сайта">
                <Input
                  type="password"
                  required
                  autoFocus
                  autoComplete="off"
                  disabled={loading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Button type="submit" size="lg" block loading={loading} disabled={!password.trim()}>
                Открыть
              </Button>
            </form>
          ) : step === "email" ? (
            <form onSubmit={handleEmail} className="flex flex-col gap-4">
              <Field label="Почта">
                <div className="relative">
                  <EnvelopeSimple
                    size={18}
                    className="text-faint absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                  <Input
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    disabled={loading}
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-11"
                  />
                </div>
              </Field>
              <Button
                type="submit"
                size="lg"
                block
                loading={loading}
                disabled={!email.trim()}
                iconRight={!loading ? <ArrowRight size={18} /> : undefined}
              >
                Продолжить
              </Button>
            </form>
          ) : step === "invite" ? (
            <form onSubmit={handleInvite} className="flex flex-col gap-4">
              <Field label="Код приглашения" hint="Одноразовый, действует 7 дней и только для вашей почты.">
                <div className="relative">
                  <Ticket size={18} className="text-faint absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    required
                    autoFocus
                    autoComplete="off"
                    disabled={loading}
                    placeholder="KZ-XXXX-XXXX"
                    value={invite}
                    onChange={(e) => setInvite(e.target.value.toUpperCase())}
                    className="pl-11 font-mono tracking-wider"
                  />
                </div>
              </Field>
              <Button type="submit" size="lg" block loading={loading} disabled={!invite.trim()}>
                Подтвердить
              </Button>
              <BackLink onClick={restart} />
            </form>
          ) : step === "code" ? (
            <form onSubmit={handleCode} className="flex flex-col gap-4">
              <Field label="Код из письма">
                <Input
                  ref={codeInputRef}
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  disabled={loading}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="text-center text-[22px] font-mono tracking-[0.4em]"
                />
              </Field>
              <Button type="submit" size="lg" block loading={loading} disabled={code.length !== 6}>
                Войти
              </Button>
              <div className="flex items-center justify-between">
                <BackLink onClick={restart} />
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={cooldown > 0 || loading}
                  className="text-[13px] text-muted hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {cooldown > 0 ? `Отправить снова через ${cooldown} с` : "Отправить код снова"}
                </button>
              </div>
            </form>
          ) : (
            <BackLink onClick={restart} />
          )}
        </Tile>
      </div>
    </div>
  );
};

const BackLink: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink cursor-pointer"
  >
    <ArrowLeft size={14} />
    Другая почта
  </button>
);

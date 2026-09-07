"use client";

import React, { useEffect, useState } from "react";
import { ArrowRight, EnvelopeSimple, Key, LockKey } from "@phosphor-icons/react";
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

/**
 * Одна форма для всех: почта + код.
 *
 * Код доступа выдаёт администратор; при первом входе он привязывается к почте
 * и дальше работает как постоянный пропуск. Почта администратора с его кодом
 * ведёт сразу в панель. Ничего секретного на клиенте не хранится — сессию
 * ставит сервер в HttpOnly-cookie.
 */
export const AuthGate: React.FC<AuthGateProps> = ({ onSuccess, notice }) => {
  const [locked, setLocked] = useState(false);
  const [booting, setBooting] = useState(true);
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<AuthNotice | null>(notice ?? null);

  useEffect(() => {
    setInfo(notice ?? null);
  }, [notice]);

  // Заглушка сайта (SITE_PASSWORD): пока не снята, форму входа не показываем.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/site")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.enabled && !data?.unlocked) setLocked(true);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { res, data } = await post("/api/site", { password });
      if (!res.ok) throw new Error(data.error || "Неверный пароль");
      setPassword("");
      setLocked(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { res, data } = await post("/api/auth/login", { email: email.trim(), code: code.trim() });
      if (!res.ok) throw new Error(data.error || "Не удалось войти");
      if (data.role === "admin") {
        window.location.href = "/admin";
        return;
      }
      if (data.user) onSuccess(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex-1 flex items-center justify-center px-5 py-10 sm:py-14">
      <div className="w-full max-w-[440px]">
        <Tile className="p-6 sm:p-9">
          <div className="flex flex-col items-center text-center gap-3 mb-6">
            <IconTile size="lg">
              <LockKey size={24} weight="fill" />
            </IconTile>
            <h1 className="text-[24px] sm:text-[26px] font-bold tracking-tight text-ink leading-tight">
              {locked ? "Сайт закрыт" : "Вход"}
            </h1>
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

          {booting ? null : locked ? (
            <form onSubmit={handleUnlock} className="flex flex-col gap-4">
              <Field label="Пароль">
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
          ) : (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <Field label="Почта">
                <div className="relative">
                  <EnvelopeSimple size={18} className="text-faint absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
              <Field label="Код">
                <div className="relative">
                  <Key size={18} className="text-faint absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    type="password"
                    required
                    autoComplete="current-password"
                    disabled={loading}
                    placeholder="KZ-XXXX-XXXX"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="pl-11 font-mono tracking-wider"
                  />
                </div>
              </Field>
              <Button
                type="submit"
                size="lg"
                block
                loading={loading}
                disabled={!email.trim() || !code.trim()}
                iconRight={!loading ? <ArrowRight size={18} /> : undefined}
              >
                Войти
              </Button>
            </form>
          )}
        </Tile>
      </div>
    </div>
  );
};

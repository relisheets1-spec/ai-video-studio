"use client";

import React, { useState, useEffect } from "react";
import {
  LockKey,
  Key,
  ArrowRight,
  SpeakerHigh,
  ShieldWarning,
} from "@phosphor-icons/react";
import {
  Alert,
  Badge,
  Button,
  Field,
  IconTile,
  Input,
  Tile,
} from "@/components/ui";

interface AuthGateProps {
  onSuccess: (user: any, elevenLabsKey: string) => void;
  title?: string;
  description?: string;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  onSuccess,
  title = "Вход в студию",
  description,
}) => {
  const [password, setPassword] = useState("");
  const [elevenLabsKey, setElevenLabsKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number>(10);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);

  useEffect(() => {
    checkStatus();
    if (typeof window !== "undefined") {
      const savedKey = localStorage.getItem("elevenlabs_user_key");
      if (savedKey) setElevenLabsKey(savedKey);
    }
  }, []);

  const checkStatus = async () => {
    try {
      const res = await fetch("/api/auth");
      const data = await res.json();
      if (res.ok) {
        setAttemptsLeft(data.attemptsLeft ?? 10);
        setIsBlocked(data.isBlocked ?? false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isBlocked) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAttemptsLeft(data.attemptsLeft ?? 0);
        setIsBlocked(data.isBlocked ?? false);
        throw new Error(data.error || "Неверный пароль");
      }

      if (data.success) {
        const cleanKey = elevenLabsKey.trim();
        if (cleanKey) {
          localStorage.setItem("elevenlabs_user_key", cleanKey);
        }
        localStorage.setItem("ai_video_auth_token", data.token);
        localStorage.setItem("ai_video_user", JSON.stringify(data.user));
        onSuccess(data.user, cleanKey);
      }
    } catch (err: any) {
      setError(err.message || "Ошибка авторизации");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex-1 flex items-center justify-center px-5 py-14">
      <div className="w-full max-w-[440px]">
        <Tile className="p-8 sm:p-9">
          <div className="flex flex-col items-center text-center gap-3 mb-7">
            <IconTile size="lg">
              <LockKey size={24} weight="fill" />
            </IconTile>
            <h1 className="text-[26px] font-bold tracking-tight text-ink leading-tight">
              {title}
            </h1>
            {description && (
              <p className="text-[13.5px] text-muted leading-relaxed max-w-[340px]">
                {description}
              </p>
            )}
          </div>

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
              Превышен лимит (10 неверных попыток за сутки). В целях безопасности
              ваш IP заблокирован на 24 часа.
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {error && <Alert tone="danger">{error}</Alert>}

              <Field
                label="Пароль или инвайт-код"
                aside={
                  <Badge tone={attemptsLeft <= 3 ? "danger" : "outline"}>
                    Попыток: {attemptsLeft}/10
                  </Badge>
                }
              >
                <div className="relative">
                  <Key
                    size={18}
                    className="text-faint absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                  <Input
                    type="password"
                    required
                    disabled={loading || checkingStatus}
                    placeholder="••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-11 font-mono tracking-wider"
                  />
                </div>
              </Field>

              <Field
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <SpeakerHigh size={16} className="text-muted" />
                    Ключ ElevenLabs
                  </span>
                }
              >
                <div className="relative">
                  <Key
                    size={18}
                    className="text-faint absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                  <Input
                    type="text"
                    disabled={loading || checkingStatus}
                    placeholder="sk_..."
                    value={elevenLabsKey}
                    onChange={(e) => setElevenLabsKey(e.target.value)}
                    className="pl-11 font-mono text-[13px]"
                  />
                </div>
              </Field>

              <Button
                type="submit"
                size="lg"
                block
                loading={loading}
                disabled={checkingStatus || !password.trim()}
                iconRight={!loading ? <ArrowRight size={18} /> : undefined}
                className="mt-1"
              >
                {loading ? "Проверка..." : "Войти в Студию"}
              </Button>
            </form>
          )}
        </Tile>
      </div>
    </div>
  );
};

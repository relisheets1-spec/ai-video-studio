"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { VideoStudio } from "@/components/VideoStudio";
import { AuthGate, type AuthNotice } from "@/components/AuthGate";
import { Spinner } from "@/components/ui";
import type { StudioUser } from "@/lib/types";
import {
  authFetch,
  clearStudioSession,
  getStudioToken,
  purgeLegacyStorage,
  setStoredUser,
  SESSION_LOST_EVENT,
  type SessionLostDetail,
} from "@/lib/client/session";

function noticeFor(detail: SessionLostDetail | undefined): AuthNotice {
  const status = detail?.status;
  if (status === "pending") return { tone: "warn", text: detail?.error || "Заявка ожидает одобрения администратора." };
  if (status === "frozen") return { tone: "warn", text: detail?.error || "Аккаунт временно заморожен." };
  if (status === "rejected" || status === "blocked") {
    return { tone: "danger", text: detail?.error || "Доступ закрыт администратором." };
  }
  return { tone: "info", text: detail?.error || "Сессия истекла — войдите заново." };
}

export default function HomePage() {
  const [user, setUser] = useState<StudioUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<AuthNotice | null>(null);

  // Сессия подтверждается сервером: токен в localStorage сам по себе ничего не значит.
  const refreshSession = useCallback(async () => {
    if (!getStudioToken()) {
      setUser(null);
      return;
    }
    try {
      const res = await authFetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setStoredUser(data.user);
        }
      }
      // 401/403 обрабатывает authFetch: чистит сессию и шлёт событие.
    } catch (e) {
      console.error("Session refresh error:", e);
    }
  }, []);

  useEffect(() => {
    purgeLegacyStorage();
    refreshSession().finally(() => setLoading(false));

    const onLost = (e: Event) => {
      setUser(null);
      setNotice(noticeFor((e as CustomEvent<SessionLostDetail>).detail));
    };
    const onFocus = () => {
      if (getStudioToken()) refreshSession();
    };

    window.addEventListener(SESSION_LOST_EVENT, onLost);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(SESSION_LOST_EVENT, onLost);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshSession]);

  const handleLogout = () => {
    clearStudioSession();
    setUser(null);
    setNotice(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={28} className="text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={user} onLogout={user ? handleLogout : undefined} />

      <main className="flex-1 flex flex-col w-full">
        <div className="w-full">
          {!user ? (
            <AuthGate
              notice={notice}
              onSuccess={(u) => {
                setNotice(null);
                setUser(u);
              }}
            />
          ) : (
            <VideoStudio
              user={user}
              onUserUpdate={(updated) => {
                setUser(updated);
                setStoredUser(updated);
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}

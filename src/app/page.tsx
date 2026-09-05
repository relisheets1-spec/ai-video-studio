"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { VideoStudio } from "@/components/VideoStudio";
import { AuthGate, type AuthNotice } from "@/components/AuthGate";
import { Spinner } from "@/components/ui";
import type { StudioUser } from "@/lib/types";
import {
  fetchSession,
  logout,
  SESSION_LOST_EVENT,
  type SessionLostDetail,
} from "@/lib/client/session";

function noticeFor(detail: SessionLostDetail | undefined): AuthNotice {
  const status = detail?.status;
  if (status === "pending" || status === "invited") {
    return { tone: "warn", text: detail?.error || "Заявка ожидает одобрения администратора." };
  }
  if (status === "rejected" || status === "blocked") {
    return { tone: "danger", text: detail?.error || "Доступ закрыт администратором." };
  }
  return { tone: "info", text: detail?.error || "Сессия истекла — войдите заново." };
}

export default function HomePage() {
  const [user, setUser] = useState<StudioUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<AuthNotice | null>(null);

  // Сессию подтверждает сервер: cookie сама по себе ничего не значит,
  // статус и остаток генераций перечитываются на каждом запросе.
  const refreshSession = useCallback(async () => {
    const fresh = await fetchSession();
    setUser(fresh);
  }, []);

  useEffect(() => {
    refreshSession().finally(() => setLoading(false));

    const onLost = (e: Event) => {
      setUser(null);
      setNotice(noticeFor((e as CustomEvent<SessionLostDetail>).detail));
    };
    const onFocus = () => {
      refreshSession();
    };

    window.addEventListener(SESSION_LOST_EVENT, onLost);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(SESSION_LOST_EVENT, onLost);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshSession]);

  const handleLogout = async () => {
    await logout();
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
            <VideoStudio user={user} onUserUpdate={setUser} />
          )}
        </div>
      </main>
    </div>
  );
}

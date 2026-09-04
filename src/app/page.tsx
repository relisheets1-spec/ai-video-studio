"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { VideoStudio } from "@/components/VideoStudio";
import { AuthGate } from "@/components/AuthGate";
import { Spinner } from "@/components/ui";

export default function HomePage() {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const syncUserFromDb = async (secretCode?: string, userId?: string) => {
    try {
      const params = new URLSearchParams();
      if (userId) params.set("userId", userId);
      if (secretCode) params.set("secretCode", secretCode);
      const res = await fetch(`/api/auth?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.user) {
        setUser(data.user);
        localStorage.setItem("ai_video_user", JSON.stringify(data.user));
      }
    } catch (e) {
      console.error("Balance sync error:", e);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("ai_video_auth_token");
    const storedUser = localStorage.getItem("ai_video_user");

    if (token && storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser(parsed);
        if (parsed.secretCode || parsed.id) {
          syncUserFromDb(parsed.secretCode, parsed.id);
        }
      } catch {
        localStorage.removeItem("ai_video_auth_token");
        localStorage.removeItem("ai_video_user");
      }
    }
    setLoading(false);

    const onFocus = () => {
      const u = localStorage.getItem("ai_video_user");
      if (u) {
        try {
          const parsed = JSON.parse(u);
          if (parsed.secretCode || parsed.id) syncUserFromDb(parsed.secretCode, parsed.id);
        } catch {}
      }
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("ai_video_auth_token");
    localStorage.removeItem("ai_video_user");
    localStorage.removeItem("ai_video_admin_token");
    setUser(null);
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
            <AuthGate onSuccess={(u) => setUser(u)} />
          ) : (
            <VideoStudio user={user} onUserUpdate={(updated) => setUser(updated)} />
          )}
        </div>
      </main>
    </div>
  );
}


"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { VideoStudio } from "@/components/VideoStudio";
import { AuthGate } from "@/components/AuthGate";

export default function HomePage() {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("ai_video_auth_token");
    const storedUser = localStorage.getItem("ai_video_user");

    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem("ai_video_auth_token");
        localStorage.removeItem("ai_video_user");
      }
    }
    setLoading(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("ai_video_auth_token");
    localStorage.removeItem("ai_video_user");
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b] text-[#ededed]">
        <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b] text-[#ededed]">
      <Navbar user={user} onLogout={user ? handleLogout : undefined} />

      <main className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full">
          {!user ? (
            <AuthGate
              title="Вход в AI Video Studio"
              description="Введите пароль доступа для создания видеоисторий (1080p @ 30 FPS) с озвучкой ElevenLabs."
              onSuccess={(u) => setUser(u)}
            />
          ) : (
            <VideoStudio user={user} onUserUpdate={(updated) => setUser(updated)} />
          )}
        </div>
      </main>
    </div>
  );
}


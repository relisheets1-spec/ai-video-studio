"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { AuthGate } from "@/components/AuthGate";
import { VideoStudio } from "@/components/VideoStudio";

export default function HomePage() {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ai_video_user");
      if (saved) {
        const parsed = JSON.parse(saved);
        setUser(parsed);
        fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check", secretCode: parsed.secretCode }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data?.user) {
              setUser(data.user);
              localStorage.setItem("ai_video_user", JSON.stringify(data.user));
            }
          })
          .catch((e) => console.log("Session error:", e));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("ai_video_user");
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
        <div className="w-6 h-6 rounded-full border border-white/30 border-t-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b] text-[#ededed]">
      <Navbar user={user} onLogout={handleLogout} />

      <main className="flex-1 flex flex-col items-center justify-center p-4">
        {user && user.status === "approved" ? (
          <div className="w-full">
            <VideoStudio
              user={user}
              onUserUpdate={(updated) => {
                setUser(updated);
                localStorage.setItem("ai_video_user", JSON.stringify(updated));
              }}
            />
          </div>
        ) : (
          <AuthGate onSuccess={(u) => setUser(u)} />
        )}
      </main>
    </div>
  );
}

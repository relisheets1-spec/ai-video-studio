"use client";

import React, { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { VideoStudio } from "@/components/VideoStudio";

const EXPERIMENT_USER = {
  id: "guest-experiment-user",
  userName: "Экспериментатор",
  secretCode: "EXPERIMENT-MODE",
  status: "approved",
  remaining: 99,
  generationsLimit: 100,
  generationsUsed: 1,
};

export default function HomePage() {
  const [user, setUser] = useState(EXPERIMENT_USER);

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b] text-[#ededed]">
      <Navbar user={user} />

      <main className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full">
          <VideoStudio
            user={user}
            onUserUpdate={(updated) => setUser(updated)}
          />
        </div>
      </main>
    </div>
  );
}


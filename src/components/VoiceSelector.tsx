"use client";

import React, { useState, useRef } from "react";
import { Play, Pause, Volume2 } from "lucide-react";
import { VoiceOption } from "@/lib/types";

interface VoiceSelectorProps {
  selectedVoice: VoiceOption;
  onSelectVoice: (voice: VoiceOption) => void;
}

const VOICES: { id: VoiceOption; name: string; tag: string; previewUrl: string }[] = [
  {
    id: "s0phbFBBp708ZeIy8oGx",
    name: "Arcadays",
    tag: "Мужской • Теплый, живой (RU/KZ)",
    previewUrl:
      "https://api.us.elevenlabs.io/v1/voices/s0phbFBBp708ZeIy8oGx/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJjdXN0b20iLCJ1c2VyX2lkIjoidXpsSGRDbHgzdGVoTVl1Z3pDMjJ5Zmw4R1duMSIsImZpbGVuYW1lIjoiMTBhZjlkMjMtMDA4ZC00MjNkLTkwZDItM2JkMzk3N2U2YjgxLm1wMyIsInRpbWVzdGFtcCI6MTc4ODU1MjAwMDAwMDAwMH0%3D",
  },
  {
    id: "Jhqrj1kYppTq06Kj3KFa",
    name: "Mishki",
    tag: "Женский • Мягкий, душевный (RU/KZ)",
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/database/user/IetPBzXAXTNaz50V3de9Gn1BiG02/voices/Jhqrj1kYppTq06Kj3KFa/436dcd69-9cbb-4246-a694-9e2d37a6033f.mp3",
  },
  {
    id: "nPczCjzI2devNBz1zQrb",
    name: "Brian",
    tag: "Мужской • Глубокий баритон (RU/KZ)",
    previewUrl:
      "https://api.us.elevenlabs.io/v1/voices/nPczCjzI2devNBz1zQrb/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJwcmVtYWRlIiwiZmlsZW5hbWUiOiIyZGQzZTcyYy00ZmQzLTQyZjEtOTNlYS1hYmM1ZDRlNWFhMWQubXAzIiwidGltZXN0YW1wIjoxNzg4NTUyMDAwMDAwMDAwfQ%3D%3D",
  },
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "George",
    tag: "Мужской • Рассказчик историй (RU/KZ)",
    previewUrl:
      "https://api.us.elevenlabs.io/v1/voices/JBFqnCBsd6RMkjVDRZzb/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJwcmVtYWRlIiwiZmlsZW5hbWUiOiJlNjIwNmQxYS0wNzIxLTQ3ODctYWFmYi0wNmE2ZTcwNWNhYzUubXAzIiwidGltZXN0YW1wIjoxNzg4NTUyMDAwMDAwMDAwfQ%3D%3D",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah",
    tag: "Женский • Уверенный, спокойный (RU/KZ)",
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/01a3e33c-6e99-4ee7-8543-ff2216a32186.mp3",
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    tag: "Мужской • Эпичный нарратор (RU/KZ)",
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/d6905d7a-dd26-4187-bfff-1bd3a5ea7cac.mp3",
  },
];

export const VoiceSelector: React.FC<VoiceSelectorProps> = ({ selectedVoice, onSelectVoice }) => {
  const [lang, setLang] = useState<"ru" | "kz">("ru");
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlaySample = (e: React.MouseEvent, voiceItem: typeof VOICES[0]) => {
    e.stopPropagation();

    if (playingVoice === voiceItem.id) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlayingVoice(null);
      return;
    }

    if (audioRef.current) audioRef.current.pause();

    const audio = new Audio(voiceItem.previewUrl);
    audioRef.current = audio;

    audio.onended = () => setPlayingVoice(null);
    audio.onerror = () => setPlayingVoice(null);

    audio
      .play()
      .then(() => {
        setPlayingVoice(voiceItem.id);
      })
      .catch(() => {
        setPlayingVoice(null);
      });
  };

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <span className="text-sm sm:text-base font-bold text-zinc-100 flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-blue-400" />
          <span>Голос диктора (ElevenLabs v2.5 / v3 Multilingual)</span>
        </span>

        {/* Language selector toggle */}
        <div className="flex items-center rounded-xl bg-zinc-900 border border-white/10 p-1 text-xs sm:text-sm font-semibold shadow-inner">
          <button
            type="button"
            onClick={() => {
              if (playingVoice && audioRef.current) audioRef.current.pause();
              setPlayingVoice(null);
              setLang("ru");
            }}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              lang === "ru"
                ? "bg-blue-600 text-white font-bold shadow-md shadow-blue-600/30"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            RU (Русский)
          </button>
          <button
            type="button"
            onClick={() => {
              if (playingVoice && audioRef.current) audioRef.current.pause();
              setPlayingVoice(null);
              setLang("kz");
            }}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              lang === "kz"
                ? "bg-blue-600 text-white font-bold shadow-md shadow-blue-600/30"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            KZ (Қазақша)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {VOICES.map((v) => {
          const isSelected = selectedVoice === v.id;
          const isPlaying = playingVoice === v.id;

          return (
            <div
              key={v.id}
              onClick={() => onSelectVoice(v.id)}
              className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between gap-3 select-none ${
                isSelected
                  ? "bg-blue-950/40 border-blue-500 ring-2 ring-blue-500/50 shadow-lg shadow-blue-950/50"
                  : "bg-zinc-900/80 border-white/10 hover:border-white/20 hover:bg-zinc-900 text-zinc-400"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className={`text-sm sm:text-base font-bold ${isSelected ? "text-white" : "text-zinc-200"}`}>
                    {v.name}
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5 line-clamp-1">
                    {v.tag}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => handlePlaySample(e, v)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                    isPlaying
                      ? "bg-blue-500 text-white ring-2 ring-blue-400 shadow-md animate-pulse"
                      : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white"
                  }`}
                  title={isPlaying ? "Остановить сэмпл" : "Прослушать образец голоса (15с)"}
                >
                  {isPlaying ? (
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />
                  )}
                </button>
              </div>

              {isSelected && (
                <div className="flex items-center gap-2 text-xs font-bold text-blue-400">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <span>Выбран</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

"use client";

import React, { useState, useRef } from "react";
import { Play, Pause } from "lucide-react";
import { VoiceOption } from "@/lib/types";

interface VoiceSelectorProps {
  selectedVoice: VoiceOption;
  onSelectVoice: (voice: VoiceOption) => void;
}

const VOICES: { id: VoiceOption; name: string; tag: string }[] = [
  { id: "onyx", name: "Onyx", tag: "Мужской • Баритон" },
  { id: "nova", name: "Nova", tag: "Женский • Теплый" },
  { id: "alloy", name: "Alloy", tag: "Нейтральный • Четкий" },
  { id: "echo", name: "Echo", tag: "Мужской • Мягкий" },
  { id: "fable", name: "Fable", tag: "Мужской • Выразительный" },
  { id: "shimmer", name: "Shimmer", tag: "Женский • Эмоциональный" },
];

export const VoiceSelector: React.FC<VoiceSelectorProps> = ({ selectedVoice, onSelectVoice }) => {
  const [lang, setLang] = useState<"ru" | "kz">("ru");
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlaySample = (e: React.MouseEvent, voiceId: VoiceOption) => {
    e.stopPropagation();

    if (playingVoice === voiceId) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlayingVoice(null);
      return;
    }

    if (audioRef.current) audioRef.current.pause();

    const sampleUrl = `/voice-samples/${voiceId}_${lang}.mp3`;
    const audio = new Audio(sampleUrl);
    audioRef.current = audio;

    audio.onended = () => setPlayingVoice(null);
    audio.onerror = () => setPlayingVoice(null);

    audio.play().then(() => {
      setPlayingVoice(voiceId);
    }).catch(() => {
      setPlayingVoice(null);
    });
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-300 font-medium">Голос озвучки</span>

        <div className="flex items-center rounded-md bg-zinc-900 border border-white/10 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => {
              if (playingVoice && audioRef.current) audioRef.current.pause();
              setPlayingVoice(null);
              setLang("ru");
            }}
            className={`px-2 py-0.5 rounded transition-colors ${
              lang === "ru" ? "bg-zinc-100 text-zinc-900 font-medium" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            RU
          </button>
          <button
            type="button"
            onClick={() => {
              if (playingVoice && audioRef.current) audioRef.current.pause();
              setPlayingVoice(null);
              setLang("kz");
            }}
            className={`px-2 py-0.5 rounded transition-colors ${
              lang === "kz" ? "bg-zinc-100 text-zinc-900 font-medium" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            KZ
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1.5">
        {VOICES.map((v) => {
          const isSelected = selectedVoice === v.id;
          const isPlaying = playingVoice === v.id;

          return (
            <div
              key={v.id}
              onClick={() => onSelectVoice(v.id)}
              className={`px-2.5 py-2 rounded-lg border text-left cursor-pointer transition-colors flex items-center justify-between gap-1.5 select-none ${
                isSelected
                  ? "bg-zinc-800 border-zinc-400 text-white"
                  : "bg-zinc-900/60 border-white/[0.08] hover:bg-zinc-900 text-zinc-400"
              }`}
            >
              <div className="truncate">
                <div className={`text-xs truncate ${isSelected ? "text-white font-medium" : "text-zinc-300"}`}>
                  {v.name}
                </div>
                <div className="text-[10px] text-zinc-500 truncate">
                  {v.tag}
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => handlePlaySample(e, v.id)}
                className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                  isPlaying
                    ? "bg-white text-black"
                    : "hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100"
                }`}
                title={isPlaying ? "Остановить" : "Прослушать (15с)"}
              >
                {isPlaying ? <Pause className="w-2.5 h-2.5 fill-current" /> : <Play className="w-2.5 h-2.5 ml-0.5 fill-current" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

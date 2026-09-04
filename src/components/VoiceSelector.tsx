"use client";

import React, { useState, useRef } from "react";
import { Play, Pause, Check } from "lucide-react";
import { VoiceOption } from "@/lib/types";

interface VoiceSelectorProps {
  selectedVoice: VoiceOption;
  onSelectVoice: (voice: VoiceOption) => void;
}

interface VoiceMeta {
  id: VoiceOption;
  name: string;
  gender: "male" | "female";
  descRu: string;
  descKz: string;
}

const VOICES: VoiceMeta[] = [
  { id: "onyx", name: "Onyx", gender: "male", descRu: "Глубокий мужской баритон", descKz: "Қоңыр ер адам дауысы" },
  { id: "nova", name: "Nova", gender: "female", descRu: "Теплый выразительный женский голос", descKz: "Жылы әйел адам дауысы" },
  { id: "alloy", name: "Alloy", gender: "female", descRu: "Сбалансированный нейтральный голос", descKz: "Бейтарап теңгерімді дауыс" },
  { id: "echo", name: "Echo", gender: "male", descRu: "Мягкий повествовательный тембр", descKz: "Жұмсақ баяндау мәнері" },
  { id: "fable", name: "Fable", gender: "male", descRu: "Выразительный артистичный тембр", descKz: "Көркем мәнерлі дауыс" },
  { id: "shimmer", name: "Shimmer", gender: "female", descRu: "Четкий эмоциональный женский голос", descKz: "Анық эмоциялық әйел дауысы" },
];

export const VoiceSelector: React.FC<VoiceSelectorProps> = ({ selectedVoice, onSelectVoice }) => {
  const [lang, setLang] = useState<"ru" | "kz">("ru");
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlaySample = (voiceId: VoiceOption) => {
    if (playingVoice === voiceId) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlayingVoice(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

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
    <div className="space-y-3">
      {/* Header and minimal language toggle */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-zinc-200">
          Голос диктора
        </label>

        <div className="inline-flex rounded-lg p-0.5 bg-zinc-900 border border-white/10 text-xs">
          <button
            type="button"
            onClick={() => {
              if (playingVoice && audioRef.current) audioRef.current.pause();
              setPlayingVoice(null);
              setLang("ru");
            }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              lang === "ru" ? "bg-white text-black font-semibold" : "text-zinc-400 hover:text-white"
            }`}
          >
            🇷🇺 Русский (15с)
          </button>
          <button
            type="button"
            onClick={() => {
              if (playingVoice && audioRef.current) audioRef.current.pause();
              setPlayingVoice(null);
              setLang("kz");
            }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              lang === "kz" ? "bg-white text-black font-semibold" : "text-zinc-400 hover:text-white"
            }`}
          >
            🇰🇿 Қазақша (15с)
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {VOICES.map((v) => {
          const isSelected = selectedVoice === v.id;
          const isPlaying = playingVoice === v.id;

          return (
            <div
              key={v.id}
              onClick={() => onSelectVoice(v.id)}
              className={`p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between select-none ${
                isSelected
                  ? "bg-zinc-800 border-white ring-1 ring-white text-white"
                  : "bg-zinc-900/60 border-white/5 hover:border-white/20 text-zinc-300"
              }`}
            >
              <div className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-white">{v.name}</span>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                <p className="text-[10px] text-zinc-400 line-clamp-1">
                  {lang === "ru" ? v.descRu : v.descKz}
                </p>
              </div>

              {/* Minimal preview button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlaySample(v.id);
                }}
                className={`mt-2 py-1 px-2 rounded-lg text-[10px] font-medium flex items-center justify-center gap-1 transition-colors ${
                  isPlaying
                    ? "bg-emerald-500 text-black font-semibold"
                    : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                }`}
              >
                {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                <span>{isPlaying ? "Стоп" : "Слушать"}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

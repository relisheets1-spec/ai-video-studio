"use client";

import React, { useState, useRef } from "react";
import { Play, Pause, Volume2, Check } from "lucide-react";
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
  {
    id: "onyx",
    name: "Onyx",
    gender: "male",
    descRu: "Глубокий, уверенный баритон. Идеален для документалок и историй.",
    descKz: "Қоңыр, сенімді ер адам дауысы. Деректі фильмдерге мінсіз келеді.",
  },
  {
    id: "nova",
    name: "Nova",
    gender: "female",
    descRu: "Теплый, выразительный женский голос. Живой и вдохновляющий.",
    descKz: "Жылы, әсерлі әйел адам дауысы. Шабыттандыратын және анық.",
  },
  {
    id: "alloy",
    name: "Alloy",
    gender: "female",
    descRu: "Сбалансированный нейтральный тон. Подходит для любых тем.",
    descKz: "Теңгерімді бейтарап дауыс. Кез келген тақырыпқа сәйкес келеді.",
  },
  {
    id: "echo",
    name: "Echo",
    gender: "male",
    descRu: "Мягкий, спокойный повествовательный тембр.",
    descKz: "Жұмсақ, байсалды баяндау мәнері.",
  },
  {
    id: "fable",
    name: "Fable",
    gender: "male",
    descRu: "Артистичный тембр с выразительной интонацией.",
    descKz: "Көркем, мәнерлі интонациясы бар ерекше дауыс.",
  },
  {
    id: "shimmer",
    name: "Shimmer",
    gender: "female",
    descRu: "Звонкий, эмоциональный и четкий женский голос.",
    descKz: "Ашық, эмоциялық және таза әйел дауысы.",
  },
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

    audio.onended = () => {
      setPlayingVoice(null);
    };
    audio.onerror = (e) => {
      console.warn("Audio sample playback error:", e);
      setPlayingVoice(null);
    };

    audio.play().then(() => {
      setPlayingVoice(voiceId);
    }).catch((err) => {
      console.warn("Autoplay block:", err);
      setPlayingVoice(null);
    });
  };

  return (
    <div className="space-y-4">
      {/* Header and Language toggle (M3 Segmented Button) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <label className="text-sm font-medium text-[#E6E0E9] block">
            Голос диктора
          </label>
          <p className="text-xs text-[#938F99]">
            Послушайте 15-секундный образец речи перед выбором
          </p>
        </div>

        {/* M3 Segmented Button */}
        <div className="inline-flex rounded-full p-1 bg-[#2B2930] border border-[#49454F]/40 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              if (playingVoice && audioRef.current) {
                audioRef.current.pause();
                setPlayingVoice(null);
              }
              setLang("ru");
            }}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              lang === "ru"
                ? "bg-[#D0BCFF] text-[#381E72] shadow-sm font-semibold"
                : "text-[#CAC4D0] hover:text-white"
            }`}
          >
            🇷🇺 Русский (15 сек)
          </button>
          <button
            type="button"
            onClick={() => {
              if (playingVoice && audioRef.current) {
                audioRef.current.pause();
                setPlayingVoice(null);
              }
              setLang("kz");
            }}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              lang === "kz"
                ? "bg-[#D0BCFF] text-[#381E72] shadow-sm font-semibold"
                : "text-[#CAC4D0] hover:text-white"
            }`}
          >
            🇰🇿 Қазақша (15 сек)
          </button>
        </div>
      </div>

      {/* Voice cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {VOICES.map((v) => {
          const isSelected = selectedVoice === v.id;
          const isPlaying = playingVoice === v.id;

          return (
            <div
              key={v.id}
              onClick={() => onSelectVoice(v.id)}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between select-none relative ${
                isSelected
                  ? "bg-[#2B2930] border-[#D0BCFF] ring-1 ring-[#D0BCFF]"
                  : "bg-[#1D1B20] border-[#49454F]/40 hover:bg-[#25232A] hover:border-[#938F99]"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-[#E6E0E9]">{v.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#36343B] text-[#CCC2DC]">
                      {v.gender === "male" ? "Мужской" : "Женский"}
                    </span>
                  </div>

                  {isSelected && (
                    <span className="w-5 h-5 rounded-full bg-[#D0BCFF] text-[#381E72] flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </span>
                  )}
                </div>

                <p className="text-xs text-[#938F99] leading-snug line-clamp-2">
                  {lang === "ru" ? v.descRu : v.descKz}
                </p>
              </div>

              {/* Play preview button */}
              <div className="mt-3 pt-2.5 border-t border-[#49454F]/30 flex items-center justify-between">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlaySample(v.id);
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isPlaying
                      ? "bg-[#4F378B] text-[#EADDFF]"
                      : "bg-[#2B2930] hover:bg-[#36343B] text-[#CAC4D0] border border-[#49454F]/50"
                  }`}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5 text-[#D0BCFF]" />
                      <span>Пауза</span>
                      <div className="flex items-end gap-0.5 h-3 ml-1">
                        <span className="w-0.5 bg-[#D0BCFF] m3-bar-1" />
                        <span className="w-0.5 bg-[#D0BCFF] m3-bar-2" />
                        <span className="w-0.5 bg-[#D0BCFF] m3-bar-3" />
                        <span className="w-0.5 bg-[#D0BCFF] m3-bar-4" />
                      </div>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-[#D0BCFF]" />
                      <span>Слушать ({lang === "ru" ? "RU" : "KZ"})</span>
                    </>
                  )}
                </button>

                <span className="text-[11px] font-mono text-[#938F99]">~15с</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

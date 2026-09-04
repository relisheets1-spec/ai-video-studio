"use client";

import React, { useState, useRef } from "react";
import { SpeakerHigh, Play, Pause, User, CheckCircle } from "@phosphor-icons/react";
import { VoiceOption } from "@/lib/types";
import { FlagKZ, FlagRU, IconTile, cn } from "@/components/ui";

interface VoiceSelectorProps {
  selectedVoice: VoiceOption;
  onSelectVoice: (voice: VoiceOption) => void;
  language: "ru" | "kz";
  onLanguageChange: (lang: "ru" | "kz") => void;
}

export interface VoiceItem {
  id: VoiceOption;
  name: string;
  gender: "male" | "female";
  roleTitle: string;
  tag: string;
  previewUrl: string;
  lang: "ru" | "kz";
}

export const VOICES_CONFIG: VoiceItem[] = [
  // Russian voices (Strictly 2: 1 Male, 1 Female)
  {
    id: "s0phbFBBp708ZeIy8oGx",
    name: "Arcadays (Аркадий)",
    gender: "male",
    roleTitle: "Мужской голос",
    tag: "Глубокий, теплый тон • Идеально для триллеров и историй",
    previewUrl: "/audio/samples/arcadays_sample.mp3",
    lang: "ru",
  },
  {
    id: "Jhqrj1kYppTq06Kj3KFa",
    name: "Mishki (Мишки)",
    gender: "female",
    roleTitle: "Женский голос",
    tag: "Бархатный, кинематографичный тембр • Для драмы и детективов",
    previewUrl: "/audio/samples/mishki_sample.mp3",
    lang: "ru",
  },

  // Kazakh voices (Strictly 2: 1 Male, 1 Female)
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "Ерлан (Ер адам)",
    gender: "male",
    roleTitle: "Ер адам дауысы",
    tag: "Шешен, салиқалы баяндаушы • Тарихи және заманауи оқиғаларға",
    previewUrl: "/audio/samples/kz_male_sample.mp3",
    lang: "kz",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Айгерім (Әйел адам)",
    gender: "female",
    roleTitle: "Әйел адам дауысы",
    tag: "Жұмсақ, анық, әсерлі тембр • Драма және кино хикаяларына",
    previewUrl: "/audio/samples/kz_female_sample.mp3",
    lang: "kz",
  },
];

export const VoiceSelector: React.FC<VoiceSelectorProps> = ({
  selectedVoice,
  onSelectVoice,
  language,
  onLanguageChange,
}) => {
  const [playingVoiceKey, setPlayingVoiceKey] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filteredVoices = VOICES_CONFIG.filter((v) => v.lang === language);

  const handlePlaySample = (e: React.MouseEvent, voiceItem: VoiceItem) => {
    e.stopPropagation();
    const voiceKey = `${voiceItem.lang}_${voiceItem.id}_${voiceItem.name}`;

    if (playingVoiceKey === voiceKey) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlayingVoiceKey(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    const audio = new Audio(voiceItem.previewUrl);
    audioRef.current = audio;

    audio.onended = () => setPlayingVoiceKey(null);
    audio.onerror = () => setPlayingVoiceKey(null);

    audio
      .play()
      .then(() => setPlayingVoiceKey(voiceKey))
      .catch(() => setPlayingVoiceKey(null));
  };

  const switchLanguage = (lang: "ru" | "kz") => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlayingVoiceKey(null);
    onLanguageChange(lang);

    // Automatically select the primary voice of chosen language if current isn't valid for that language
    const currentMatchesLang = VOICES_CONFIG.some((v) => v.id === selectedVoice && v.lang === lang);
    if (!currentMatchesLang) {
      const nextDefaultVoice = lang === "kz" ? "JBFqnCBsd6RMkjVDRZzb" : "s0phbFBBp708ZeIy8oGx";
      onSelectVoice(nextDefaultVoice);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <IconTile size="sm">
            <SpeakerHigh size={16} weight="fill" />
          </IconTile>
          <div className="min-w-0">
            <span className="block text-[13px] font-medium text-ink leading-tight">
              Голос диктора
            </span>
          </div>
        </div>

        {/* Переключатель языка. Эмодзи-флаги заменены текстовыми бейджами —
            на Windows они рендерятся пустыми прямоугольниками. */}
        <div
          role="tablist"
          aria-label="Язык озвучки"
          className="inline-flex items-center p-1 rounded-full bg-surface-2 border border-hairline shrink-0"
        >
          {([
            { code: "ru" as const, label: "Русский", Flag: FlagRU },
            { code: "kz" as const, label: "Қазақша", Flag: FlagKZ },
          ]).map((l) => {
            const active = language === l.code;
            return (
              <button
                key={l.code}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchLanguage(l.code)}
                className={cn(
                  "inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full",
                  "text-[12.5px] font-medium transition-colors cursor-pointer",
                  active
                    ? "bg-contrast text-contrast-ink"
                    : "text-muted hover:text-ink"
                )}
              >
                <l.Flag className="w-[18px] h-[13px] rounded-[2px] shrink-0" />
                <span>{l.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filteredVoices.map((v) => {
          const isSelected = selectedVoice === v.id;
          const voiceKey = `${v.lang}_${v.id}_${v.name}`;
          const isPlaying = playingVoiceKey === voiceKey;

          return (
            <div
              key={voiceKey}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => onSelectVoice(v.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectVoice(v.id);
                }
              }}
              className={cn(
                "relative flex items-center justify-between gap-3 p-4 rounded-control border",
                "text-left cursor-pointer select-none transition-colors duration-150",
                isSelected
                  ? "bg-surface-2 border-accent"
                  : "bg-surface border-hairline hover:border-hairline-strong hover:bg-surface-2"
              )}
            >
              <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-medium",
                      isSelected
                        ? "bg-contrast text-contrast-ink"
                        : "bg-surface-3 text-muted"
                    )}
                  >
                    <User size={11} />
                    {v.roleTitle}
                  </span>

                  {isSelected && (
                    <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-accent">
                      <CheckCircle size={14} weight="fill" />
                      Выбран
                    </span>
                  )}
                </div>

                <div className="text-[14.5px] font-semibold text-ink truncate">
                  {v.name}
                </div>


              </div>

              <button
                type="button"
                onClick={(e) => handlePlaySample(e, v)}
                title={isPlaying ? "Остановить прослушивание" : "Прослушать сэмпл голоса"}
                aria-label={isPlaying ? "Остановить прослушивание" : "Прослушать сэмпл голоса"}
                className={cn(
                  "w-12 h-12 shrink-0 rounded-control border",
                  "flex flex-col items-center justify-center gap-0.5",
                  "transition-colors cursor-pointer",
                  // Лайм ЗАЛИВКОЙ с тёмным глифом — 12.5:1 в обеих темах.
                  // Обратный вариант (лаймовый глиф на контрастной плитке)
                  // в тёмной теме давал 1.36:1.
                  isPlaying || isSelected
                    ? "bg-accent text-accent-ink border-transparent"
                    : "bg-surface-2 text-muted border-hairline hover:text-ink hover:border-hairline-strong"
                )}
              >
                {isPlaying ? (
                  <Pause size={17} weight="fill" />
                ) : (
                  <Play size={17} weight="fill" className="ml-0.5" />
                )}
                <span className="text-[9.5px] font-semibold uppercase tracking-wide">
                  {isPlaying ? "Стоп" : "Сэмпл"}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

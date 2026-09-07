"use client";

import type React from "react";
import {
  BookOpen,
  Compass,
  FilmStrip,
  Heart,
  Lightning,
  MagnifyingGlass,
  Rocket,
  Scroll,
  Smiley,
} from "@phosphor-icons/react";

/**
 * Реестр иконок для каталогов контента. Жанры хранят имя иконки
 * строкой (их читают серверные роуты, которым React не нужен), а компонент
 * подбирается здесь. Неизвестное имя — FilmStrip, а не падение.
 */
const CONTENT_ICONS: Record<string, React.ElementType> = {
  BookOpen,
  Compass,
  FilmStrip,
  Heart,
  Lightning,
  MagnifyingGlass,
  Rocket,
  Scroll,
  Smiley,
};

export function iconFor(name: string): React.ElementType {
  return CONTENT_ICONS[name] || FilmStrip;
}

"use client";

import type React from "react";
import {
  BookOpen,
  Compass,
  Eye,
  FilmStrip,
  Gavel,
  Ghost,
  HandHeart,
  Heart,
  IdentificationCard,
  Lightning,
  MagnifyingGlass,
  MoonStars,
  Mountains,
  Rocket,
  Scroll,
  Smiley,
  Sword,
} from "@phosphor-icons/react";

/**
 * Реестр иконок для каталогов контента. Жанры хранят имя иконки
 * строкой (их читают серверные роуты, которым React не нужен), а компонент
 * подбирается здесь. Неизвестное имя — FilmStrip, а не падение.
 */
const CONTENT_ICONS: Record<string, React.ElementType> = {
  BookOpen,
  Compass,
  Eye,
  FilmStrip,
  Gavel,
  Ghost,
  HandHeart,
  Heart,
  IdentificationCard,
  Lightning,
  MagnifyingGlass,
  MoonStars,
  Mountains,
  Rocket,
  Scroll,
  Smiley,
  Sword,
};

export function iconFor(name: string): React.ElementType {
  return CONTENT_ICONS[name] || FilmStrip;
}

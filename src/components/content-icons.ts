"use client";

import type React from "react";
import {
  Archive,
  BookOpen,
  ChatCircleDots,
  Circuitry,
  Compass,
  Cube,
  Detective,
  Drop,
  Eye,
  Feather,
  FilmSlate,
  FilmStrip,
  Gavel,
  Gear,
  Ghost,
  HandHeart,
  Heart,
  IdentificationCard,
  Lightning,
  MagnifyingGlass,
  MoonStars,
  Mountains,
  PaintBrush,
  Palette,
  Pencil,
  Radio,
  Rocket,
  Scroll,
  Smiley,
  Sparkle,
  Stamp,
  Sun,
  Sword,
  VinylRecord,
} from "@phosphor-icons/react";

/**
 * Реестр иконок для каталогов контента. Жанры и стили хранят имя иконки
 * строкой (их читают серверные роуты, которым React не нужен), а компонент
 * подбирается здесь. Неизвестное имя — FilmStrip, а не падение.
 */
export const CONTENT_ICONS: Record<string, React.ElementType> = {
  Archive,
  BookOpen,
  ChatCircleDots,
  Circuitry,
  Compass,
  Cube,
  Detective,
  Drop,
  Eye,
  Feather,
  FilmSlate,
  FilmStrip,
  Gavel,
  Gear,
  Ghost,
  HandHeart,
  Heart,
  IdentificationCard,
  Lightning,
  MagnifyingGlass,
  MoonStars,
  Mountains,
  PaintBrush,
  Palette,
  Pencil,
  Radio,
  Rocket,
  Scroll,
  Smiley,
  Sparkle,
  Stamp,
  Sun,
  Sword,
  VinylRecord,
};

export function iconFor(name: string): React.ElementType {
  return CONTENT_ICONS[name] || FilmStrip;
}

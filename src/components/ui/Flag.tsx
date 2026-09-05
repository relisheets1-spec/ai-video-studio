"use client";

import React from "react";

/**
 * Флаги нарисованы SVG, а не эмодзи: Windows не поставляет глифы
 * региональных индикаторов, и 🇷🇺 / 🇰🇿 там показываются пустыми
 * прямоугольниками или парой букв.
 */
export const FlagRU: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 21 15" className={className} aria-hidden="true">
    <rect width="21" height="15" rx="2" fill="#fff" />
    <path fill="#0039A6" d="M0 5h21v5H0z" />
    <path fill="#D52B1E" d="M0 10h21v3a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-3Z" />
    <rect width="21" height="15" rx="2" fill="none" stroke="rgb(0 0 0 / 0.12)" />
  </svg>
);

export const FlagKZ: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 21 15" className={className} aria-hidden="true">
    <rect width="21" height="15" rx="2" fill="#00AFCA" />
    {/* солнце с лучами */}
    <g fill="#FEC50C">
      <circle cx="11" cy="6.6" r="2.5" />
      {Array.from({ length: 16 }).map((_, i) => {
        const a = (i * Math.PI * 2) / 16;
        return (
          <rect
            key={i}
            x={10.75}
            y={2.5}
            width={0.5}
            height={1.3}
            rx={0.25}
            transform={`rotate(${(a * 180) / Math.PI} 11 6.6)`}
          />
        );
      })}
      {/* силуэт беркута */}
      <path d="M5.6 10.6c1.4-.7 2.6-.9 3.5-.5.5.2.9.5 1.2.9h1.4c.3-.4.7-.7 1.2-.9.9-.4 2.1-.2 3.5.5-1.3-.1-2.3.1-3 .6-.4.3-.7.6-.9 1h-2.1c-.2-.4-.5-.7-.9-1-.7-.5-1.7-.7-3-.6Z" />
      {/* национальный орнамент у древка */}
      <g opacity="0.95">
        <rect x="1.1" y="3" width="0.75" height="1.6" rx="0.35" />
        <rect x="1.1" y="5.4" width="0.75" height="1.6" rx="0.35" />
        <rect x="1.1" y="7.8" width="0.75" height="1.6" rx="0.35" />
        <rect x="1.1" y="10.2" width="0.75" height="1.6" rx="0.35" />
      </g>
    </g>
    <rect width="21" height="15" rx="2" fill="none" stroke="rgb(0 0 0 / 0.12)" />
  </svg>
);

/** Юнион Джек: язык English принято обозначать британским флагом. */
export const FlagEN: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 21 15" className={className} aria-hidden="true">
    <defs>
      <clipPath id="flag-en-clip">
        <rect width="21" height="15" rx="2" />
      </clipPath>
    </defs>
    <g clipPath="url(#flag-en-clip)">
      <rect width="21" height="15" fill="#012169" />
      {/* белый косой крест */}
      <path d="M0 0 21 15M21 0 0 15" stroke="#FFF" strokeWidth="3" />
      {/* красный косой крест */}
      <path d="M0 0 21 15M21 0 0 15" stroke="#C8102E" strokeWidth="1.6" />
      {/* белый прямой крест */}
      <path d="M10.5 0v15M0 7.5h21" stroke="#FFF" strokeWidth="5" />
      {/* красный прямой крест */}
      <path d="M10.5 0v15M0 7.5h21" stroke="#C8102E" strokeWidth="3" />
    </g>
    <rect width="21" height="15" rx="2" fill="none" stroke="rgb(0 0 0 / 0.12)" />
  </svg>
);

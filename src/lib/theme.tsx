"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type ThemeMode = "light" | "dark" | "system";

const KEY = "ai_video_theme";

interface ThemeCtx {
  /** Что выбрал пользователь. "system" — следовать за ОС. */
  mode: ThemeMode;
  /** Что реально нарисовано сейчас. */
  resolved: "light" | "dark";
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({
  mode: "system",
  resolved: "dark",
  setMode: () => {},
  toggle: () => {},
});

const prefersDark = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

const apply = (m: ThemeMode): "light" | "dark" => {
  const next = m === "system" ? (prefersDark() ? "dark" : "light") : m;
  document.documentElement.setAttribute("data-theme", next);
  return next;
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("dark");

  // Скрипт в <head> уже поставил атрибут до первой отрисовки —
  // здесь только синхронизируем состояние React с тем, что уже на экране.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(KEY);
    } catch {
      /* localStorage недоступен в приватном режиме — молча живём на системной теме */
    }
    const m: ThemeMode =
      stored === "light" || stored === "dark" ? stored : "system";
    setModeState(m);
    setResolved(
      (document.documentElement.getAttribute("data-theme") as
        | "light"
        | "dark") || apply(m)
    );
  }, []);

  // Если пользователь на "system", следим за сменой темы в ОС.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (mode === "system") setResolved(apply("system"));
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    setResolved(apply(m));
    try {
      if (m === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, m);
    } catch {
      /* запись недоступна — тема продержится до перезагрузки */
    }
  }, []);

  const toggle = useCallback(() => {
    const current =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "dark"
        : "light";
    setMode(current === "dark" ? "light" : "dark");
  }, [setMode]);

  return (
    <Ctx.Provider value={{ mode, resolved, setMode, toggle }}>
      {children}
    </Ctx.Provider>
  );
}

export const useTheme = () => useContext(Ctx);

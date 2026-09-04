"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import { CheckCircle, WarningCircle, X } from "@phosphor-icons/react";
import { cn } from "./cn";

type Tone = "ok" | "danger";
interface Item {
  id: number;
  tone: Tone;
  text: string;
}

const Ctx = createContext<{
  notify: (text: string, tone?: Tone) => void;
}>({ notify: () => {} });

export const useToast = () => useContext(Ctx);

/** Заменяет нативные alert() — они блокируют поток и выглядят чужеродно. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);

  const dismiss = useCallback(
    (id: number) => setItems((l) => l.filter((i) => i.id !== id)),
    []
  );

  const notify = useCallback(
    (text: string, tone: Tone = "ok") => {
      const id = Date.now() + Math.random();
      setItems((l) => [...l, { id, tone, text }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss]
  );

  return (
    <Ctx.Provider value={{ notify }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 w-[min(360px,calc(100vw-2.5rem))]">
        {items.map((i) => (
          <div
            key={i.id}
            role="status"
            className={cn(
              "flex items-start gap-2.5 rounded-control px-3.5 py-3 shadow-lift",
              "text-[13px] leading-snug animate-fade-in border",
              i.tone === "ok"
                ? "bg-surface border-hairline text-ink"
                : "bg-danger-soft border-transparent text-danger-text"
            )}
          >
            {i.tone === "ok" ? (
              <CheckCircle size={18} className="shrink-0 mt-px text-accent" />
            ) : (
              <WarningCircle size={18} className="shrink-0 mt-px" />
            )}
            <span className="flex-1 min-w-0">{i.text}</span>
            <button
              type="button"
              onClick={() => dismiss(i.id)}
              aria-label="Закрыть"
              className="shrink-0 opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

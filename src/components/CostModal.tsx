"use client";

import React from "react";
import { Receipt } from "@phosphor-icons/react";
import { Badge, IconTile, Modal } from "@/components/ui";
import type { VideoCost } from "@/lib/pricing";
import { PRICING_AS_OF } from "@/lib/pricing";
import { costRows, formatInt, formatUsd, scenarioTotals } from "@/lib/cost-format";

interface CostModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  cost: VideoCost | null;
}

/** Детальная стоимость фильма: по статьям и по трём сценариям ElevenLabs. */
export const CostModal: React.FC<CostModalProps> = ({ open, onClose, title, cost }) => {
  if (!cost) return null;
  const rows = costRows(cost);
  const scenarios = scenarioTotals(cost);
  const t = cost.tts;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Стоимость фильма"
      hint={title}
      icon={
        <IconTile size="md">
          <Receipt size={20} weight="fill" />
        </IconTile>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-[640px] text-left border-collapse text-[13px]">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint border-b border-hairline">
                <th className="py-2 pr-3 font-semibold">Статья</th>
                <th className="py-2 pr-3 font-semibold">Модель</th>
                <th className="py-2 pr-3 font-semibold">Количество</th>
                <th className="py-2 pr-3 font-semibold">Цена</th>
                <th className="py-2 font-semibold text-right">Сумма</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((r) => (
                <tr key={r.item} className="align-top">
                  <td className="py-2.5 pr-3 font-medium text-ink">{r.item}</td>
                  <td className="py-2.5 pr-3 font-mono text-[12px] text-muted">{r.model}</td>
                  <td className="py-2.5 pr-3 text-muted tabular">
                    {r.quantity}
                    {r.note && <div className="text-[11.5px] text-faint">{r.note}</div>}
                  </td>
                  <td className="py-2.5 pr-3 text-muted tabular whitespace-nowrap">{r.price}</td>
                  <td className="py-2.5 text-right font-semibold text-ink tabular whitespace-nowrap">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {scenarios.map((s, i) => (
            <div
              key={s.id}
              className={
                "rounded-control border p-3.5 " +
                (i === 0 ? "border-accent bg-surface-2" : "border-hairline bg-surface")
              }
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[12.5px] font-medium text-ink leading-tight">{s.label}</span>
                {i === 0 && <Badge tone="accent">ваш тариф</Badge>}
              </div>
              <div className="text-[22px] font-bold tracking-tight tabular text-ink">{formatUsd(s.totalUsd)}</div>
              <div className="text-[12px] text-muted tabular mt-0.5">озвучка {formatUsd(s.ttsUsd)}</div>
              <div className="text-[11.5px] text-faint leading-snug mt-1.5">{s.hint}</div>
            </div>
          ))}
        </div>

        <div className="text-[12.5px] text-muted leading-relaxed flex flex-col gap-1">
          {t.creditsBefore !== null && t.creditsAfter !== null && (
            <div>
              Кредиты ElevenLabs до → после:{" "}
              <span className="tabular text-ink">
                {formatInt(t.creditsBefore)} → {formatInt(t.creditsAfter)}
              </span>
              {t.creditsSpent !== null && (
                <>
                  {" "}
                  (списано <span className="tabular text-ink">{formatInt(t.creditsSpent)}</span>
                  {t.characterLimit ? ` из ${formatInt(t.characterLimit)}` : ""})
                </>
              )}
            </div>
          )}
          {t.credits > 0 && (
            <div>
              Точность: {t.creditsSource === "history" ? `по истории запросов ElevenLabs (${t.historyMatched} из ${t.frames})` : "по числу символов, история недоступна"}.
            </div>
          )}
          {t.keyOwner === "env" && <div>Озвучка шла с ключа владельца сайта, а не с вашего.</div>}
          {t.fallbackFrames > 0 && <div>Кадров на запасном голосе OpenAI: {t.fallbackFrames}.</div>}
          <div className="text-faint">Цены проверены {PRICING_AS_OF}; рассчитано {new Date(cost.computedAt).toLocaleString("ru-RU")}.</div>
        </div>
      </div>
    </Modal>
  );
};

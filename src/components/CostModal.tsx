"use client";

import React from "react";
import { Receipt } from "@phosphor-icons/react";
import { IconTile, Modal } from "@/components/ui";
import { normalizeCost, PRICING_AS_OF } from "@/lib/pricing";
import { costRows, formatInt, formatUsd, planNote } from "@/lib/cost-format";

interface CostModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Запись cost из базы любой версии — приводится к текущей форме на месте. */
  cost: unknown;
}

/**
 * Детальная стоимость фильма: одна таблица по статьям с расчётом и итогом.
 * Тариф ElevenLabs один — Starter + Pay As You Go, сравнения тарифов нет.
 */
export const CostModal: React.FC<CostModalProps> = ({ open, onClose, title, cost: raw }) => {
  const cost = normalizeCost(raw);
  if (!cost) return null;
  const rows = costRows(cost);
  const t = cost.tts;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Стоимость фильма"
      hint={title}
      icon={
        <IconTile size="md">
          <Receipt size={20} weight="fill" />
        </IconTile>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Таблица во всю ширину модалки; ячейки переносятся, прокрутки нет. */}
        <table className="w-full text-left border-collapse text-[13px] table-fixed">
          <colgroup>
            <col className="w-[16%]" />
            <col className="w-[17%]" />
            <col className="w-[22%]" />
            <col className="w-[17%]" />
            <col className="w-[18%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint border-b border-hairline">
              <th className="py-2 pr-3 font-semibold">Статья</th>
              <th className="py-2 pr-3 font-semibold">Модель</th>
              <th className="py-2 pr-3 font-semibold">Количество</th>
              <th className="py-2 pr-3 font-semibold">Цена</th>
              <th className="py-2 pr-3 font-semibold">Расчёт</th>
              <th className="py-2 font-semibold text-right">Сумма</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((r) => (
              <tr key={r.item} className="align-top">
                <td className="py-2.5 pr-3 font-medium text-ink">{r.item}</td>
                <td className="py-2.5 pr-3 font-mono text-[12px] text-muted break-words">{r.model}</td>
                <td className="py-2.5 pr-3 text-muted tabular">
                  {r.quantity}
                  {r.note && <div className="text-[11.5px] text-faint">{r.note}</div>}
                </td>
                <td className="py-2.5 pr-3 text-muted tabular">{r.price}</td>
                <td className="py-2.5 pr-3 text-muted tabular">{r.math}</td>
                <td className="py-2.5 text-right font-semibold text-ink tabular whitespace-nowrap">{r.total}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-hairline-strong">
              <td colSpan={5} className="pt-3 text-[14px] font-semibold text-ink">
                Итого за фильм
              </td>
              <td className="pt-3 text-right text-[18px] font-bold tracking-tight tabular text-ink whitespace-nowrap">
                {formatUsd(cost.totalUsd)}
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="text-[12.5px] text-muted leading-relaxed flex flex-col gap-1">
          <div>{planNote()}</div>
          {t.credits > 0 && (
            <div>
              Списано кредитов ElevenLabs: <span className="tabular text-ink">{formatInt(t.credits)}</span>
              {" — "}
              {t.creditsSource === "history"
                ? `точно, по истории запросов (${t.historyMatched} из ${t.frames})`
                : "по числу символов, история недоступна"}
              .
            </div>
          )}
          {t.creditsBefore !== null && t.creditsAfter !== null && (
            <div className="text-faint">
              Счётчик аккаунта до → после: {formatInt(t.creditsBefore)} → {formatInt(t.creditsAfter)}
              {t.creditsSpent !== null && t.creditsSpent !== t.credits
                ? ` (счётчик ElevenLabs обновляется с задержкой, поэтому разница ${formatInt(t.creditsSpent)} может отличаться)`
                : ""}
              .
            </div>
          )}
          {t.keyOwner === "env" && <div>Озвучка шла с ключа владельца сайта, а не с вашего.</div>}
          <div className="text-faint">
            Цены проверены {PRICING_AS_OF}; рассчитано {new Date(cost.computedAt).toLocaleString("ru-RU")}.
          </div>
        </div>
      </div>
    </Modal>
  );
};

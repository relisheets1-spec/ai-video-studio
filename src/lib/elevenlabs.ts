/**
 * Серверный клиент ElevenLabs: синтез, остаток кредитов, точный расход по истории.
 */

const BASE = "https://api.elevenlabs.io/v1";

export type SynthResult =
  | { ok: true; buffer: Buffer; requestId: string | null }
  | { ok: false; status: number; body: string };

export async function synthesize(
  apiKey: string,
  voiceId: string,
  payload: Record<string, unknown>
): Promise<SynthResult> {
  const res = await fetch(`${BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, body: (await res.text()).slice(0, 300) };
  }
  return {
    ok: true,
    buffer: Buffer.from(await res.arrayBuffer()),
    requestId: res.headers.get("request-id"),
  };
}

export interface SubscriptionInfo {
  characterCount: number;
  characterLimit: number;
  tier: string;
  nextResetUnix: number | null;
}

/** Остаток кредитов. null при любой ошибке — учёт не должен ронять генерацию. */
export async function fetchSubscription(apiKey: string): Promise<SubscriptionInfo | null> {
  try {
    const res = await fetch(`${BASE}/user/subscription`, {
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const s = await res.json();
    return {
      characterCount: Number(s.character_count) || 0,
      characterLimit: Number(s.character_limit) || 0,
      tier: String(s.tier || ""),
      nextResetUnix: Number(s.next_character_count_reset_unix) || null,
    };
  } catch {
    return null;
  }
}

/**
 * Точные списания по request_id: у каждого элемента истории есть
 * character_count_change_from / _to. Идём страницами по 100 от момента
 * старта генерации, останавливаемся, когда все id найдены.
 */
export async function fetchHistoryCredits(
  apiKey: string,
  opts: { sinceUnix: number; requestIds: string[] }
): Promise<Map<string, number>> {
  const wanted = new Set(opts.requestIds.filter(Boolean));
  const found = new Map<string, number>();
  if (wanted.size === 0) return found;

  let cursor: string | null = null;
  for (let page = 0; page < 5 && found.size < wanted.size; page++) {
    const params = new URLSearchParams({
      page_size: "100",
      source: "TTS",
      date_after_unix: String(Math.max(0, Math.floor(opts.sinceUnix) - 120)),
    });
    if (cursor) params.set("start_after_history_item_id", cursor);
    let data: any;
    try {
      const res = await fetch(`${BASE}/history?${params.toString()}`, {
        headers: { "xi-api-key": apiKey },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) break;
      data = await res.json();
    } catch {
      break;
    }
    const items: any[] = Array.isArray(data?.history) ? data.history : [];
    for (const item of items) {
      const id = item?.request_id;
      if (id && wanted.has(id) && !found.has(id)) {
        const from = Number(item.character_count_change_from);
        const to = Number(item.character_count_change_to);
        if (Number.isFinite(from) && Number.isFinite(to)) found.set(id, Math.max(0, to - from));
      }
    }
    if (!data?.has_more || !data?.last_history_item_id) break;
    cursor = data.last_history_item_id;
  }
  return found;
}

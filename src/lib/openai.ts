import OpenAI from "openai";

/**
 * Клиент OpenAI создаётся на каждый запрос с ключом пользователя: все расходы
 * на тексты и картинки идут с его счёта, общего ключа у сервера нет.
 */
export function openaiFor(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

/** Ключ OpenAI: печатные ASCII без пробелов, начинается с sk-. */
export function validateOpenAiKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  if (key.length < 20 || key.length > 300 || !/^sk-[\x21-\x7e]+$/.test(key)) return null;
  return key;
}

/** Дешёвая проверка ключа: список моделей ничего не стоит. */
export async function probeOpenAiKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.openai.com/v1/models?limit=1", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

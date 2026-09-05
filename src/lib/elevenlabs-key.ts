/** Ключ ElevenLabs: печатные ASCII без пробелов, разумная длина. */
export function validateElevenLabsKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  if (key.length < 20 || key.length > 200 || !/^[\x21-\x7e]+$/.test(key)) return null;
  return key;
}

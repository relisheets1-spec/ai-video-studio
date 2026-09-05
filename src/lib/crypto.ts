import crypto from "node:crypto";

/**
 * Единый криптографический слой: подписанные токены сессий, хэши кодов входа
 * и шифрование пользовательских ключей ElevenLabs.
 *
 * Все ключи выводятся из SESSION_SECRET с доменным разделением: подпись
 * пользовательской сессии никогда не пройдёт как подпись админской, а ключ
 * шифрования не совпадает ни с одной из них.
 */

export type KeyPurpose =
  | "user-session"
  | "admin-session"
  | "elevenlabs-key"
  | "login-code"
  | "site-gate";

function masterSecret(): string {
  const key = process.env.SESSION_SECRET;
  if (!key || key.length < 16) {
    throw new Error("SESSION_SECRET не задан (нужно не меньше 16 символов) — подпись сессий и шифрование отключены");
  }
  return key;
}

export function deriveKey(purpose: KeyPurpose): Buffer {
  return crypto.createHash("sha256").update(`${masterSecret()}\0${purpose}`).digest();
}

export function hmacHex(purpose: KeyPurpose, data: string): string {
  return crypto.createHmac("sha256", deriveKey(purpose)).update(data).digest("hex");
}

/** Сравнение hex-строк за постоянное время. */
export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length > 0 && ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Сравнение произвольных строк за постоянное время (коды, пароли). */
export function safeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    // Всё равно делаем одно сравнение, чтобы время не выдавало длину.
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

export function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function fromB64url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

// ---------------------------------------------------------------------------
// Подписанные токены: <prefix><b64url(JSON)>.<hmac hex>
// ---------------------------------------------------------------------------

export function signToken(prefix: string, purpose: KeyPurpose, payload: Record<string, unknown>): string {
  const body = b64url(JSON.stringify(payload));
  return `${prefix}${body}.${hmacHex(purpose, body)}`;
}

/** Возвращает payload, если подпись верна и срок (exp, мс) не истёк. */
export function verifyToken<T extends { exp: number }>(
  token: string | null | undefined,
  prefix: string,
  purpose: KeyPurpose
): T | null {
  if (!token || !token.startsWith(prefix)) return null;
  const [body, signature] = token.slice(prefix.length).split(".");
  if (!body || !signature) return null;

  let expected: string;
  try {
    expected = hmacHex(purpose, body);
  } catch {
    return null;
  }
  if (!safeEqualHex(signature, expected)) return null;

  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as T;
    if (typeof payload?.exp !== "number" || Date.now() >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Шифрование секретов пользователя (AES-256-GCM)
// ---------------------------------------------------------------------------

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey("elevenlabs-key"), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${b64url(iv)}.${b64url(ciphertext)}.${b64url(tag)}`;
}

/** null при пустом значении, чужом формате или несовпадении auth-тега — никогда не бросает. */
export function decryptSecret(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null;
  const parts = encrypted.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey("elevenlabs-key"), fromB64url(parts[1]));
    decipher.setAuthTag(fromB64url(parts[3]));
    return Buffer.concat([decipher.update(fromB64url(parts[2])), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

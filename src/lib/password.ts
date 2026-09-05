import crypto from "node:crypto";
import { b64url, fromB64url } from "./crypto";

/** Хэш пароля администратора: scrypt с солью, формат "scrypt$<salt>$<hash>". */
export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, 32);
  return `scrypt$${b64url(salt)}$${b64url(hash)}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = fromB64url(parts[1]);
    const expected = fromB64url(parts[2]);
    const actual = crypto.scryptSync(plain, salt, expected.length);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

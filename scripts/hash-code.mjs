#!/usr/bin/env node
/**
 * Хэш кода администратора для ADMIN_CODE_HASH:
 *
 *   node scripts/hash-code.mjs "мой код"
 *
 * Сам код нигде не сохраняется — только этот хэш в /etc/studio.env и .env.local.
 */
import crypto from "node:crypto";

const plain = process.argv.slice(2).join(" ");
if (!plain) {
  console.error('Использование: node scripts/hash-code.mjs "код"');
  process.exit(1);
}
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(plain, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const b64 = (b) => Buffer.from(b).toString("base64url");
console.log(`ADMIN_CODE_HASH=scrypt$${b64(salt)}$${b64(hash)}`);

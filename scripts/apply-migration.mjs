#!/usr/bin/env node
/**
 * Применяет SQL-файл к базе Supabase через Management API.
 *
 *   node scripts/apply-migration.mjs supabase/migrations/0002_email_auth_admins.sql
 *
 * Нужны SUPABASE_ACCESS_TOKEN (sbp_…) и SUPABASE_PROJECT_ID в .env.local или в окружении.
 * Миграции написаны идемпотентно, повторный запуск безопасен.
 */
import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_0-9]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  loadEnvLocal();
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_ID;
  const file = process.argv[2];

  if (!token || !ref) {
    console.error("SUPABASE_ACCESS_TOKEN и SUPABASE_PROJECT_ID обязательны");
    process.exit(1);
  }
  if (!file) {
    console.error("Укажите путь к SQL-файлу");
    process.exit(1);
  }

  const sql = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "ai-video-studio-migrate/1.0",
    },
    body: JSON.stringify({ query: sql }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${text}`);
    process.exit(1);
  }
  console.log(`OK ${path.basename(file)}: HTTP ${res.status}`);
  if (text && text !== "[]") console.log(text.slice(0, 2000));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
